-- A26 da 34ª simulação (princípio 3: o que a tela mostra é o que vale).
--
-- Cada "Salvar acessos" do cargo, mesmo sem mexer nas abas de Relatórios,
-- saía na Auditoria como "Mudou os acessos do cargo X (N abas de relatório e
-- …)": `salvar_matriz_do_cargo` apagava todas as abas do cargo e as criava de
-- novo. Agora sai só a aba desmarcada e entra só a nova; salvar sem mudar as
-- abas não grava nada nelas (a permissão sem mudança já não gerava linha: o
-- gatilho ignora o `updated_at`).
--
-- Troca de trecho no corpo VIVO (o de 20261112007002), com a conferência.

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
  'public.salvar_matriz_do_cargo(uuid, uuid, jsonb, text, text[])'::regprocedure,
  array[$t$  delete from role_report_tabs where tenant_id = p_tenant and role_id = p_role;
  insert into role_report_tabs (tenant_id, role_id, tab)
  select p_tenant, p_role, t from unnest(coalesce(p_abas, '{}'::text[])) as t;$t$],
  array[$t$  delete from role_report_tabs where tenant_id = p_tenant and role_id = p_role
     and tab <> all(coalesce(p_abas, '{}'::text[]));
  insert into role_report_tabs (tenant_id, role_id, tab)
  select p_tenant, p_role, t from unnest(coalesce(p_abas, '{}'::text[])) as t
  on conflict (role_id, tab) do nothing;$t$],
  array[1]
);

revoke execute on function public.salvar_matriz_do_cargo(uuid, uuid, jsonb, text, text[]) from public, anon, authenticated;
grant  execute on function public.salvar_matriz_do_cargo(uuid, uuid, jsonb, text, text[]) to service_role;

notify pgrst, 'reload schema';
