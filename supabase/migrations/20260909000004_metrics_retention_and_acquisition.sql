-- Retenção de verdade e série de aquisição de clientes (aba Clientes).
--
-- A tela chamava de "taxa de retenção" a proporção de clientes com 2+
-- atendimentos DENTRO da janela — que em "hoje" tende a zero por construção e
-- não mede retenção nenhuma. Retenção é quem já era cliente antes do período
-- e voltou nele.
--
-- E "novos clientes ao longo do tempo" era montado em JS sobre TODOS os
-- clientes já cadastrados, agrupando por 'dd/MM': a mesma data de anos
-- diferentes somava no mesmo ponto, e o corte final seguia a ordem de inserção
-- do objeto, não a cronológica.

create or replace function public.metrics_retention(
  p_tenant     uuid,
  p_branch_ids uuid[],
  p_from       timestamptz,
  p_to         timestamptz
)
returns table (
  clients_served     bigint,
  returning_clients  bigint,
  first_time_clients bigint
)
language sql
stable
as $fn$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant
      and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  served as (
    select distinct a.client_id
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED'
      and a.client_id is not null
      and a.scheduled_at between p_from and p_to
  ),
  had_history as (
    select sv.client_id
    from served sv
    where exists (
      select 1
      from public.appointments a2
      join scope s2 on s2.id = a2.branch_id
      where a2.client_id = sv.client_id
        and a2.status = 'COMPLETED'
        and a2.scheduled_at < p_from
    )
  )
  select
    (select count(*) from served),
    (select count(*) from had_history),
    (select count(*) from served) - (select count(*) from had_history);
$fn$;

create or replace function public.metrics_new_clients_series(
  p_tenant      uuid,
  p_branch_ids  uuid[],
  p_from        timestamptz,
  p_to          timestamptz,
  p_granularity text default 'day'
)
returns table (
  bucket timestamptz,
  count  bigint
)
language sql
stable
as $fn$
  select
    date_trunc(
      case when p_granularity in ('hour', 'day', 'month') then p_granularity else 'day' end,
      c.created_at at time zone 'America/Sao_Paulo'
    ) at time zone 'America/Sao_Paulo' as bucket,
    count(*)
  from public.clients c
  where c.tenant_id = p_tenant
    and (p_branch_ids is null or c.branch_id is null or c.branch_id = any (p_branch_ids))
    and c.created_at between p_from and p_to
  group by 1
  order by 1;
$fn$;

revoke all on function public.metrics_retention(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_retention(uuid, uuid[], timestamptz, timestamptz) to service_role;
revoke all on function public.metrics_new_clients_series(uuid, uuid[], timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.metrics_new_clients_series(uuid, uuid[], timestamptz, timestamptz, text) to service_role;

notify pgrst, 'reload schema';
