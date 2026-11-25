-- D16 da 28ª: o "Ranking — Recorrência" das clientes saía do ranking de GASTO
-- (metrics_top_clients: as 10 que mais pagaram, com os atendimentos ao lado) —
-- listava quem pagou sem vir ("0 atend.") e deixava de fora quem veio e pagou
-- antes do período. Princípio 3: recorrência é quem mais voltou. Esta conta os
-- atendimentos concluídos no recorte (a mesma régua da coluna "Atend." do
-- metrics_top_clients: aconteceu_em no período), só quem tem ao menos um, na
-- rede e na unidade do mesmo jeito.
create or replace function public.metrics_recorrencia_das_clientes(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz,
  p_limit integer default 5, p_professional_id uuid default null
)
returns table(client_id uuid, client_name text, appointments bigint)
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
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
  select v.client_id, c.name, v.n
  from visits v
  join public.clients c on c.id = v.client_id and c.tenant_id = p_tenant
  where v.n > 0
  order by v.n desc, c.name
  limit p_limit;
$function$;

revoke execute on function public.metrics_recorrencia_das_clientes(uuid, uuid[], timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;
grant execute on function public.metrics_recorrencia_das_clientes(uuid, uuid[], timestamptz, timestamptz, integer, uuid) to service_role;

notify pgrst, 'reload schema';
