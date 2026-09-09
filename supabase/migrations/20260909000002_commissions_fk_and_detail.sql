-- FK que faltava em commissions.appointment_id + extrato de comissões.
--
-- Sem a FK não havia integridade referencial e o PostgREST não conseguia
-- relacionar commissions com appointments, então nenhuma tela conseguia ler
-- a data do atendimento que originou a comissão. Como `commissions` também
-- não tem `created_at`, as telas filtravam por essa coluna inexistente: o
-- PostgREST devolvia 42703, o erro era descartado e todo indicador de
-- comissão exibia R$ 0,00 permanentemente.

alter table public.commissions
  add constraint commissions_appointment_id_fkey
  foreign key (appointment_id) references public.appointments(id) on delete cascade;

create index if not exists idx_commissions_appointment on public.commissions(appointment_id);

-- Extrato de comissões do período. O período de referência é o do atendimento.
create or replace function public.metrics_commissions_detail(
  p_tenant     uuid,
  p_branch_ids uuid[],
  p_from       timestamptz,
  p_to         timestamptz
)
returns table (
  id                uuid,
  professional_id   uuid,
  professional_name text,
  amount            numeric,
  is_paid           boolean,
  reference_at      timestamptz
)
language sql
stable
as $fn$
  select c.id, c.professional_id, u.name, c.amount, c.status = 'PAID', a.scheduled_at
  from public.commissions c
  join public.branches b     on b.id = c.branch_id
  join public.appointments a on a.id = c.appointment_id
  left join public.users u   on u.id = c.professional_id
  where b.tenant_id = p_tenant
    and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
    and a.scheduled_at between p_from and p_to
  order by u.name, a.scheduled_at desc;
$fn$;

revoke all on function public.metrics_commissions_detail(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_commissions_detail(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
