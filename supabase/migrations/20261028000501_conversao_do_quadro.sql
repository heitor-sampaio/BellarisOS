-- D10 da simulação de 2026-10-28: a conversão de Oportunidades é a de
-- lib/metrics. O quadro dizia "0% de conversão · 2 viraram clientes" e o
-- dashboard e os Relatórios, 66,7%: o quadro contava só a etapa de GANHO e
-- somava no navegador (§13.1). Agora a conta é uma só, a desta função
-- (`converted` = o lead que virou cliente), e o quadro a chama no recorte que
-- mostra:
--   - o funil de AGORA: sem período (p_from e p_to nulos = sem limite);
--   - "só os meus" (o CRM em OWN): os leads da pessoa e os sem dono
--     (p_owner), o mesmo filtro da lista do quadro.
-- O corpo é o da produção (pg_get_functiondef em 2026-10-28) com os dois
-- recortes a mais; o `between` virou `>=`/`<=` para aceitar o nulo.
-- Parâmetro novo muda a assinatura: a antiga sai, senão a chamada com cinco
-- argumentos ficaria ambígua entre as duas.

drop function if exists public.metrics_lead_funnel(uuid, uuid[], timestamptz, timestamptz, uuid);

create function public.metrics_lead_funnel(
  p_tenant     uuid,
  p_branch_ids uuid[],
  p_from       timestamptz,
  p_to         timestamptz,
  p_funnel     uuid default null,
  p_owner      uuid default null
)
returns table(stage_id uuid, stage_name text, stage_position integer, stage_outcome text, leads bigint, converted bigint)
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  with alvo as (
    select coalesce(
      p_funnel,
      (select f.id from public.crm_funnels f
        where f.tenant_id = p_tenant and f.is_default
        limit 1)
    ) as funnel_id
  ),
  scoped_leads as (
    select l.id, l.client_id, l.crm_stage_id
    from public.leads l
    where l.tenant_id = p_tenant
      and (p_from is null or l.created_at >= p_from)
      and (p_to   is null or l.created_at <= p_to)
      and (p_branch_ids is null or l.branch_id is null or l.branch_id = any (p_branch_ids))
      -- "Só os meus": os dele e os sem dono (o bolo comum), como o quadro.
      and (p_owner is null or l.owner_id is null or l.owner_id = p_owner)
  )
  select
    st.id,
    st.name::text,
    st.position::int,
    st.outcome,
    count(l.id),
    count(l.id) filter (where l.client_id is not null)
  from public.crm_stages st
  left join scoped_leads l on l.crm_stage_id = st.id
  where st.tenant_id = p_tenant
    and st.funnel_id = (select funnel_id from alvo)
  group by st.id, st.name, st.position, st.outcome
  order by st.position;
$function$;

revoke all on function public.metrics_lead_funnel(uuid, uuid[], timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.metrics_lead_funnel(uuid, uuid[], timestamptz, timestamptz, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
