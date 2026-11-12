-- F68 — as contas de lib/metrics que o levantamento das regras achou erradas
-- (C44, C49, C6/C45). Prova: e2e/indicadores-f68-contas.spec.ts.

-- ─── C44a: o ticket médio não fica negativo com o estorno de outro período ───
-- O numerador somava o pago de TODAS as clientes, e o denominador contava só
-- as que pagaram mais que zero: em novembro, B paga R$ 500 e o pagamento de
-- outubro de A (R$ 1.000) é estornado → (500 − 1.000) ÷ 1 = −R$ 500. O pago do
-- ticket é o das clientes que pagaram (as do denominador). O estorno segue
-- descontado da receita do período (a regra do caixa não muda).
create or replace function public.metrics_ticket_medio(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(branch_id uuid, pago numeric, clientes bigint)
 language sql
 stable
 set search_path to ''
as $function$
  with r as (
    select t.branch_id, t.client_id, sum(t.amount) as pago
      from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t
     where t.client_id is not null
     group by t.branch_id, t.client_id
  )
  (select r.branch_id, coalesce(sum(r.pago) filter (where r.pago > 0), 0), count(*) filter (where r.pago > 0)
     from r
    group by r.branch_id)
  union all
  (select null::uuid, coalesce(sum(c.pago) filter (where c.pago > 0), 0), count(*) filter (where c.pago > 0)
     from (select r.client_id, sum(r.pago) as pago from r group by r.client_id) c)
$function$;

-- ─── C44b: a taxa do estorno é a GRAVADA no pagamento ────────────────────────
-- A taxa que a venda no cartão gravou nas parcelas da operadora, na proporção
-- de `p_valor` sobre o que a venda valia (o original das parcelas). O estorno
-- reduz o `valor` das parcelas (e a `taxa` gerada delas): por isso a conta parte
-- do ORIGINAL (`valor_original`, `taxa_pct`, a sobra do arredondamento). Nulo
-- sem parcelas (débito, Pix, o crédito de antes) — quem chama cai na
-- configuração. Positivo para o pagamento, negativo para o estorno.
create or replace function private.taxa_gravada_do_cartao(p_transacao uuid, p_valor numeric)
 returns numeric
 language sql
 stable
 set search_path to ''
as $function$
  select case when sum(r.valor_original) > 0
              then round(sum(round(r.valor_original * r.taxa_pct / 100, 2) + coalesce(r.taxa_sobra, 0))
                         * p_valor / sum(r.valor_original), 2) end
    from public.recebiveis_do_cartao r
   where r.transaction_id = p_transacao
$function$;
revoke execute on function private.taxa_gravada_do_cartao(uuid, numeric) from public, anon, authenticated;

create or replace function public.metrics_custos_da_venda(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(branch_id uuid, taxas_da_maquininha numeric, comissoes numeric, despesa_de_comissoes numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  parcelas as (
    -- As taxas: a GRAVADA nas parcelas da operadora (C44b: o estorno a acha
    -- pelo `estorno_de`, e o pagamento conta a dele inteira, não a que sobrou
    -- depois do estorno); sem parcelas, a da configuração.
    select r.branch_id,
           coalesce(
             private.taxa_gravada_do_cartao(coalesce(r.estorno_de, r.id), r.amount),
             case when r.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                  then round(r.amount * private.comissao_taxa_pct(p_tenant, r.payment_method::text,
                         coalesce(r.cartao_vezes, r.parcela_total, 1), r.cartao_bandeira, r.maquininha_id) / 100, 2)
                  else 0 end
           ) as taxa,
           0::numeric as comissao, 0::numeric as despesa
      from public.metrics_receitas_pagas(p_tenant, coalesce((select array_agg(id) from scope), '{}'::uuid[]), p_from, p_to, p_professional_id) r
     where r.amount <> 0
    union all
    -- As comissões LANÇADAS no período (o extrato: liberação, ajuste, estorno).
    select c.branch_id, 0::numeric, c.amount, 0::numeric
      from public.commissions c
      join scope s on s.id = c.branch_id
     where c.released_at between p_from and p_to
       and (p_professional_id is null or c.professional_id = p_professional_id)
    union all
    -- A despesa paga do fechamento das comissões: fica no caixa, sai do lucro.
    select t.branch_id, 0::numeric, 0::numeric, t.amount
      from public.metrics_movimentos_pagos(p_tenant, coalesce((select array_agg(id) from scope), '{}'::uuid[]), p_from, p_to) t
     where t.type = 'EXPENSE'
       and lower(btrim(coalesce(t.category, ''))) = 'comissões'
       and p_professional_id is null
  )
  select x.branch_id, coalesce(sum(x.taxa), 0), coalesce(sum(x.comissao), 0), coalesce(sum(x.despesa), 0)
    from parcelas x
   group by grouping sets ((x.branch_id), ())
$function$;

create or replace function public.metrics_series_dos_custos_da_venda(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text default 'day'::text, p_professional_id uuid default null::uuid)
 returns table(bucket timestamp with time zone, taxas_da_maquininha numeric, comissoes numeric, despesa_de_comissoes numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  gran as (
    select case when p_granularity in ('hour', 'day', 'week', 'month') then p_granularity else 'day' end as g
  ),
  parcelas as (
    select date_trunc((select g from gran), coalesce(r.paid_at, r.created_at) at time zone public.fuso_da_unidade(r.branch_id)) at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)) as bucket,
           coalesce(
             private.taxa_gravada_do_cartao(coalesce(r.estorno_de, r.id), r.amount),
             case when r.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                  then round(r.amount * private.comissao_taxa_pct(p_tenant, r.payment_method::text,
                         coalesce(r.cartao_vezes, r.parcela_total, 1), r.cartao_bandeira, r.maquininha_id) / 100, 2)
                  else 0 end
           ) as taxa,
           0::numeric as comissao, 0::numeric as despesa
      from public.metrics_receitas_pagas(p_tenant, coalesce((select array_agg(id) from scope), '{}'::uuid[]), p_from, p_to, p_professional_id) r
     where r.amount <> 0
    union all
    select date_trunc((select g from gran), c.released_at at time zone public.fuso_da_unidade(c.branch_id)) at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)),
           0::numeric, c.amount, 0::numeric
      from public.commissions c
      join scope s on s.id = c.branch_id
     where c.released_at between p_from and p_to
       and (p_professional_id is null or c.professional_id = p_professional_id)
    union all
    select date_trunc((select g from gran), coalesce(t.paid_at, t.created_at) at time zone public.fuso_da_unidade(t.branch_id)) at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)),
           0::numeric, 0::numeric, t.amount
      from public.metrics_movimentos_pagos(p_tenant, coalesce((select array_agg(id) from scope), '{}'::uuid[]), p_from, p_to) t
     where t.type = 'EXPENSE'
       and lower(btrim(coalesce(t.category, ''))) = 'comissões'
       and p_professional_id is null
  )
  select x.bucket, coalesce(sum(x.taxa), 0), coalesce(sum(x.comissao), 0), coalesce(sum(x.despesa), 0)
    from parcelas x
   group by x.bucket
   order by x.bucket
$function$;

-- O caminho irmão: a taxa e o líquido de cada lançamento da lista (o
-- Financeiro e o CSV da contadora) — o pagamento com a taxa do que entrou, o
-- estorno com a do pagamento que ele estorna.
create or replace function public.metrics_caixa_dos_lancamentos(p_tenant uuid, p_ids uuid[])
 returns table(id uuid, no_caixa numeric, taxa numeric, liquido numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select t.id, v.no_caixa, x.taxa,
         case when x.taxa is not null then v.no_caixa - x.taxa end
    from public.financial_transactions t
    join public.branches b on b.id = t.branch_id and b.tenant_id = p_tenant
    left join public.financial_transactions o on o.id = t.estorno_de
    cross join lateral (
      select coalesce(sum(c.amount), 0) as estornado, count(*) as n
        from public.financial_transactions c
       where c.estorno_de = t.id and c.is_paid and c.category = 'Estorno'
    ) e
    cross join lateral (
      select case
               when not t.is_paid then null
               -- O uso do crédito na clínica não é caixa (F7, D9 da 12ª), nem o estorno dele.
               when t.payment_method is not distinct from 'INTERNAL_CREDIT' then null
               when coalesce(t.category, '') = 'Estorno' then
                 case when o.id is null or not o.is_paid or o.payment_method is not distinct from 'INTERNAL_CREDIT' or t.amount = 0 then null
                      when t.type = 'INCOME' then t.amount else -t.amount end
               -- O estornado sem estorno ligado (de antes da ligação): fora, como sempre.
               when coalesce(t.notes, '') = 'Estornada' and e.n = 0 then null
               -- O pago todo com pontos ou voucher (R$ 0): nenhum dinheiro.
               when t.type = 'INCOME' and t.amount = 0 and e.n = 0 then null
               else (case when t.type = 'INCOME' then 1 else -1 end)
                    * round((case when coalesce(t.notes, '') = 'Estornada' then 0 else t.amount end) + e.estornado, 2)
             end as no_caixa
    ) v
    cross join lateral (
      select case
               -- A receita: a taxa do que entrou (a GRAVADA nas parcelas da operadora; sem elas, a da configuração).
               when v.no_caixa > 0 and t.type = 'INCOME' and coalesce(t.category, '') <> 'Estorno' then
                 coalesce(
                   private.taxa_gravada_do_cartao(t.id, v.no_caixa),
                   case when t.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                        then round(v.no_caixa * private.comissao_taxa_pct(p_tenant, t.payment_method::text,
                               coalesce(t.cartao_vezes, t.parcela_total, 1), t.cartao_bandeira, t.maquininha_id) / 100, 2)
                        else 0 end)
               -- O estorno de uma receita: a taxa do que voltou sai (negativa) — a gravada no pagamento (C44b).
               when v.no_caixa < 0 and t.category = 'Estorno' and o.type = 'INCOME' then
                 coalesce(
                   private.taxa_gravada_do_cartao(o.id, -t.amount),
                   case when o.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                        then -round(t.amount * private.comissao_taxa_pct(p_tenant, o.payment_method::text,
                                coalesce(o.cartao_vezes, o.parcela_total, 1), o.cartao_bandeira, o.maquininha_id) / 100, 2)
                        else 0 end)
             end as taxa
    ) x
   where t.id = any (p_ids)
$function$;

-- ─── C49: os motivos de perda só dos funis ATIVOS (ind-07) ───────────────────
create or replace function public.metrics_motivos_de_perda(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_owner uuid default null::uuid)
 returns table(motivo text, total integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(m.nome, 'Sem motivo') as motivo, count(*)::integer as total
    from public.leads l
    left join public.crm_motivos_perda m on m.id = l.motivo_perda_id
    left join public.crm_stages st on st.id = l.crm_stage_id
    left join public.crm_funnels fu on fu.id = st.funnel_id
   where l.tenant_id = p_tenant and l.perdido_em between p_from and p_to
     -- ind-07: o funil arquivado sai (a oportunidade sem etapa segue contando), como no painel.
     and fu.archived_at is null
     and (p_owner is null or l.owner_id is null or l.owner_id = p_owner)
   group by coalesce(m.nome, 'Sem motivo')
   order by count(*) desc, 1;
$function$;

-- ─── C49: os agendamentos do comercial por `aconteceu_em` (D13) ──────────────
create or replace function public.metrics_comercial(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_owner uuid default null::uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with l as (
    select ld.client_id, ld.owner_id, (st.outcome = 'WON') as ganho
      from public.leads ld
      left join public.crm_stages st on st.id = ld.crm_stage_id
      left join public.crm_funnels fu on fu.id = st.funnel_id
     where ld.tenant_id = p_tenant and ld.created_at between p_from and p_to
       -- ind-07: só os funis ATIVOS (a oportunidade sem etapa segue contando).
       and fu.archived_at is null
       -- "Só os meus": os dela e os sem dono (o bolo comum), como o quadro.
       and (p_owner is null or ld.owner_id is null or ld.owner_id = p_owner)
  ), a as (
    select ap.status::text as status, ap.created_by_id
      from public.appointments ap
     where ap.branch_id = any (p_branch_ids)
       and ap.source::text = 'COMMERCIAL'
       -- C49: o atendimento conta quando ACONTECEU (D13), como todo indicador de agenda.
       and ap.aconteceu_em between p_from and p_to
       and (p_owner is null or ap.created_by_id = p_owner)
  ), por_dono as (
    select dono, sum(leads)::int as leads, sum(convertidos)::int as convertidos,
           sum(ganhos)::int as ganhos, sum(agendamentos)::int as agendamentos
      from (select owner_id as dono, 1 as leads, (client_id is not null)::int as convertidos,
                   coalesce(ganho, false)::int as ganhos, 0 as agendamentos from l
            union all
            select created_by_id, 0, 0, 0, 1 from a) x
     group by dono
  )
  select jsonb_build_object(
    'total_leads',  (select count(*) from l),
    'convertidos',  (select count(*) from l where client_id is not null),
    'ganhos',       (select count(*) from l where ganho),
    'tem_ganho',    exists (select 1 from public.crm_stages st join public.crm_funnels fu on fu.id = st.funnel_id
                     where st.tenant_id = p_tenant and st.outcome = 'WON' and fu.archived_at is null),
    'agendados',    (select count(*) from a),
    'considerados', (select count(*) from a where status <> 'CANCELLED'),
    'realizados',   (select count(*) from a where status = 'COMPLETED'),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object(
                  'dono', dono, 'leads', leads, 'convertidos', convertidos, 'ganhos', ganhos, 'agendamentos', agendamentos))
                from por_dono), '[]'::jsonb)
  )
$function$;

-- ─── C49: o "Reativar" da unidade mostra a última visita NELA ────────────────
-- A inatividade é na unidade (sem visita nela há 90 dias); a data mostrada era
-- a de qualquer unidade — "sumida" com a última visita há 10 dias, na outra.
create or replace function public.metrics_clientes_para_reativar(p_tenant uuid, p_branch_id uuid, p_tag text, p_desde timestamp with time zone, p_limite integer default 3, p_professional_id uuid default null::uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with do_recorte as (
    select c.id, c.name, c.phone,
           -- F35: de quando ela é cliente, e a última visita no sistema de antes.
           -- F62b: o dia vale da meia-noite da unidade.
           coalesce(c.cliente_desde::timestamp at time zone (select public.fuso_da_unidade(p_branch_id)), c.created_at) as created_at,
           c.ultima_visita_antes::timestamp at time zone (select public.fuso_da_unidade(p_branch_id)) as visita_antes
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active and c.tags @> array[p_tag]
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.client_id = c.id and a.branch_id = p_branch_id
              and a.professional_id = p_professional_id and a.status <> 'CANCELLED'))
  ),
  da_unidade as (
    select r.id, r.name, r.phone, r.visita_antes from do_recorte r where r.created_at < p_desde
  ),
  inativos as (
    select d.*
    from da_unidade d
    where (d.visita_antes is null or d.visita_antes < p_desde)
      and not exists (
      select 1 from public.appointments a
      where a.client_id = d.id
        and a.branch_id = p_branch_id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
        and a.aconteceu_em >= p_desde
    )
  ),
  com_ultima as (
    select i.id, i.name, i.phone, v.ultima as ultima_visita,
           (i.visita_antes is not null and (v.no_sistema is null or i.visita_antes > v.no_sistema)) as antes_do_sistema
    from inativos i
    cross join lateral (
      select m.no_sistema, greatest(m.no_sistema, i.visita_antes) as ultima
        -- C49: a última visita NA UNIDADE (a inatividade é dela).
        from (select max(a.aconteceu_em) as no_sistema from public.appointments a
               where a.client_id = i.id and a.branch_id = p_branch_id and a.status = 'COMPLETED') m
    ) v
  ),
  visitas as (
    select r.id, r.created_at,
      r.visita_antes is not null
        or exists (select 1 from public.appointments a where a.client_id = r.id and a.status = 'COMPLETED') as veio
    from do_recorte r
  )
  select jsonb_build_object(
    'total', (select count(*) from inativos),
    'com_visita', (select count(*) from visitas v where v.veio),
    'recentes_sem_visita', (select count(*) from visitas v where not v.veio and v.created_at >= p_desde),
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'phone', x.phone, 'ultima_visita', x.ultima_visita,
               'antes_do_sistema', x.antes_do_sistema)
             order by x.ultima_visita asc nulls last, x.name)
      from (
        select * from com_ultima
        order by ultima_visita asc nulls last, name
        limit p_limite
      ) x
    ), '[]'::jsonb)
  );
$function$;

-- ─── C6 / C45: a unidade da cliente é a TAG ("Unidade: X") ───────────────────
-- H5: "a cliente é da clínica"; a unidade que ela frequenta é a tag (a lista
-- da unidade, o "Reativar", o Copilot). O público da campanha e da automação e
-- as novas clientes por unidade usavam a unidade de CADASTRO: a cliente
-- cadastrada no Batel que só vai à Água Verde ficava fora da campanha da Água
-- Verde, e o total da rede não fechava com o "Por filial".

-- As tags das unidades dadas.
create or replace function public.tags_das_unidades(p_branch_ids uuid[])
 returns text[]
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(array_agg('Unidade: ' || b.name), '{}'::text[]) from public.branches b where b.id = any (p_branch_ids)
$function$;

-- O recorte é a CLÍNICA inteira: nenhum, ou todas as unidades ativas dela.
create or replace function public.recorte_e_a_clinica(p_tenant uuid, p_branch_ids uuid[])
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  select p_branch_ids is null or not exists (
    select 1 from public.branches b where b.tenant_id = p_tenant and b.is_active and not (b.id = any (p_branch_ids)))
$function$;

create or replace function public.clientes_do_publico(p_tenant uuid, p_filtros jsonb)
 returns table(id uuid, name text, phone text, auth_id text)
 language sql
 stable
 set search_path to ''
as $function$
  with f as (
    select (select array_agg(x::uuid) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'branch_ids') = 'array' then p_filtros->'branch_ids' end) x)    as unidades,
           (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'genders') = 'array' then p_filtros->'genders' end) x)          as generos,
           (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'tags') = 'array' then p_filtros->'tags' end) x)                as tags,
           (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'procedure_ids') = 'array' then p_filtros->'procedure_ids' end) x) as procedimentos,
           (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'client_ids') = 'array' then p_filtros->'client_ids' end) x)    as so_estas,
           coalesce((p_filtros->>'has_app_account')::boolean, false) as so_com_app,
           (p_filtros->'aniversario'->>'mes')::int as mes,
           (p_filtros->'aniversario'->>'dia')::int as dia,
           (p_filtros->>'sem_retorno_desde')::timestamptz as sem_retorno_desde,
           (p_filtros->>'cliente_desde_antes')::timestamptz as cliente_desde_antes,
           (p_filtros->>'min_visitas')::int as min_visitas
  )
  select c.id, c.name::text, c.phone::text, c.auth_id::text
    from public.clients c, f
   where c.tenant_id = p_tenant
     and c.is_active
     and (f.so_estas is null or c.id::text = any (f.so_estas))
     -- C6: a unidade é a TAG (quem frequenta), a régua da lista da unidade.
     and (f.unidades is null or c.tags && public.tags_das_unidades(
           (select array_agg(b.id) from public.branches b where b.tenant_id = p_tenant and b.id = any (f.unidades))))
     and (f.generos is null or c.gender = any (f.generos))
     and (f.tags is null or c.tags && f.tags)
     and (not f.so_com_app or c.auth_id is not null)
     and (f.procedimentos is null or exists (
           select 1 from public.appointments a
            where a.client_id = c.id and a.status = 'COMPLETED'
              and a.procedure_id::text = any (f.procedimentos)))
     and (f.mes is null or (
           c.birth_date is not null
           and extract(month from c.birth_date at time zone 'UTC') = f.mes
           and extract(day   from c.birth_date at time zone 'UTC') = f.dia))
     and (f.sem_retorno_desde is null or (
           not exists (
             select 1 from public.appointments a
              where a.client_id = c.id and a.status = 'COMPLETED'
                and a.scheduled_at >= f.sem_retorno_desde)
           -- F35: a visita no sistema de antes também é retorno (no dia da unidade dela, F62b).
           and (c.ultima_visita_antes is null
                or c.ultima_visita_antes::timestamp at time zone public.fuso_da_unidade(c.branch_id) < f.sem_retorno_desde)))
     and (f.cliente_desde_antes is null
          or coalesce(c.cliente_desde::timestamp at time zone public.fuso_da_unidade(c.branch_id), c.created_at) < f.cliente_desde_antes)
     and (f.min_visitas is null or (
           select count(*) from public.appointments a
            where a.client_id = c.id and a.status = 'COMPLETED') >= f.min_visitas)
$function$;

-- As novas clientes: a clínica inteira quando o recorte é a clínica; a
-- unidade, quem tem a tag dela (C6/C45).
create or replace function public.metrics_core(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric, appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint, appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint, commissions_open numeric, commissions_paid numeric, appointments_charged bigint)
 language sql
 stable
 set search_path to ''
as $function$
  with scope as (
    select b.id
    from public.branches b
    where b.tenant_id = p_tenant
      and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  tx as (
    select t.*
    from public.financial_transactions t
    join scope s on s.id = t.branch_id
    where coalesce(t.notes, '')    <> 'Estornada'
      and coalesce(t.category, '') <> 'Estorno'
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.id = t.appointment_id and a.professional_id = p_professional_id)
          or exists (select 1 from public.product_sales ps
                      where ps.id = t.product_sale_id and ps.sold_by = p_professional_id)
          or exists (select 1 from public.client_packages cpv
                      where cpv.id = t.client_package_id and cpv.sold_by = p_professional_id)
          or exists (select 1 from public.procedure_sales psv
                      where psv.id = t.procedure_sale_id and psv.sold_by = p_professional_id))
  ),
  despesas as (
    select m.amount
    from public.metrics_movimentos_pagos(p_tenant, p_branch_ids, p_from, p_to) m
    where m.type = 'EXPENSE'
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.id = m.appointment_id and a.professional_id = p_professional_id)
          or exists (select 1 from public.product_sales ps
                      where ps.id = m.product_sale_id and ps.sold_by = p_professional_id)
          or exists (select 1 from public.client_packages cpv
                      where cpv.id = m.client_package_id and cpv.sold_by = p_professional_id)
          or exists (select 1 from public.procedure_sales psv
                      where psv.id = m.procedure_sale_id and psv.sold_by = p_professional_id))
  ),
  appt as (
    select a.*
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.aconteceu_em >= p_from
      and a.aconteceu_em <= p_to
      and (p_professional_id is null or a.professional_id = p_professional_id)
  ),
  comm as (
    select c.status, c.amount
    from public.commissions c
    join scope s on s.id = c.branch_id
    where c.released_at >= p_from
      and c.released_at <= p_to
      and (p_professional_id is null or c.professional_id = p_professional_id)
  ),
  clinica as (select public.recorte_e_a_clinica(p_tenant, p_branch_ids) as toda, public.tags_das_unidades(p_branch_ids) as tags)
  select
    coalesce((select sum(r.amount) from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) r), 0),
    coalesce((select sum(t.amount) from tx t
               where t.type = 'INCOME' and not t.is_paid
                 and t.data_de_referencia between p_from and p_to), 0),
    coalesce((select sum(d.amount) from despesas d), 0),
    coalesce((select sum(a.price) from appt a where a.status = 'COMPLETED'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED'),
    (select count(*) from appt),
    (select count(*) from appt a where a.status = 'CANCELLED'),
    (select count(*) from appt a where a.status = 'NO_SHOW'),
    coalesce((select sum(a.duration_min) from appt a
               where a.status not in ('CANCELLED', 'NO_SHOW')), 0),
    -- F35: a cliente importada com "cliente desde" de antes não é nova.
    -- C6/C45: a da unidade é quem tem a tag dela; a clínica inteira, todas.
    (select count(*) from public.clients c, clinica k
       where c.tenant_id = p_tenant
         and c.is_active
         and coalesce(c.cliente_desde::timestamp at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)), c.created_at) between p_from and p_to
         and (k.toda or c.tags && k.tags)
         and (p_professional_id is null or exists (
               select 1 from public.appointments a
               join scope s on s.id = a.branch_id
               where a.client_id = c.id and a.professional_id = p_professional_id
                 and a.status <> 'CANCELLED'))),
    coalesce((select sum(c.amount) from comm c where c.status = 'OPEN'), 0),
    coalesce((select sum(c.amount) from comm c where c.status = 'PAID'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED' and coalesce(a.price, 0) > 0);
$function$;

create or replace function public.metrics_new_clients_series(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text default 'day'::text, p_professional_id uuid default null::uuid)
 returns table(bucket timestamp with time zone, count bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with desde as (
    -- F35: de quando ela é cliente (a importada com "cliente desde" de antes não é nova).
    select c.id, coalesce(c.cliente_desde::timestamp at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)), c.created_at) as em
    from public.clients c
    where c.tenant_id = p_tenant
      and c.is_active
      -- C6/C45: a unidade é a tag; a clínica inteira, todas.
      and (public.recorte_e_a_clinica(p_tenant, p_branch_ids) or c.tags && public.tags_das_unidades(p_branch_ids))
  )
  select
    date_trunc(
      case when p_granularity in ('hour', 'day', 'month') then p_granularity else 'day' end,
      d.em at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids))
    ) at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)) as bucket,
    count(*)
  from desde d
  where d.em between p_from and p_to
    and (p_professional_id is null or exists (
          select 1 from public.appointments a
          join public.branches b on b.id = a.branch_id
          where a.client_id = d.id and a.professional_id = p_professional_id
            and a.status <> 'CANCELLED'
            and b.tenant_id = p_tenant
            and (p_branch_ids is null or b.id = any (p_branch_ids))))
  group by 1
  order by 1;
$function$;

-- O "Por filial": as novas clientes de cada unidade pela tag dela.
create or replace function public.metrics_by_branch(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(branch_id uuid, branch_name text, branch_slug text, is_active boolean, revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric, appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint, appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint, commissions_open numeric, commissions_paid numeric, transactions_count bigint, appointments_charged bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with mov as (
    select m.branch_id, m.type, m.payment_method, m.amount
      from public.metrics_movimentos_pagos(p_tenant, null, p_from, p_to) m
  )
  select
    b.id, b.name, b.slug, b.is_active,
    coalesce((select sum(m.amount) from mov m
               where m.branch_id = b.id and m.type = 'INCOME'
                 and m.payment_method is distinct from 'INTERNAL_CREDIT'), 0),
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and not t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and t.data_de_referencia between p_from and p_to), 0),
    coalesce((select sum(m.amount) from mov m
               where m.branch_id = b.id and m.type = 'EXPENSE'), 0),
    coalesce((select sum(a.price) from public.appointments a
               where a.branch_id = b.id and a.status = 'COMPLETED'
                 and a.aconteceu_em between p_from and p_to), 0),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'COMPLETED'
         and a.aconteceu_em between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.aconteceu_em between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'CANCELLED'
         and a.aconteceu_em between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'NO_SHOW'
         and a.aconteceu_em between p_from and p_to),
    coalesce((select sum(a.duration_min) from public.appointments a
               where a.branch_id = b.id and a.status not in ('CANCELLED', 'NO_SHOW')
                 and a.aconteceu_em between p_from and p_to), 0),
    -- F35: a cliente importada com "cliente desde" de antes não é nova.
    -- F62b: o dia vale da meia-noite da unidade.
    -- C6/C45: as clientes da unidade são as que têm a tag dela (quem frequenta).
    (select count(*) from public.clients c
       where c.tenant_id = p_tenant and c.is_active
         and c.tags @> array['Unidade: ' || b.name]
         and coalesce(c.cliente_desde::timestamp at time zone b.fuso, c.created_at) between p_from and p_to),
    coalesce((select sum(c.amount) from public.commissions c
               where c.branch_id = b.id and c.status = 'OPEN'
                 and c.released_at between p_from and p_to), 0),
    coalesce((select sum(c.amount) from public.commissions c
               where c.branch_id = b.id and c.status = 'PAID'
                 and c.released_at between p_from and p_to), 0),
    (select count(*) from public.financial_transactions t
       where t.branch_id = b.id
         and coalesce(t.paid_at, t.created_at) between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'COMPLETED' and coalesce(a.price, 0) > 0
         and a.aconteceu_em between p_from and p_to)
  from public.branches b
  where b.tenant_id = p_tenant
  order by b.name;
$function$;

notify pgrst, 'reload schema';
