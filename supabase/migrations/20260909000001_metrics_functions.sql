-- Funções de indicadores (fonte única de agregação).
--
-- Motivação: cada tela somava em JavaScript o resultado de um `select` sem
-- limite. O PostgREST corta em 1000 linhas, então receita, atendimentos e
-- rankings sub-contavam em silêncio assim que a rede crescia. Além disso cada
-- superfície reimplementava a fórmula, e elas divergiam entre si.
--
-- Convenções destas funções:
--   * Escopo: sempre p_tenant; p_branch_ids null = todas as filiais do tenant
--     (inclusive inativas, para o histórico não sumir dos totais).
--   * Caixa (recebido/pago): eixo em coalesce(paid_at, created_at).
--   * Competência de serviço: eixo em appointments.scheduled_at.
--   * Estorno: a transação estornada E a contra-transação são excluídas, para
--     o par se anular uma vez só (antes o impacto era contado em dobro).
--   * Buckets temporais em America/Sao_Paulo, não no fuso do servidor.

-- ─── Núcleo: um KPI por coluna, uma linha ────────────────────────────────────
create or replace function public.metrics_core(
  p_tenant     uuid,
  p_branch_ids uuid[],
  p_from       timestamptz,
  p_to         timestamptz
)
returns table (
  revenue_cash           numeric,
  revenue_pending        numeric,
  expenses_cash          numeric,
  service_revenue        numeric,
  appointments_completed bigint,
  appointments_total     bigint,
  appointments_cancelled bigint,
  appointments_no_show   bigint,
  scheduled_minutes      bigint,
  new_clients            bigint,
  commissions_open       numeric,
  commissions_paid       numeric
)
language sql
stable
as $fn$
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
  ),
  appt as (
    select a.*
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.scheduled_at >= p_from
      and a.scheduled_at <= p_to
  ),
  comm as (
    select c.status, c.amount
    from public.commissions c
    join scope s on s.id = c.branch_id
    join public.appointments a on a.id = c.appointment_id
    where a.scheduled_at >= p_from
      and a.scheduled_at <= p_to
  )
  select
    coalesce((select sum(t.amount) from tx t
               where t.type = 'INCOME' and t.is_paid
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(t.amount) from tx t
               where t.type = 'INCOME' and not t.is_paid
                 and t.created_at between p_from and p_to), 0),
    coalesce((select sum(t.amount) from tx t
               where t.type = 'EXPENSE' and t.is_paid
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(a.price) from appt a where a.status = 'COMPLETED'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED'),
    (select count(*) from appt),
    (select count(*) from appt a where a.status = 'CANCELLED'),
    (select count(*) from appt a where a.status = 'NO_SHOW'),
    coalesce((select sum(a.duration_min) from appt a
               where a.status not in ('CANCELLED', 'NO_SHOW')), 0),
    (select count(*) from public.clients c
       where c.tenant_id = p_tenant and c.created_at between p_from and p_to),
    coalesce((select sum(c.amount) from comm c where c.status = 'OPEN'), 0),
    coalesce((select sum(c.amount) from comm c where c.status = 'PAID'), 0);
$fn$;

-- ─── Quebra por filial ───────────────────────────────────────────────────────
create or replace function public.metrics_by_branch(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  branch_id              uuid,
  branch_name            text,
  branch_slug            text,
  is_active              boolean,
  revenue_cash           numeric,
  revenue_pending        numeric,
  expenses_cash          numeric,
  service_revenue        numeric,
  appointments_completed bigint,
  appointments_total     bigint,
  appointments_cancelled bigint,
  appointments_no_show   bigint,
  scheduled_minutes      bigint,
  new_clients            bigint,
  commissions_open       numeric,
  commissions_paid       numeric,
  transactions_count     bigint
)
language sql
stable
as $fn$
  select
    b.id, b.name, b.slug, b.is_active,
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and not t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and t.created_at between p_from and p_to), 0),
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'EXPENSE' and t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(a.price) from public.appointments a
               where a.branch_id = b.id and a.status = 'COMPLETED'
                 and a.scheduled_at between p_from and p_to), 0),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'COMPLETED'
         and a.scheduled_at between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.scheduled_at between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'CANCELLED'
         and a.scheduled_at between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'NO_SHOW'
         and a.scheduled_at between p_from and p_to),
    coalesce((select sum(a.duration_min) from public.appointments a
               where a.branch_id = b.id and a.status not in ('CANCELLED', 'NO_SHOW')
                 and a.scheduled_at between p_from and p_to), 0),
    (select count(*) from public.clients c
       where c.branch_id = b.id and c.created_at between p_from and p_to),
    coalesce((select sum(c.amount) from public.commissions c
               join public.appointments a on a.id = c.appointment_id
               where c.branch_id = b.id and c.status = 'OPEN'
                 and a.scheduled_at between p_from and p_to), 0),
    coalesce((select sum(c.amount) from public.commissions c
               join public.appointments a on a.id = c.appointment_id
               where c.branch_id = b.id and c.status = 'PAID'
                 and a.scheduled_at between p_from and p_to), 0),
    (select count(*) from public.financial_transactions t
       where t.branch_id = b.id
         and coalesce(t.paid_at, t.created_at) between p_from and p_to)
  from public.branches b
  where b.tenant_id = p_tenant
  order by b.name;
$fn$;

-- ─── Série temporal (buckets no fuso do negócio) ─────────────────────────────
create or replace function public.metrics_series(
  p_tenant      uuid,
  p_branch_ids  uuid[],
  p_from        timestamptz,
  p_to          timestamptz,
  p_granularity text default 'day'
)
returns table (
  bucket   timestamptz,
  revenue  numeric,
  expenses numeric
)
language sql
stable
as $fn$
  with scope as (
    select b.id
    from public.branches b
    where b.tenant_id = p_tenant
      and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  tx as (
    select
      date_trunc(
        case when p_granularity in ('hour', 'day', 'month') then p_granularity else 'day' end,
        coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo'
      ) at time zone 'America/Sao_Paulo' as bucket,
      t.type,
      t.amount
    from public.financial_transactions t
    join scope s on s.id = t.branch_id
    where t.is_paid
      and coalesce(t.notes, '')    <> 'Estornada'
      and coalesce(t.category, '') <> 'Estorno'
      and coalesce(t.paid_at, t.created_at) between p_from and p_to
  )
  select
    tx.bucket,
    coalesce(sum(tx.amount) filter (where tx.type = 'INCOME'), 0),
    coalesce(sum(tx.amount) filter (where tx.type = 'EXPENSE'), 0)
  from tx
  group by tx.bucket
  order by tx.bucket;
$fn$;

-- ─── Rankings ────────────────────────────────────────────────────────────────
create or replace function public.metrics_top_procedures(
  p_tenant     uuid,
  p_branch_ids uuid[],
  p_from       timestamptz,
  p_to         timestamptz,
  p_limit      int default 5
)
returns table (
  procedure_id   uuid,
  procedure_name text,
  appointments   bigint,
  revenue        numeric,
  repeat_visits  bigint,
  avg_rating     numeric,
  rating_count   bigint
)
language sql
stable
as $fn$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  appt as (
    select a.procedure_id, a.client_id, a.price, a.procedure_rating
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED'
      and a.scheduled_at between p_from and p_to
      and a.procedure_id is not null
  ),
  per_client as (
    select ap.procedure_id, ap.client_id, count(*) as visits
    from appt ap where ap.client_id is not null
    group by ap.procedure_id, ap.client_id
  )
  select
    a.procedure_id,
    p.name,
    count(*),
    coalesce(sum(a.price), 0),
    coalesce((select sum(greatest(pc.visits - 1, 0)) from per_client pc
               where pc.procedure_id = a.procedure_id), 0),
    avg(a.procedure_rating) filter (where a.procedure_rating is not null),
    count(*) filter (where a.procedure_rating is not null)
  from appt a
  join public.procedures p on p.id = a.procedure_id
  group by a.procedure_id, p.name
  order by count(*) desc
  limit p_limit;
$fn$;

create or replace function public.metrics_top_professionals(
  p_tenant     uuid,
  p_branch_ids uuid[],
  p_from       timestamptz,
  p_to         timestamptz,
  p_limit      int default 5
)
returns table (
  professional_id   uuid,
  professional_name text,
  appointments      bigint,
  revenue           numeric,
  commission        numeric,
  avg_rating        numeric,
  rating_count      bigint
)
language sql
stable
as $fn$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  appt as (
    select a.id, a.professional_id, a.price, a.client_rating
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED'
      and a.scheduled_at between p_from and p_to
      and a.professional_id is not null
  )
  select
    a.professional_id,
    u.name,
    count(*),
    coalesce(sum(a.price), 0),
    coalesce((select sum(c.amount) from public.commissions c
               where c.professional_id = a.professional_id
                 and c.appointment_id in (select ap.id from appt ap)), 0),
    avg(a.client_rating) filter (where a.client_rating is not null),
    count(*) filter (where a.client_rating is not null)
  from appt a
  join public.users u on u.id = a.professional_id
  group by a.professional_id, u.name
  order by count(*) desc
  limit p_limit;
$fn$;

create or replace function public.metrics_top_clients(
  p_tenant     uuid,
  p_branch_ids uuid[],
  p_from       timestamptz,
  p_to         timestamptz,
  p_limit      int default 10
)
returns table (
  client_id    uuid,
  client_name  text,
  total_spent  numeric,
  appointments bigint
)
language sql
stable
as $fn$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  spend as (
    select t.client_id, sum(t.amount) as total
    from public.financial_transactions t
    join scope s on s.id = t.branch_id
    where t.type = 'INCOME' and t.is_paid and t.client_id is not null
      and coalesce(t.notes, '')    <> 'Estornada'
      and coalesce(t.category, '') <> 'Estorno'
      and coalesce(t.paid_at, t.created_at) between p_from and p_to
    group by t.client_id
  ),
  visits as (
    select a.client_id, count(*) as n
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED' and a.client_id is not null
      and a.scheduled_at between p_from and p_to
    group by a.client_id
  )
  select sp.client_id, c.name, sp.total, coalesce(v.n, 0)
  from spend sp
  join public.clients c on c.id = sp.client_id
  left join visits v on v.client_id = sp.client_id
  order by sp.total desc
  limit p_limit;
$fn$;

-- ─── Funil de leads e conversão ──────────────────────────────────────────────
-- Leads de rede (branch_id null) contam sempre; o recorte por filial só filtra
-- os leads que já nasceram numa unidade. Leads sem etapa caem na primeira,
-- mesma regra do board do CRM — antes eles sumiam do funil do /admin/comercial.
create or replace function public.metrics_lead_funnel(
  p_tenant     uuid,
  p_branch_ids uuid[],
  p_from       timestamptz,
  p_to         timestamptz
)
returns table (
  stage_id       uuid,
  stage_name     text,
  stage_position int,
  leads          bigint,
  converted      bigint
)
language sql
stable
as $fn$
  with scoped_leads as (
    select l.id, l.client_id, l.crm_stage_id
    from public.leads l
    where l.tenant_id = p_tenant
      and l.created_at between p_from and p_to
      and (p_branch_ids is null or l.branch_id is null or l.branch_id = any (p_branch_ids))
  ),
  first_stage as (
    select min(s.position) as pos from public.crm_stages s where s.tenant_id = p_tenant
  )
  select
    st.id, st.name, st.position,
    count(l.id),
    count(l.id) filter (where l.client_id is not null)
  from public.crm_stages st
  left join scoped_leads l
    on l.crm_stage_id = st.id
    or (l.crm_stage_id is null and st.position = (select pos from first_stage))
  where st.tenant_id = p_tenant
  group by st.id, st.name, st.position
  order by st.position;
$fn$;

-- Só o service_role executa: são leituras já escopadas por p_tenant, e o app
-- resolve o tenant a partir do JWT antes de chamar.
do $grants$
declare fn text;
begin
  foreach fn in array array[
    'metrics_core(uuid, uuid[], timestamptz, timestamptz)',
    'metrics_by_branch(uuid, timestamptz, timestamptz)',
    'metrics_series(uuid, uuid[], timestamptz, timestamptz, text)',
    'metrics_top_procedures(uuid, uuid[], timestamptz, timestamptz, int)',
    'metrics_top_professionals(uuid, uuid[], timestamptz, timestamptz, int)',
    'metrics_top_clients(uuid, uuid[], timestamptz, timestamptz, int)',
    'metrics_lead_funnel(uuid, uuid[], timestamptz, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $grants$;
