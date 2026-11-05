-- A conversão por ORIGEM no Funil comercial (A20 da 7ª simulação, 2026-11-05):
-- "para quem decide onde investir em anúncio, é o número que falta". A conta é
-- a da conversão de sempre (indicadores.md: as oportunidades na etapa de GANHO
-- ÷ as oportunidades), sobre as mesmas oportunidades de `metrics_comercial`
-- (criadas no período, só os funis ATIVOS, e o "só os meus" com os sem dono),
-- agrupadas pela origem do lead. Sem origem, "Sem origem". A divisão é de
-- lib/metrics (`conversaoDasOportunidades`), não do banco nem da tela.

create or replace function public.metrics_conversao_por_origem(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_owner uuid default null
)
 returns table(origem text, leads integer, ganhos integer)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(nullif(trim(ld.source), ''), 'Sem origem') as origem,
         count(*)::integer as leads,
         count(*) filter (where st.outcome = 'WON')::integer as ganhos
    from public.leads ld
    left join public.crm_stages st on st.id = ld.crm_stage_id
    left join public.crm_funnels fu on fu.id = st.funnel_id
   where ld.tenant_id = p_tenant and ld.created_at between p_from and p_to
     and fu.archived_at is null
     and (p_owner is null or ld.owner_id is null or ld.owner_id = p_owner)
   group by 1
   order by count(*) desc, 1;
$function$;

revoke execute on function public.metrics_conversao_por_origem(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_conversao_por_origem(uuid, timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
