-- A3 da 38ª simulação (2026-11-27; plataforma:AD-13, princípio 3 — decisão do
-- Claude, 27/11): salvar o procedimento sem mexer na comissão apagava e recriava
-- as regras dela (comissao_do_procedimento_definir: delete + insert), e a
-- Auditoria dizia "Criou 1 e apagou 1 regras de comissão de Peeling (30%)" de
-- uma comissão que ninguém mudou. Quando as regras pedidas são as mesmas que
-- estão gravadas (quem, o tipo, o valor; todas ativas), nada se grava.
--
-- Troca de trecho no corpo VIVO (pg_temp.trocar_no_corpo, com a conferência da
-- contagem, como em 20261130100007). O "Descontar a taxa da maquininha" segue
-- antes da conferência: ele já só grava quando muda.

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
  'public.comissao_do_procedimento_definir(uuid, uuid, jsonb, jsonb, uuid, text)'::regprocedure,
  array[$t$  delete from public.commission_rules r where r.procedure_id = p_procedimento and r.tenant_id = p_tenant;$t$],
  array[$t$  -- A3 da 38ª: a comissão pedida é a gravada — nada se apaga nem se recria.
  if array(select coalesce(r.professional_id::text, '') || '|' || r.type::text || '|' || trim_scale(r.value)::text || '|' || r.is_active::text
             from public.commission_rules r where r.procedure_id = p_procedimento and r.tenant_id = p_tenant order by 1)
     = array(select x from (
         select '|' || (p_geral->>'tipo') || '|' || trim_scale((p_geral->>'valor')::numeric)::text || '|true' as x
          where p_geral is not null
         union all
         select ((e->>'professional_id')::uuid)::text || '|' || (e->>'tipo') || '|' || trim_scale((e->>'valor')::numeric)::text || '|true'
           from jsonb_array_elements(coalesce(p_profissionais, '[]'::jsonb)) e
       ) s order by 1)
  then
    return;
  end if;

  delete from public.commission_rules r where r.procedure_id = p_procedimento and r.tenant_id = p_tenant;$t$],
  array[1]
);

-- O create or replace mantém os privilégios; reafirmados (função que recebe a rede por parâmetro).
revoke execute on function public.comissao_do_procedimento_definir(uuid, uuid, jsonb, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.comissao_do_procedimento_definir(uuid, uuid, jsonb, jsonb, uuid, text) to service_role;

notify pgrst, 'reload schema';
