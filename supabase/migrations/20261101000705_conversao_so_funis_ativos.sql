-- F7 (ind-07, revisão de 2026-11-02: "mudar"): a conversão que junta os
-- funis (Relatórios → Comercial, metrics_comercial) olha só os funis ATIVOS.
-- O "tem ganho" valia para etapa de ganho em qualquer funil, inclusive
-- arquivado: o único funil com ganho arquivado e os ativos sem ganho davam
-- "0%" em vez de "—". As oportunidades (e os ganhos) passam a ser as dos
-- funis ativos — a oportunidade sem etapa continua contando. A partir do
-- corpo ATUAL da produção.

create function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.metrics_comercial(uuid,uuid[],timestamptz,timestamptz,uuid)',
  array[
    E'      left join public.crm_stages st on st.id = ld.crm_stage_id\n     where ld.tenant_id = p_tenant and ld.created_at between p_from and p_to\n',
    $de$exists (select 1 from public.crm_stages st where st.tenant_id = p_tenant and st.outcome = 'WON')$de$
  ],
  array[
    E'      left join public.crm_stages st on st.id = ld.crm_stage_id\n      left join public.crm_funnels fu on fu.id = st.funnel_id\n     where ld.tenant_id = p_tenant and ld.created_at between p_from and p_to\n       -- ind-07: só os funis ATIVOS (a oportunidade sem etapa segue contando).\n       and fu.archived_at is null\n',
    $para$exists (select 1 from public.crm_stages st join public.crm_funnels fu on fu.id = st.funnel_id
                     where st.tenant_id = p_tenant and st.outcome = 'WON' and fu.archived_at is null)$para$
  ],
  array[1, 1]);

notify pgrst, 'reload schema';
