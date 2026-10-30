-- A conversão é da OPORTUNIDADE (decisão do Heitor, 2026-10-29: "o objeto é a
-- oportunidade"): conversão = oportunidades na etapa de ganho (desfecho WON)
-- ÷ oportunidades, sem importar se a pessoa já é cliente. O quadro, o
-- dashboard e o funil dos Relatórios fazem a conta em lib/metrics
-- (`resumoDoFunil`) sobre metrics_lead_funnel, que já devolve as etapas com o
-- desfecho — nada muda lá.
--
-- O painel Comercial dos Relatórios JUNTA os funis (todas as oportunidades
-- da rede criadas no período), e contava `convertidos` = com cliente ligado.
-- Ganha aqui:
--   - `ganhos`: as oportunidades do período numa etapa WON, de qualquer funil;
--   - `tem_ganho`: a rede tem ao menos uma etapa de ganho (sem nenhuma, a
--     conversão é "—");
--   - no ranking por dono, `ganhos` (a coluna "Conv." do vendedor).
-- `convertidos` fica (é o "já é cliente", informativo). Mesma assinatura:
-- create or replace. Só service_role, como antes.

create or replace function public.metrics_comercial(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_owner uuid default null)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with l as (
    select ld.client_id, ld.owner_id, (st.outcome = 'WON') as ganho
      from public.leads ld
      left join public.crm_stages st on st.id = ld.crm_stage_id
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
    select dono, sum(leads)::int as leads, sum(convertidos)::int as convertidos,
           sum(ganhos)::int as ganhos, sum(agendamentos)::int as agendamentos
      from (select owner_id as dono, 1 as leads, (client_id is not null)::int as convertidos,
                   coalesce(ganho, false)::int as ganhos, 0 as agendamentos from l
            union all
            select created_by_id, 0, 0, 0, 1 from a) x
     group by dono
  )
  select jsonb_build_object(
    'total_leads',  (select count(*) from l),
    'convertidos',  (select count(*) from l where client_id is not null),
    'ganhos',       (select count(*) from l where ganho),
    'tem_ganho',    exists (select 1 from public.crm_stages st where st.tenant_id = p_tenant and st.outcome = 'WON'),
    'agendados',    (select count(*) from a),
    'considerados', (select count(*) from a where status <> 'CANCELLED'),
    'realizados',   (select count(*) from a where status = 'COMPLETED'),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object(
                  'dono', dono, 'leads', leads, 'convertidos', convertidos, 'ganhos', ganhos, 'agendamentos', agendamentos))
                from por_dono), '[]'::jsonb)
  )
$function$;

revoke execute on function public.metrics_comercial(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_comercial(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
