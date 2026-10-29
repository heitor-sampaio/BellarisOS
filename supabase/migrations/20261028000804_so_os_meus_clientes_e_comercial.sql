-- "Quem tem 'só os meus' vê 'só os meus', em qualquer lugar" (decisão do
-- Heitor, 2026-10-28) — o resto dos Relatórios: a aba Clientes (retenção e
-- novos clientes) e a aba Comercial (o painel e os motivos de perda).
--
-- Com os MESMOS predicados de metrics_core / 20261028000601 / 000803:
--   - metrics_retention(p_professional_id): as clientes que ELA atendeu no
--     período; "voltou" = já tinha sido atendida por ela antes (DECISÃO NOVA:
--     o retorno é à profissional, não à clínica).
--   - metrics_new_clients_series(p_professional_id): as novas que têm
--     agendamento NÃO CANCELADO com ela numa unidade do recorte (o novos
--     clientes de metrics_core).
--   - metrics_comercial(p_owner) e metrics_motivos_de_perda(p_owner): o CRM
--     "só os meus" — os leads dela e os sem dono (o recorte do quadro e de
--     metrics_lead_funnel); os agendamentos do comercial, os que ela marcou.
--
-- Corpos da produção (pg_get_functiondef em 2026-10-29) com o recorte a
-- mais. Assinatura nova: a antiga sai. Só service_role, como antes.

drop function if exists public.metrics_retention(uuid, uuid[], timestamptz, timestamptz);

create function public.metrics_retention(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null)
 returns table(clients_served bigint, returning_clients bigint, first_time_clients bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
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
      and a.aconteceu_em between p_from and p_to
      and (p_professional_id is null or a.professional_id = p_professional_id)
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
        and a2.aconteceu_em < p_from
        and (p_professional_id is null or a2.professional_id = p_professional_id)
    )
  )
  select
    (select count(*) from served),
    (select count(*) from had_history),
    (select count(*) from served) - (select count(*) from had_history);
$function$;

drop function if exists public.metrics_new_clients_series(uuid, uuid[], timestamptz, timestamptz, text);

create function public.metrics_new_clients_series(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text default 'day'::text, p_professional_id uuid default null)
 returns table(bucket timestamp with time zone, count bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  select
    date_trunc(
      case when p_granularity in ('hour', 'day', 'month') then p_granularity else 'day' end,
      c.created_at at time zone 'America/Sao_Paulo'
    ) at time zone 'America/Sao_Paulo' as bucket,
    count(*)
  from public.clients c
  where c.tenant_id = p_tenant
    and c.is_active
    and (p_branch_ids is null or c.branch_id is null or c.branch_id = any (p_branch_ids))
    and c.created_at between p_from and p_to
    and (p_professional_id is null or exists (
          select 1 from public.appointments a
          join public.branches b on b.id = a.branch_id
          where a.client_id = c.id and a.professional_id = p_professional_id
            and a.status <> 'CANCELLED'
            and b.tenant_id = p_tenant
            and (p_branch_ids is null or b.id = any (p_branch_ids))))
  group by 1
  order by 1;
$function$;

drop function if exists public.metrics_comercial(uuid, uuid[], timestamptz, timestamptz);

create function public.metrics_comercial(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_owner uuid default null)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with l as (
    select ld.client_id, ld.owner_id
      from public.leads ld
     where ld.tenant_id = p_tenant and ld.created_at between p_from and p_to
       -- "Só os meus": os dela e os sem dono (o bolo comum), como o quadro.
       and (p_owner is null or ld.owner_id is null or ld.owner_id = p_owner)
  ), a as (
    select ap.status::text as status, ap.created_by_id
      from public.appointments ap
     where ap.branch_id = any (p_branch_ids)
       and ap.source::text = 'COMMERCIAL'
       and ap.scheduled_at between p_from and p_to
       and (p_owner is null or ap.created_by_id = p_owner)
  ), por_dono as (
    select dono, sum(leads)::int as leads, sum(convertidos)::int as convertidos, sum(agendamentos)::int as agendamentos
      from (select owner_id as dono, 1 as leads, (client_id is not null)::int as convertidos, 0 as agendamentos from l
            union all
            select created_by_id, 0, 0, 1 from a) x
     group by dono
  )
  select jsonb_build_object(
    'total_leads',  (select count(*) from l),
    'convertidos',  (select count(*) from l where client_id is not null),
    'agendados',    (select count(*) from a),
    'considerados', (select count(*) from a where status <> 'CANCELLED'),
    'realizados',   (select count(*) from a where status = 'COMPLETED'),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object(
                  'dono', dono, 'leads', leads, 'convertidos', convertidos, 'agendamentos', agendamentos))
                from por_dono), '[]'::jsonb)
  )
$function$;

drop function if exists public.metrics_motivos_de_perda(uuid, timestamptz, timestamptz);

create function public.metrics_motivos_de_perda(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_owner uuid default null)
 returns table(motivo text, total integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(m.nome, 'Sem motivo') as motivo, count(*)::integer as total
    from public.leads l
    left join public.crm_motivos_perda m on m.id = l.motivo_perda_id
   where l.tenant_id = p_tenant and l.perdido_em between p_from and p_to
     and (p_owner is null or l.owner_id is null or l.owner_id = p_owner)
   group by coalesce(m.nome, 'Sem motivo')
   order by count(*) desc, 1;
$function$;

revoke execute on function public.metrics_retention(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_new_clients_series(uuid, uuid[], timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_comercial(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_motivos_de_perda(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

grant execute on function public.metrics_retention(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_new_clients_series(uuid, uuid[], timestamptz, timestamptz, text, uuid) to service_role;
grant execute on function public.metrics_comercial(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_motivos_de_perda(uuid, timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
