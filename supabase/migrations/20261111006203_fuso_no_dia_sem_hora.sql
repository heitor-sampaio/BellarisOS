-- F62b — o DIA sem hora dos indicadores, no fuso da unidade.
--
-- "Cliente desde" e "última visita antes do sistema" (F35) são DIAS
-- (`date`). Para comparar com um período ou com outra visita, viram instante:
-- a meia-noite do dia — e era a de Brasília. A cliente de Manaus "desde
-- 10/03" virava 10/03 03:00 UTC = 09/03 23:00 em Manaus: nova na véspera no
-- relatório de lá, "última visita 09/03" no Reativar, e fora do corte certo
-- no público da campanha. Agora é a meia-noite da UNIDADE da cliente
-- (`fuso_da_unidade(c.branch_id)`; no Reativar de uma unidade, a dela).
--
-- Junto, os irmãos que decidiam "hoje" num relógio fixo:
-- - a faixa etária ganha o fuso (`metrics_faixa_etaria(nascimento, fuso)`):
--   a demografia e o relatório passam o fuso do recorte (`fuso_do_recorte`);
-- - a busca universal: os agendamentos "de hoje em diante" pelo dia da
--   unidade de cada um (era o de Brasília);
-- - o FEFO das saídas de estoque (perda, venda, venda de vários itens e o
--   gatilho dos lotes): o lote vencido é o do dia da validade passado no dia
--   da UNIDADE — era `current_date` (o dia UTC do banco: das 21h às 23h59 de
--   Brasília o lote do dia já contava como vencido). A mesma regra de
--   `loteVencido` (lib/estoque/validade.ts).
--
-- Fica de fora, de propósito: o nascimento lido em UTC (é o dia gravado, data
-- sem hora); os recebíveis do cartão (o prazo em dias corridos dá o mesmo
-- instante em qualquer fuso do Brasil, sem horário de verão desde 2019); a
-- validade do pacote (âncora no fim do dia de Brasília, gravada e lida juntas).
--
-- Aditiva: `create or replace` partindo do corpo de produção
-- (`pg_get_functiondef`, 2026-11-11). As funções grandes (o relatório, a
-- busca e as quatro do estoque) são trocadas no próprio corpo de produção
-- por `pg_temp.trocar_no_corpo`, que para se o trecho não estiver lá.

-- ─── a faixa etária, no fuso de quem pergunta ───────────────────────────────

create or replace function public.metrics_faixa_etaria(p_nascimento timestamp with time zone, p_fuso text)
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  select case
    when p_nascimento is null then null
    else (
      with a as (
        select extract(year from age(
          (now() at time zone coalesce(p_fuso, 'America/Sao_Paulo'))::date,
          (p_nascimento at time zone 'UTC')::date))::int as anos
      )
      select case
        when anos < 18 then '< 18'
        when anos < 25 then '18–24'
        when anos < 35 then '25–34'
        when anos < 45 then '35–44'
        when anos < 55 then '45–54'
        when anos < 65 then '55–64'
        else '65+'
      end from a
    )
  end;
$function$;

revoke execute on function public.metrics_faixa_etaria(timestamp with time zone, text) from public, anon, authenticated;
grant execute on function public.metrics_faixa_etaria(timestamp with time zone, text) to service_role;

-- A de um argumento continua (o padrão: Brasília).
create or replace function public.metrics_faixa_etaria(p_nascimento timestamp with time zone)
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  select public.metrics_faixa_etaria(p_nascimento, 'America/Sao_Paulo');
$function$;

create or replace function public.metrics_demografia(p_tenant uuid, p_branch_ids uuid[], p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with ativos as (
    select c.id, c.city, c.zip_code, c.birth_date
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            join public.branches b on b.id = a.branch_id
            where a.client_id = c.id and a.professional_id = p_professional_id
              and a.status <> 'CANCELLED'
              and b.tenant_id = p_tenant
              and (p_branch_ids is null or b.id = any (p_branch_ids))))
  ),
  idades as (
    -- F62b: a idade no dia do recorte.
    select public.metrics_faixa_etaria(a.birth_date, (select public.fuso_do_recorte(p_tenant, p_branch_ids))) as faixa
    from ativos a where a.birth_date is not null
  ),
  cidades as (
    select city as cidade, count(*) as n
    from ativos where city is not null and city <> ''
    group by city order by n desc, city limit 5
  ),
  ltv as (
    select t.client_id, t.total_spent
    from public.metrics_top_clients(p_tenant, p_branch_ids, '2000-01-01'::timestamptz, p_to, 2147483647, p_professional_id) t
  ),
  ceps as (
    select regexp_replace(a.zip_code, '\D', '', 'g') as cep,
           count(*) as n,
           coalesce(sum(l.total_spent), 0) as ltv
    from ativos a
    left join ltv l on l.client_id = a.id
    where length(regexp_replace(coalesce(a.zip_code, ''), '\D', '', 'g')) = 8
    group by 1
  )
  select jsonb_build_object(
    'total',   (select count(*) from ativos),
    'idades',  coalesce((select jsonb_agg(jsonb_build_object('faixa', faixa, 'n', n))
                         from (select faixa, count(*) as n from idades where faixa is not null group by faixa) x), '[]'::jsonb),
    'cidades', coalesce((select jsonb_agg(jsonb_build_object('cidade', cidade, 'n', n) order by n desc, cidade)
                         from cidades), '[]'::jsonb),
    'ceps',    coalesce((select jsonb_agg(jsonb_build_object('cep', cep, 'n', n, 'ltv', ltv))
                         from ceps), '[]'::jsonb)
  );
$function$;

-- ─── o dia sem hora na meia-noite da unidade da cliente ─────────────────────

create or replace function public.ultimas_visitas(p_tenant uuid, p_branch uuid default null::uuid)
 returns table(client_id uuid, ultima timestamp with time zone)
 language sql
 stable
 set search_path to ''
as $function$
  select x.client_id, max(x.ultima)
    from (
      select a.client_id, a.aconteceu_em as ultima
        from public.appointments a
        join public.branches b on b.id = a.branch_id
       where b.tenant_id = p_tenant
         and (p_branch is null or a.branch_id = p_branch)
         and a.status = 'COMPLETED'
         and a.client_id is not null
      union all
      -- F35: a última visita no sistema de antes (a migração), à meia-noite da unidade dela (F62b).
      select c.id, c.ultima_visita_antes::timestamp at time zone public.fuso_da_unidade(c.branch_id)
        from public.clients c
       where c.tenant_id = p_tenant
         and c.ultima_visita_antes is not null
         and (p_branch is null or c.branch_id = p_branch)
    ) x
   group by x.client_id
$function$;

create or replace function public.clientes_do_publico(p_tenant uuid, p_filtros jsonb)
 returns table(id uuid, name text, phone text, auth_id text)
 language sql
 stable
 set search_path to ''
as $function$
  with f as (
    select (select array_agg(x) from jsonb_array_elements_text(
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
     and (f.unidades is null or c.branch_id::text = any (f.unidades))
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
    (select count(*) from public.clients c
       where c.branch_id = b.id and c.is_active
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
        from (select max(a.aconteceu_em) as no_sistema from public.appointments a
               where a.client_id = i.id and a.status = 'COMPLETED') m
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

create or replace function public.metrics_clientes_para_reativar_rede(p_tenant uuid, p_desde timestamp with time zone, p_limite integer default 3, p_professional_id uuid default null::uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with unidades as (
    select b.id, b.name, b.slug, b.fuso from public.branches b where b.tenant_id = p_tenant
  ),
  do_recorte as (
    select c.id, c.name, c.phone, c.branch_id,
           -- F35: de quando ela é cliente, e a última visita no sistema de antes.
           -- F62b: o dia vale da meia-noite da unidade dela.
           coalesce(c.cliente_desde::timestamp at time zone coalesce(uc.fuso, 'America/Sao_Paulo'), c.created_at) as created_at,
           c.ultima_visita_antes::timestamp at time zone coalesce(uc.fuso, 'America/Sao_Paulo') as visita_antes
    from public.clients c
    left join unidades uc on uc.id = c.branch_id
    where c.tenant_id = p_tenant and c.is_active
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            join unidades u on u.id = a.branch_id
            where a.client_id = c.id
              and a.professional_id = p_professional_id and a.status <> 'CANCELLED'))
  ),
  da_rede as (
    select r.id, r.name, r.phone, r.branch_id, r.visita_antes from do_recorte r where r.created_at < p_desde
  ),
  inativos as (
    select d.*
    from da_rede d
    where (d.visita_antes is null or d.visita_antes < p_desde)
      and not exists (
      select 1 from public.appointments a
      join unidades u on u.id = a.branch_id
      where a.client_id = d.id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
        and a.aconteceu_em >= p_desde
    )
  ),
  com_ultima as (
    select i.id, i.name, i.phone,
           greatest(ult.aconteceu_em, i.visita_antes) as ultima_visita,
           (i.visita_antes is not null and (ult.aconteceu_em is null or i.visita_antes > ult.aconteceu_em)) as antes_do_sistema,
           coalesce(ult.branch_id, i.branch_id) as unidade_id
    from inativos i
    left join lateral (
      select a.aconteceu_em, a.branch_id
      from public.appointments a
      join unidades u on u.id = a.branch_id
      where a.client_id = i.id and a.status = 'COMPLETED'
      order by a.aconteceu_em desc
      limit 1
    ) ult on true
  ),
  visitas as (
    select r.id, r.created_at,
      r.visita_antes is not null
        or exists (select 1 from public.appointments a join unidades u on u.id = a.branch_id
                    where a.client_id = r.id and a.status = 'COMPLETED') as veio
    from do_recorte r
  )
  select jsonb_build_object(
    'total', (select count(*) from inativos),
    'com_visita', (select count(*) from visitas v where v.veio),
    'recentes_sem_visita', (select count(*) from visitas v where not v.veio and v.created_at >= p_desde),
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'phone', x.phone, 'ultima_visita', x.ultima_visita,
               'antes_do_sistema', x.antes_do_sistema,
               'unidade', u.name, 'unidade_slug', u.slug)
             order by x.ultima_visita asc nulls last, x.name)
      from (
        select * from com_ultima
        order by ultima_visita asc nulls last, name
        limit p_limite
      ) x
      left join unidades u on u.id = x.unidade_id
    ), '[]'::jsonb)
  );
$function$;

-- ─── as funções grandes: troca no corpo de produção ─────────────────────────

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[])
 returns void
 language plpgsql
as $f$
declare
  v_def  text := pg_get_functiondef(p_fn);
  v_novo text := v_def;
begin
  for i in 1 .. array_length(p_de, 1) loop
    if position(p_de[i] in v_novo) = 0 then
      -- Já trocado (a migration rodou de novo): segue.
      if position(p_para[i] in v_novo) > 0 then continue; end if;
      raise exception '%: não achei o trecho "%"', p_fn, p_de[i];
    end if;
    v_novo := replace(v_novo, p_de[i], p_para[i]);
  end loop;
  if v_novo <> v_def then execute v_novo; end if;
end
$f$;

-- O relatório: a faixa etária no fuso do recorte (as três leituras).
select pg_temp.trocar_no_corpo(
  'public.metrics_relatorio(uuid,uuid[],timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,uuid)'::regprocedure,
  array['public.metrics_faixa_etaria(birth_date)', 'public.metrics_faixa_etaria(c.birth_date)'],
  array['public.metrics_faixa_etaria(birth_date, (select public.fuso_do_recorte(p_tenant, p_branch_ids)))',
        'public.metrics_faixa_etaria(c.birth_date, (select public.fuso_do_recorte(p_tenant, p_branch_ids)))']);

-- A busca: "de hoje em diante" no dia da unidade de cada agendamento.
select pg_temp.trocar_no_corpo(
  'public.busca_universal(uuid,text,text[],uuid,uuid,uuid,integer)'::regprocedure,
  array[$t$a.scheduled_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')$t$],
  array[$t$a.scheduled_at >= (date_trunc('day', now() at time zone b.fuso) at time zone b.fuso)$t$]);

-- O FEFO: o lote vencido pelo dia da unidade (o dia da validade é o gravado, em UTC).
select pg_temp.trocar_no_corpo(f::regprocedure,
  array['coalesce(b.expires_at < current_date, false)'],
  array['coalesce((b.expires_at at time zone ''UTC'')::date < (now() at time zone public.fuso_da_unidade(b.branch_id))::date, false)'])
  from unnest(array[
    'public.estoque_perda_em(uuid,uuid,uuid,numeric,boolean,text,text,text)',
    'public.produto_vender(uuid,uuid,uuid,uuid,uuid,integer,numeric,jsonb)',
    'public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)',
    'public.on_stock_movement_lotes()'
  ]) f;

notify pgrst, 'reload schema';
