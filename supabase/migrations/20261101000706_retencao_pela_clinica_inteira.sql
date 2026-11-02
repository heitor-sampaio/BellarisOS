-- F7 (ind-08, revisão de 2026-11-02: "mudar"): na retenção, "já tinha vindo"
-- é quem a CLÍNICA já tinha atendido, em QUALQUER unidade da rede — não só
-- nas do recorte. "A cliente é da clínica" (H5): a Carla atendida na Moinhos
-- em setembro e na Zona Sul em outubro contava como nova olhando a Zona Sul.
-- As atendidas no período continuam as do recorte. A partir do corpo ATUAL.

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
  'public.metrics_retention(uuid,uuid[],timestamptz,timestamptz,uuid)',
  array[E'      join scope s2 on s2.id = a2.branch_id\n'],
  array[E'      -- ind-08: a clínica INTEIRA, não só as unidades do recorte.\n      join public.branches b2 on b2.id = a2.branch_id and b2.tenant_id = p_tenant\n'],
  array[1]);

notify pgrst, 'reload schema';
