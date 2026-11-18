-- A29 da 23ª simulação (princípio 4: não chutar número): o "Comparecimento"
-- da aba Comercial dos Relatórios dizia 0,0% com um único agendamento
-- comercial no período — o de AMANHÃ. `considerados` era tudo que não foi
-- cancelado, o futuro incluído. Considerado é o que já devia ter acontecido
-- (`aconteceu_em <= now()`); sem nenhum, a tela diz "—" (painel-comercial.ts).
-- O resto da função é o de 20261112006801 (C49), sem mudança.
create or replace function public.metrics_comercial(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_owner uuid default null::uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with l as (
    select ld.client_id, ld.owner_id, (st.outcome = 'WON') as ganho
      from public.leads ld
      left join public.crm_stages st on st.id = ld.crm_stage_id
      left join public.crm_funnels fu on fu.id = st.funnel_id
     where ld.tenant_id = p_tenant and ld.created_at between p_from and p_to
       -- ind-07: só os funis ATIVOS (a oportunidade sem etapa segue contando).
       and fu.archived_at is null
       -- "Só os meus": os dela e os sem dono (o bolo comum), como o quadro.
       and (p_owner is null or ld.owner_id is null or ld.owner_id = p_owner)
  ), a as (
    select ap.status::text as status, ap.created_by_id, ap.aconteceu_em
      from public.appointments ap
     where ap.branch_id = any (p_branch_ids)
       and ap.source::text = 'COMMERCIAL'
       -- C49: o atendimento conta quando ACONTECEU (D13), como todo indicador de agenda.
       and ap.aconteceu_em between p_from and p_to
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
    'tem_ganho',    exists (select 1 from public.crm_stages st join public.crm_funnels fu on fu.id = st.funnel_id
                     where st.tenant_id = p_tenant and st.outcome = 'WON' and fu.archived_at is null),
    'agendados',    (select count(*) from a),
    -- A29 da 23ª: só o que já devia ter acontecido (o de amanhã não é falta).
    'considerados', (select count(*) from a where status <> 'CANCELLED' and aconteceu_em <= now()),
    'realizados',   (select count(*) from a where status = 'COMPLETED'),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object(
                  'dono', dono, 'leads', leads, 'convertidos', convertidos, 'ganhos', ganhos, 'agendamentos', agendamentos))
                from por_dono), '[]'::jsonb)
  )
$function$;

notify pgrst, 'reload schema';
