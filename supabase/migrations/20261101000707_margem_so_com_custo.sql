-- F7 (A13 da 5ª simulação): o "Ranking — Procedimentos por margem" mostrava
-- "100%" em todos os procedimentos sem custo cadastrado (sem insumo, mão de
-- obra nem outros custos, a margem é 100% por construção). O ranking passa a
-- listar só o procedimento com custo cadastrado; sem nenhum, a tela diz
-- "Sem custo cadastrado nos procedimentos". A partir do corpo ATUAL.

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
  'public.metrics_margem_procedimentos(uuid,integer)',
  array['     where pr.tenant_id = p_tenant and coalesce(pr.is_active, true) and coalesce(pr.price, 0) > 0'],
  array[E'     where pr.tenant_id = p_tenant and coalesce(pr.is_active, true) and coalesce(pr.price, 0) > 0\n       -- A13: sem custo cadastrado, não há margem a mostrar (seria 100%).\n       and c.custo > 0'],
  array[1]);

notify pgrst, 'reload schema';
