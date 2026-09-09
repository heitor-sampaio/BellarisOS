-- Escopo por profissional em metrics_core.
--
-- O dashboard da filial mostra ao profissional que atende (e não gerencia a
-- agenda) apenas os próprios números. Sem este parâmetro, ao migrar a tela
-- para a camada de métricas ele passaria a ver os KPIs da unidade inteira.

create or replace function public.metrics_core(
  p_tenant          uuid,
  p_branch_ids      uuid[],
  p_from            timestamptz,
  p_to              timestamptz,
  p_professional_id uuid default null
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
      -- Com escopo de profissional, só o caixa ligado aos atendimentos dele.
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
    -- Novos clientes é métrica da unidade, não do profissional.
    case when p_professional_id is null
         then (select count(*) from public.clients c
                 where c.tenant_id = p_tenant and c.created_at between p_from and p_to)
         else 0 end,
    coalesce((select sum(c.amount) from comm c where c.status = 'OPEN'), 0),
    coalesce((select sum(c.amount) from comm c where c.status = 'PAID'), 0);
$fn$;

revoke all on function public.metrics_core(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_core(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';

-- `create or replace` com um parâmetro novo (mesmo com default) cria uma
-- SEGUNDA função em vez de substituir a de 4 argumentos. Duas sobrecargas do
-- mesmo nome deixam a resolução ambígua para quem chamar sem o parâmetro novo.
drop function if exists public.metrics_core(uuid, uuid[], timestamptz, timestamptz);

notify pgrst, 'reload schema';
