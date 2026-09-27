-- `metrics_core.new_clients` passa a respeitar o filtro de unidade.
--
-- Contava os clientes novos da REDE INTEIRA mesmo quando a tela filtrava uma
-- unidade — enquanto `metrics_new_clients_series` (o gráfico ao lado) e
-- `metrics_by_branch` já respeitavam a unidade. O cartão e o gráfico da mesma
-- tela discordavam, que é exatamente o que o §13.1 existe para impedir.
-- Achado pelo primeiro teste com cenário conhecido de todos os indicadores
-- (`e2e/indicadores-cenario.spec.ts`, 2026-09-27).
--
-- A regra agora é a da série: com unidades escolhidas, conta os clientes delas
-- e os que não têm unidade (cadastro da rede). O resto da função não muda.
-- Junto, `search_path` fixo (aviso do advisor).

create or replace function public.metrics_core(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz,
  p_professional_id uuid default null
)
returns table(
  revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric,
  appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint,
  appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint,
  commissions_open numeric, commissions_paid numeric
)
language sql
stable
set search_path = ''
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
            where a.id = t.appointment_id and a.professional_id = p_professional_id))
  ),
  appt as (
    select a.*
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.scheduled_at >= p_from
      and a.scheduled_at <= p_to
      and (p_professional_id is null or a.professional_id = p_professional_id)
  ),
  comm as (
    select c.status, c.amount
    from public.commissions c
    join scope s on s.id = c.branch_id
    join public.appointments a on a.id = c.appointment_id
    where a.scheduled_at >= p_from
      and a.scheduled_at <= p_to
      and (p_professional_id is null or c.professional_id = p_professional_id)
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
    -- Novos clientes é métrica da unidade, não do profissional — e DA UNIDADE:
    -- a mesma regra de `metrics_new_clients_series`.
    case when p_professional_id is null
         then (select count(*) from public.clients c
                 where c.tenant_id = p_tenant
                   and c.created_at between p_from and p_to
                   and (p_branch_ids is null or c.branch_id is null or c.branch_id = any (p_branch_ids)))
         else 0 end,
    coalesce((select sum(c.amount) from comm c where c.status = 'OPEN'), 0),
    coalesce((select sum(c.amount) from comm c where c.status = 'PAID'), 0);
$function$;

revoke execute on function public.metrics_core(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant  execute on function public.metrics_core(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
