-- A19 da 37ª simulação (2026-11-27; LU-14 e princípio 3): recortado o
-- dashboard da rede a uma unidade, "Procedimentos por margem" listava um
-- procedimento que só existe na OUTRA unidade (a Massagem com pedras, de
-- Açailândia, no recorte de Imperatriz). metrics_margem_procedimentos_na_unidade
-- lia o catálogo inteiro da rede.
--
-- A régua de "a unidade oferece o procedimento" é uma só (ofereceNaUnidade,
-- lib/procedimentos/disponivel-na-unidade.ts; D7 da 13ª/F65; a mesma da busca
-- universal, 20261106003401): o procedimento DA unidade (branch_id = ela); o
-- da rede (branch_id nulo) sem disponibilidade cadastrada, que vale em todas;
-- ou o da rede com a unidade na disponibilidade (procedure_branch_availability).
--
-- Troca de trecho no corpo VIVO, com a conferência da contagem. A rede inteira
-- (metrics_margem_procedimentos) segue o catálogo.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
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
end $f$;

select pg_temp.trocar_no_corpo(
  'public.metrics_margem_procedimentos_na_unidade(uuid, uuid, integer)'::regprocedure,
  array[$t$and exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant)$t$],
  array[$t$and exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant)
       -- A19 da 37ª: só o que a unidade oferece (a régua de ofereceNaUnidade).
       and (pr.branch_id = p_unidade or (
              pr.branch_id is null and (
                not exists (select 1 from public.procedure_branch_availability av where av.procedure_id = pr.id)
                or exists (select 1 from public.procedure_branch_availability av
                           where av.procedure_id = pr.id and av.branch_id = p_unidade))))$t$],
  array[1]
);

notify pgrst, 'reload schema';
