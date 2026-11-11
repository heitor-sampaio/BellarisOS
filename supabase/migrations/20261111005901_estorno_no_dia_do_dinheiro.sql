-- F59 — o dinheiro da 12ª simulação (2026-11-11): o estorno no dia em que o
-- dinheiro sai.
--
-- D2, DECIDIDO pelo princípio 5 ("o caixa e o faturamento, no dia em que o
-- dinheiro entrou"): o estorno feito hoje de um pagamento de ontem tirava o
-- dinheiro de ONTEM (a regra única tirava "os dois lados" do estorno, cada um no
-- seu dia, e o estorno parcial reduzia o pagamento original) e não aparecia como
-- saída hoje. O Fechamento de 10/11 da Acácia, fechado com "Bateu", foi de
-- R$ 1.730 a R$ 1.100.
--
-- Agora, numa janela de tempo (o dia, o mês):
--   * o PAGAMENTO conta no dia dele pelo valor que entrou (o de antes de todo
--     estorno), menos o estorno feito na MESMA janela — no mesmo dia, um anula o
--     outro, como sempre;
--   * o ESTORNO feito na janela de um pagamento de FORA dela é a saída (na
--     receita, uma dedução; na despesa, o dinheiro que volta) do dia em que foi
--     feito.
-- Para isso o contra-lançamento passa a dizer de qual pagamento é
-- (`financial_transactions.estorno_de`): as cinco portas do estorno o gravam, e
-- os de antes se ligam aqui pelo que elas sempre gravaram (a descrição "Estorno:
-- …"/"Estorno parcial: …", a unidade, a cliente e a mesma transação). O
-- contra-lançamento sem ligação (nenhum, depois desta migration) segue a regra de
-- antes: os dois lados fora.
--
-- `metrics_movimentos_pagos` é a régua (o conjunto do caixa, receita e despesa);
-- `metrics_receitas_pagas` (a regra única de receita) parte dela, e as contas que
-- repetiam o predicado (core, by_branch, series, top_clients, composição,
-- fechamento, avisos, custos da venda, resultado) passam a partir dela. As taxas
-- da maquininha acompanham o pagamento: a do estornado sai no dia do estorno.
--
-- D3: o estorno de uma DESPESA não é "o que voltou às clientes": os "Estornos do
-- dia" (`metrics_estornos_das_clientes_do_dia`, nova — a antiga fica sem leitor)
-- são só os de receita, com o dia do pagamento; o dinheiro da despesa estornada
-- noutro dia é ENTRADA do caixa do dia.
-- A45/D9: `metrics_caixa_dos_lancamentos` diz, por lançamento, o que ele conta no
-- caixa (com o sinal; nulo = não conta: o em aberto, o uso do crédito na clínica,
-- o pago todo em pontos) — o "caixa da lista" e a coluna "Conta no caixa" do CSV.

-- 1. A ligação do estorno ao pagamento.
alter table public.financial_transactions add column if not exists estorno_de uuid;
create index if not exists financial_transactions_estorno_de_idx
  on public.financial_transactions (estorno_de) where estorno_de is not null;
comment on column public.financial_transactions.estorno_de is
  'O pagamento que este contra-lançamento (category = Estorno) estorna (F59, D2 da 12ª): o estorno conta no dia dele, e o pagamento no dia do pagamento.';

-- Os estornos de antes: a mesma unidade e cliente, a descrição do pagamento, o
-- tipo oposto; entre dois candidatos, o atualizado na MESMA transação do estorno
-- (estornar_transacao e o estorno parcial gravam o pagamento e o
-- contra-lançamento com o mesmo now()). Nenhum gatilho de financial_transactions
-- olha esta coluna (todos são UPDATE OF outras colunas).
with alvo as (
  select c.id as contra,
         (select o.id
            from public.financial_transactions o
           where o.branch_id = c.branch_id and o.id <> c.id
             and coalesce(o.category, '') <> 'Estorno' and o.is_paid and o.type <> c.type
             and o.description = regexp_replace(c.description, '^Estorno( parcial)?: ', '')
             and o.client_id is not distinct from c.client_id
           order by (o.updated_at = coalesce(c.paid_at, c.created_at)) desc,
                    ((coalesce(o.notes, '') = 'Estornada') = (c.description like 'Estorno: %')) desc,
                    abs(extract(epoch from (o.updated_at - coalesce(c.paid_at, c.created_at)))),
                    o.id
           limit 1) as original
    from public.financial_transactions c
   where c.category = 'Estorno' and c.estorno_de is null
)
update public.financial_transactions f
   set estorno_de = a.original
  from alvo a
 where f.id = a.contra and a.original is not null;

-- 2. As cinco portas do estorno gravam a ligação. Parte do corpo ATUAL de cada
-- função (as frentes as mudaram): só o INSERT do contra-lançamento ganha a
-- coluna, com o pagamento que está sendo estornado (v_tx).
do $do$
declare
  f      regprocedure;
  d      text;
  bloco  text;
  novo   text;
begin
  foreach f in array array[
    'public.estornar_transacao(uuid,uuid,text,text)'::regprocedure,
    'private.cancelamento_dinheiro(uuid,uuid,uuid,numeric,boolean,text,text,jsonb,text,text,text,text,uuid,uuid)'::regprocedure,
    'public.credito_estornar_venda(uuid,uuid,uuid,text,text,numeric,boolean,text,jsonb,text)'::regprocedure,
    'public.procedimento_cancelar_unidade_devolvendo(uuid,uuid,uuid,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
    'public.produto_devolver_itens(uuid,uuid,uuid,text,text,jsonb,boolean,text,numeric,boolean,text,jsonb)'::regprocedure
  ] loop
    d := pg_get_functiondef(f);
    bloco := substring(d from '(insert into public\.financial_transactions[^;]*?''Estorno[^;]*?;)');
    if bloco is null then
      raise exception 'F59: não achei o insert do estorno em %', f;
    end if;
    if position('estorno_de' in bloco) > 0 then
      continue;
    end if;
    novo := regexp_replace(bloco, '^insert into public\.financial_transactions \(', 'insert into public.financial_transactions (estorno_de, ');
    novo := regexp_replace(novo, '\) values \(', ') values (v_tx.id, ');
    if novo = bloco or (length(novo) - length(bloco)) <> length('estorno_de, ') + length('v_tx.id, ') then
      raise exception 'F59: o insert do estorno em % não tem a forma esperada', f;
    end if;
    execute replace(d, bloco, novo);
  end loop;
end
$do$;

-- 3. A régua: os movimentos pagos de uma janela, com o estorno no dia dele.
create or replace function public.metrics_movimentos_pagos(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 returns setof public.financial_transactions
 language sql
 stable
 set search_path to ''
as $function$
  -- (a) O pagamento, no dia dele: o valor que entrou (o de antes de todo
  -- estorno: o que ficou + os estornos ligados a ele), menos o estorno feito
  -- nesta mesma janela. O estornado inteiro na janela some (um anula o outro).
  select (z.r).*
    from public.financial_transactions t
    join public.branches b on b.id = t.branch_id
    cross join lateral (
      select coalesce(sum(c.amount), 0) as total,
             coalesce(sum(c.amount) filter (where coalesce(c.paid_at, c.created_at) between p_from and p_to), 0) as aqui,
             count(*) as n
        from public.financial_transactions c
       where c.estorno_de = t.id and c.is_paid and c.category = 'Estorno'
    ) e
    cross join lateral (
      select case when e.n = 0 then t
                  else jsonb_populate_record(t, jsonb_build_object('amount',
                         round((case when coalesce(t.notes, '') = 'Estornada' then 0 else t.amount end) + e.total - e.aqui, 2)))
             end as r
    ) z
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or b.id = any (p_branch_ids))
     and t.is_paid
     and coalesce(t.category, '') <> 'Estorno'
     and coalesce(t.paid_at, t.created_at) between p_from and p_to
     -- O estornado (inteiro) só fica quando o estorno é de fora da janela; sem
     -- estorno ligado (os de antes da ligação), fora, como sempre foi.
     and (coalesce(t.notes, '') <> 'Estornada' or (e.n > 0 and e.total - e.aqui <> 0))
  union all
  -- (b) O estorno feito nesta janela de um pagamento de FORA dela: a saída (ou,
  -- no da despesa, o dinheiro que volta) do dia do estorno. Vai com os dados do
  -- pagamento (a forma, a categoria, a cliente, o atendimento, a venda — o
  -- recorte "só os meus" e a composição) e o valor NEGATIVO, no tipo dele: a
  -- soma da receita (ou da despesa) da janela já sai líquida. `estorno_de` diz
  -- que a linha é um estorno.
  select (z.r).*
    from public.financial_transactions c
    join public.financial_transactions t on t.id = c.estorno_de
    join public.branches b on b.id = t.branch_id
    cross join lateral (
      select jsonb_populate_record(t, jsonb_build_object(
               'id', c.id, 'amount', -c.amount, 'paid_at', c.paid_at, 'created_at', c.created_at,
               'updated_at', c.updated_at, 'description', c.description, 'notes', 'Estorno',
               'estorno_motivo', c.estorno_motivo, 'created_by', c.created_by, 'recebido_por', null,
               'valor_antes_do_estorno', null, 'estorno_de', t.id, 'payment_method', c.payment_method,
               'cartao_vezes', c.cartao_vezes, 'data_de_referencia', c.data_de_referencia)) as r
    ) z
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or b.id = any (p_branch_ids))
     and c.category = 'Estorno' and c.is_paid
     and coalesce(c.paid_at, c.created_at) between p_from and p_to
     and t.is_paid and coalesce(t.category, '') <> 'Estorno'
     and not (coalesce(t.paid_at, t.created_at) between p_from and p_to)
$function$;
revoke execute on function public.metrics_movimentos_pagos(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_movimentos_pagos(uuid, uuid[], timestamptz, timestamptz) to service_role;

-- 4. A regra única de receita parte da régua (o mesmo recorte de antes).
create or replace function public.metrics_receitas_pagas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns setof public.financial_transactions
 language sql
 stable
 set search_path to ''
as $function$
  select t.*
  from public.metrics_movimentos_pagos(p_tenant, p_branch_ids, p_from, p_to) t
  where t.type = 'INCOME'
    and t.payment_method is distinct from 'INTERNAL_CREDIT'
    and (p_professional_id is null or exists (
          select 1 from public.appointments a
          where a.id = t.appointment_id and a.professional_id = p_professional_id)
          or exists (select 1 from public.product_sales ps
                      where ps.id = t.product_sale_id and ps.sold_by = p_professional_id)
          or exists (select 1 from public.client_packages cpv
                      where cpv.id = t.client_package_id and cpv.sold_by = p_professional_id)
          or exists (select 1 from public.procedure_sales psv
                      where psv.id = t.procedure_sale_id and psv.sold_by = p_professional_id));
$function$;

-- 5. O núcleo: a receita é a regra única; a despesa, a régua.
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
  )
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
    (select count(*) from public.clients c
       where c.tenant_id = p_tenant
         and c.is_active
         and coalesce(c.cliente_desde::timestamp at time zone 'America/Sao_Paulo', c.created_at) between p_from and p_to
         and (p_branch_ids is null or c.branch_id is null or c.branch_id = any (p_branch_ids))
         and (p_professional_id is null or exists (
               select 1 from public.appointments a
               join scope s on s.id = a.branch_id
               where a.client_id = c.id and a.professional_id = p_professional_id
                 and a.status <> 'CANCELLED'))),
    coalesce((select sum(c.amount) from comm c where c.status = 'OPEN'), 0),
    coalesce((select sum(c.amount) from comm c where c.status = 'PAID'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED' and coalesce(a.price, 0) > 0);
$function$;

-- 6. Por unidade: a mesma régua.
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
    (select count(*) from public.clients c
       where c.branch_id = b.id and c.is_active
         and coalesce(c.cliente_desde::timestamp at time zone 'America/Sao_Paulo', c.created_at) between p_from and p_to),
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

-- 7. A série do caixa (receita × despesa).
create or replace function public.metrics_series(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text default 'day'::text, p_professional_id uuid default null::uuid)
 returns table(bucket timestamp with time zone, revenue numeric, expenses numeric)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with tx as (
    select
      date_trunc(
        case when p_granularity in ('hour', 'day', 'week', 'month') then p_granularity else 'day' end,
        coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo'
      ) at time zone 'America/Sao_Paulo' as bucket,
      t.type,
      t.amount
    from public.metrics_movimentos_pagos(p_tenant, p_branch_ids, p_from, p_to) t
    where not (t.type = 'INCOME' and t.payment_method is not distinct from 'INTERNAL_CREDIT')
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.id = t.appointment_id and a.professional_id = p_professional_id)
          or exists (select 1 from public.product_sales ps
                      where ps.id = t.product_sale_id and ps.sold_by = p_professional_id)
          or exists (select 1 from public.client_packages cpv
                      where cpv.id = t.client_package_id and cpv.sold_by = p_professional_id)
          or exists (select 1 from public.procedure_sales psv
                      where psv.id = t.procedure_sale_id and psv.sold_by = p_professional_id))
  )
  select
    tx.bucket,
    coalesce(sum(tx.amount) filter (where tx.type = 'INCOME'), 0),
    coalesce(sum(tx.amount) filter (where tx.type = 'EXPENSE'), 0)
  from tx
  group by tx.bucket
  order by tx.bucket;
$function$;

-- 8. As clientes que mais gastaram: a regra única.
create or replace function public.metrics_top_clients(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer default 10, p_professional_id uuid default null::uuid)
 returns table(client_id uuid, client_name text, total_spent numeric, appointments bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  spend as (
    select t.client_id, sum(t.amount) as total
    from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t
    where t.client_id is not null
    group by t.client_id
  ),
  visits as (
    select a.client_id, count(*) as n
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED' and a.client_id is not null
      and a.aconteceu_em between p_from and p_to
      and (p_professional_id is null or a.professional_id = p_professional_id)
    group by a.client_id
  )
  select sp.client_id, c.name, sp.total, coalesce(v.n, 0)
  from spend sp
  join public.clients c on c.id = sp.client_id
  left join visits v on v.client_id = sp.client_id
  order by sp.total desc
  limit p_limit;
$function$;

-- 9. A composição do financeiro (por forma, por categoria).
create or replace function public.metrics_financeiro_composicao(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(grupo text, chave text, valor numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with t as (
    select f.type::text as tipo, f.category, f.payment_method::text as forma, f.amount
      from public.metrics_movimentos_pagos(p_tenant, p_branch_ids, p_from, p_to) f
     where not (f.type = 'INCOME' and f.payment_method is not distinct from 'INTERNAL_CREDIT')
  )
  select 'FORMA', forma, round(sum(amount), 2) from t where tipo = 'INCOME' and forma is not null group by forma
  union all
  select 'RECEITA', coalesce(category, 'Sem categoria'), round(sum(amount), 2) from t where tipo = 'INCOME' group by 2
  union all
  select 'DESPESA', coalesce(category, 'Sem categoria'), round(sum(amount), 2) from t where tipo = 'EXPENSE' group by 2
$function$;

-- 10. O Fechamento do dia: o estorno de um pagamento de outro dia é SAÍDA hoje
-- (o da despesa, ENTRADA — o dinheiro voltou ao caixa).
create or replace function public.metrics_fechamento_do_dia(p_tenant uuid, p_branch uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(forma text, entradas numeric, saidas numeric, saldo numeric, lancamentos integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with t as (
    select case
             when r.payment_method is null and coalesce(r.loyalty_discount, 0) > 0 then 'PONTOS'
             when r.payment_method is null then 'SEM_FORMA'
             when r.payment_method = 'CREDIT_CARD' and coalesce(r.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || r.cartao_vezes
             else r.payment_method::text
           end as forma,
           case when r.estorno_de is null then r.amount else 0::numeric end as entrada,
           case when r.estorno_de is null then 0::numeric else -r.amount end as saida
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0
    union all
    select case
             when f.payment_method is null then 'SEM_FORMA'
             when f.payment_method = 'CREDIT_CARD' and coalesce(f.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || f.cartao_vezes
             else f.payment_method::text
           end,
           case when f.estorno_de is null then 0::numeric else -f.amount end,
           case when f.estorno_de is null then f.amount else 0::numeric end
      from public.metrics_movimentos_pagos(p_tenant, array[p_branch], p_from, p_to) f
     where f.type = 'EXPENSE' and f.amount <> 0
  )
  select coalesce(forma, 'TOTAL'), round(sum(entrada), 2), round(sum(saida), 2),
         round(sum(entrada) - sum(saida), 2), count(*)::integer
    from t
   group by grouping sets ((forma), ())
$function$;

-- 11. Os avisos do Fechamento: a taxa do estornado sai no dia do estorno.
create or replace function public.metrics_avisos_do_fechamento(p_tenant uuid, p_branch uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_desde timestamp with time zone)
 returns table(taxas numeric, movimentos_depois integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with receitas as (
    select r.amount, r.payment_method::text as metodo, coalesce(r.cartao_vezes, r.parcela_total, 1) as vezes, r.cartao_bandeira as bandeira,
           coalesce(r.paid_at, r.created_at) as quando
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0
  ), saidas as (
    select coalesce(f.paid_at, f.created_at) as quando
      from public.metrics_movimentos_pagos(p_tenant, array[p_branch], p_from, p_to) f
     where f.type = 'EXPENSE' and f.amount <> 0
  )
  select
    coalesce((select round(sum(r.amount * private.comissao_taxa_pct(p_tenant, r.metodo, r.vezes, r.bandeira) / 100), 2)
                from receitas r where r.metodo in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')), 0),
    case when p_desde is null then 0 else
      ((select count(*) from receitas r where r.quando > p_desde)
       + (select count(*) from saidas s where s.quando > p_desde))::integer
    end
$function$;

-- 12. Por quem recebeu: as ENTRADAS (o estorno de outro dia é saída da unidade).
create or replace function public.metrics_fechamento_por_quem_recebeu(p_tenant uuid, p_branch uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(pessoa uuid, nome text, forma text, entradas numeric, lancamentos integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with t as (
    select coalesce(
             r.recebido_por,
             case when coalesce(r.created_by, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   and abs(extract(epoch from (coalesce(r.paid_at, r.created_at) - r.created_at))) < 5
                  then (select u.id from public.users u where u.id = r.created_by::uuid and u.tenant_id = p_tenant) end
           ) as pessoa,
           case
             when r.payment_method is null and coalesce(r.loyalty_discount, 0) > 0 then 'PONTOS'
             when r.payment_method is null then 'SEM_FORMA'
             when r.payment_method = 'CREDIT_CARD' and coalesce(r.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || r.cartao_vezes
             else r.payment_method::text
           end as forma,
           r.amount
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0 and r.estorno_de is null
  )
  select t.pessoa, u.name, coalesce(t.forma, 'TOTAL'), round(sum(t.amount), 2), count(*)::integer
    from t
    left join public.users u on u.id = t.pessoa
   group by grouping sets ((t.pessoa, u.name, t.forma), (t.pessoa, u.name))
$function$;

-- 13. Os custos da venda: a despesa do fechamento das comissões pela régua.
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
    -- As taxas: a gravada nas parcelas da operadora; sem elas, a da configuração
    -- (o estorno de outro dia, negativo: a taxa do estornado sai no dia dele).
    select r.branch_id,
           coalesce(
             (select sum(rc.taxa) from public.recebiveis_do_cartao rc where rc.transaction_id = r.id),
             case when r.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                  then round(r.amount * private.comissao_taxa_pct(p_tenant, r.payment_method::text,
                         coalesce(r.cartao_vezes, r.parcela_total, 1), r.cartao_bandeira) / 100, 2)
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
    select date_trunc((select g from gran), coalesce(r.paid_at, r.created_at) at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as bucket,
           coalesce(
             (select sum(rc.taxa) from public.recebiveis_do_cartao rc where rc.transaction_id = r.id),
             case when r.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                  then round(r.amount * private.comissao_taxa_pct(p_tenant, r.payment_method::text,
                         coalesce(r.cartao_vezes, r.parcela_total, 1), r.cartao_bandeira) / 100, 2)
                  else 0 end
           ) as taxa,
           0::numeric as comissao, 0::numeric as despesa
      from public.metrics_receitas_pagas(p_tenant, coalesce((select array_agg(id) from scope), '{}'::uuid[]), p_from, p_to, p_professional_id) r
     where r.amount <> 0
    union all
    select date_trunc((select g from gran), c.released_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
           0::numeric, c.amount, 0::numeric
      from public.commissions c
      join scope s on s.id = c.branch_id
     where c.released_at between p_from and p_to
       and (p_professional_id is null or c.professional_id = p_professional_id)
    union all
    select date_trunc((select g from gran), coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
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

-- 14. O resultado: a compra de estoque paga pela régua.
create or replace function public.metrics_resultado(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(branch_id uuid, compra_de_estoque numeric, consumo_de_insumo numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  parcelas as (
    select t.branch_id, t.amount as compra, 0::numeric as consumo
      from public.metrics_movimentos_pagos(p_tenant, p_branch_ids, p_from, p_to) t
     where t.type = 'EXPENSE'
       and lower(btrim(coalesce(t.category, ''))) in ('compra de estoque', 'estoque')
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = t.appointment_id and a.professional_id = p_professional_id))
    union all
    select m.branch_id, 0::numeric, public.custo_do_movimento(m, p)
      from public.stock_movements m
      join scope s on s.id = m.branch_id
      left join public.products p on p.id = m.product_id
     where m.type = 'PROCEDURE_USAGE'
       and m.created_at between p_from and p_to
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = m.appointment_id and a.professional_id = p_professional_id))
    union all
    select v.branch_id, 0::numeric, v.custo - coalesce(v.custo_devolvido, 0)
      from public.product_sales v
      join scope s on s.id = v.branch_id
     where v.sold_at between p_from and p_to
       and v.estornada_em is null
       and (p_professional_id is null or v.sold_by = p_professional_id)
  )
  select x.branch_id, coalesce(sum(x.compra), 0), coalesce(sum(x.consumo), 0)
    from parcelas x
   group by grouping sets ((x.branch_id), ())
$function$;

create or replace function public.metrics_series_do_resultado(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text default 'day'::text, p_professional_id uuid default null::uuid)
 returns table(bucket timestamp with time zone, compra_de_estoque numeric, consumo_de_insumo numeric)
 language sql
 stable
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
    select date_trunc((select g from gran), coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as bucket,
           t.amount as compra, 0::numeric as consumo
      from public.metrics_movimentos_pagos(p_tenant, p_branch_ids, p_from, p_to) t
     where t.type = 'EXPENSE'
       and lower(btrim(coalesce(t.category, ''))) in ('compra de estoque', 'estoque')
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = t.appointment_id and a.professional_id = p_professional_id))
    union all
    select date_trunc((select g from gran), m.created_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
           0::numeric, public.custo_do_movimento(m, p)
      from public.stock_movements m
      join scope s on s.id = m.branch_id
      left join public.products p on p.id = m.product_id
     where m.type = 'PROCEDURE_USAGE'
       and m.created_at between p_from and p_to
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = m.appointment_id and a.professional_id = p_professional_id))
    union all
    select date_trunc((select g from gran), v.sold_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
           0::numeric, v.custo - coalesce(v.custo_devolvido, 0)
      from public.product_sales v
      join scope s on s.id = v.branch_id
     where v.sold_at between p_from and p_to
       and v.estornada_em is null
       and (p_professional_id is null or v.sold_by = p_professional_id)
  )
  select x.bucket, coalesce(sum(x.compra), 0), coalesce(sum(x.consumo), 0)
    from parcelas x
   group by x.bucket
   order by x.bucket
$function$;

-- 15. D3: os "Estornos do dia" são o que voltou às CLIENTES (o estorno de
-- receita, em dinheiro do caixa), com o dia do pagamento estornado: do mesmo dia
-- (já fora das entradas) ou de outro (a saída de hoje). O estorno de despesa e o
-- do uso do crédito na clínica (não é caixa) ficam fora.
create or replace function public.metrics_estornos_das_clientes_do_dia(p_tenant uuid, p_branch uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(id uuid, descricao text, forma text, vezes smallint, valor numeric, motivo text, pago_em timestamp with time zone, mesmo_dia boolean, total numeric, total_de_outros_dias numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with e as (
    select f.id, f.description, f.payment_method::text as forma, f.cartao_vezes, f.amount, f.estorno_motivo,
           coalesce(f.paid_at, f.created_at) as quando,
           coalesce(o.paid_at, o.created_at) as pago_em,
           (o.id is null or coalesce(o.paid_at, o.created_at) between p_from and p_to) as mesmo_dia
      from public.financial_transactions f
      join public.branches b on b.id = f.branch_id and b.tenant_id = p_tenant
      left join public.financial_transactions o on o.id = f.estorno_de
     where f.branch_id = p_branch and f.category = 'Estorno' and f.is_paid
       and f.type = 'EXPENSE'
       and f.payment_method is distinct from 'INTERNAL_CREDIT'
       and coalesce(f.paid_at, f.created_at) between p_from and p_to
  )
  select e.id, e.description, e.forma, e.cartao_vezes, e.amount, e.estorno_motivo, e.pago_em, e.mesmo_dia,
         sum(e.amount) over (),
         coalesce(sum(e.amount) filter (where not e.mesmo_dia) over (), 0)
    from e
   order by e.quando, e.id
$function$;
revoke execute on function public.metrics_estornos_das_clientes_do_dia(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_estornos_das_clientes_do_dia(uuid, uuid, timestamptz, timestamptz) to service_role;

-- 16. A45/D9: o que cada lançamento conta no CAIXA (com o sinal: + entrou,
-- − saiu; nulo, não conta), com a taxa e o líquido da receita — o "caixa da
-- lista" do Financeiro e as colunas do CSV. Somado numa janela, é a régua: o
-- pagamento pelo valor que entrou, no dia dele, e o estorno ligado, no dele.
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
               -- A receita: a taxa do que entrou (a gravada nas parcelas da operadora; sem elas, a da configuração).
               when v.no_caixa > 0 and t.type = 'INCOME' and coalesce(t.category, '') <> 'Estorno' then
                 coalesce(
                   (select sum(rc.taxa) from public.recebiveis_do_cartao rc where rc.transaction_id = t.id),
                   case when t.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                        then round(v.no_caixa * private.comissao_taxa_pct(p_tenant, t.payment_method::text,
                               coalesce(t.cartao_vezes, t.parcela_total, 1), t.cartao_bandeira) / 100, 2)
                        else 0 end)
               -- O estorno de uma receita: a taxa do que voltou sai (negativa).
               when v.no_caixa < 0 and t.category = 'Estorno' and o.type = 'INCOME' then
                 case when o.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                      then -round(t.amount * private.comissao_taxa_pct(p_tenant, o.payment_method::text,
                              coalesce(o.cartao_vezes, o.parcela_total, 1), o.cartao_bandeira) / 100, 2)
                      else 0 end
             end as taxa
    ) x
   where t.id = any (p_ids)
$function$;
revoke execute on function public.metrics_caixa_dos_lancamentos(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.metrics_caixa_dos_lancamentos(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
