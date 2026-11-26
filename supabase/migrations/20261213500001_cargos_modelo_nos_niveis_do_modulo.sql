-- D8 da 34ª simulação (princípio 3: o que a tela mostra é o que vale).
--
-- O modelo "Gerente" (BRANCH_ADMIN) nascia com o Copilot em Gerenciar, nível
-- que o módulo não tem desde a revisão de 24/11 (Q02: o Copilot, as Automações
-- e o Marketing têm só "Sem acesso" e "Ver"; `MODULE_LEVELS`,
-- lib/permissions.ts). A tela de Cargos mostrava "Ver" (`nivelAceito`) e o
-- banco guardava "Gerenciar". Os outros módulos dos quatro modelos já nascem
-- num nível que o módulo oferece (tests/cargos-modelo-nos-niveis-do-modulo.test.ts).
--
-- 1. O modelo nasce com o Copilot em Ver: troca de trecho no corpo VIVO de
--    private.cargos_modelo_semear (o de 20261129000001), com a conferência.
-- 2. Os cargos gravados com o Gerenciar num módulo que só vai até o Ver passam
--    ao Ver — o que a tela já mostrava, o que o "cargo acima" já comparava e o
--    que o salvar já gravaria. Nenhum acesso muda: o Gerenciar desses módulos
--    não abria nada além do Ver (mexer em automação, campanha, template, ficha
--    e cargo é só da Admin da rede, 18/11). Na produção, em 26/11: 91 linhas
--    do Copilot (73 redes), 2 das Automações e 3 do Marketing; o resto
--    (Relatórios, Fichas, Cargos) já estava no Ver. Nenhum "Ver" gravado em
--    módulo que só tem Gerenciar (Documentos, PDV, Configurações).

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
  'private.cargos_modelo_semear(uuid, uuid, text)'::regprocedure,
  array[$t$"copilot":["MANAGE","ALL"]$t$],
  array[$t$"copilot":["VIEW","ALL"]$t$],
  array[1]
);

revoke execute on function private.cargos_modelo_semear(uuid, uuid, text) from public, anon, authenticated;

update public.role_permissions
   set level = 'VIEW'
 where level = 'MANAGE'
   and module in ('marketing', 'reports', 'forms', 'roles', 'automations', 'copilot');

notify pgrst, 'reload schema';
