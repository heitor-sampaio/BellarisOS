-- F70 — C60 do levantamento das regras (2026-11-12): a matriz do cargo numa
-- transação só.
--
-- `saveRolePermissions` gravava em TRÊS passos soltos: o upsert de
-- `role_permissions`, o update de `tenant_roles.inbox_caixas` e o
-- apaga-e-regrava de `role_report_tabs`. Uma falha no meio deixava o cargo
-- meio salvo — o pior caso, as abas de Relatórios apagadas e não regravadas:
-- o cargo perdia os relatórios sem ninguém pedir. O app calcula e confere
-- (o módulo, a rede, o cargo, os níveis), e esta função grava tudo junto.
--
-- Recebe a rede por parâmetro: só o servidor (service_role) a executa.

create or replace function public.salvar_matriz_do_cargo(
  p_tenant uuid, p_role uuid, p_linhas jsonb, p_caixas text, p_abas text[]
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not exists (select 1 from tenant_roles r where r.id = p_role and r.tenant_id = p_tenant and not r.is_system) then
    raise exception 'cargo % não é desta rede (ou é de sistema)', p_role;
  end if;

  insert into role_permissions (tenant_id, role_id, module, level, scope)
  select p_tenant, p_role, x.module, x.level::permission_level, x.scope::permission_scope
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(module text, level text, scope text)
  on conflict (role_id, module) do update
    set level = excluded.level, scope = excluded.scope, updated_at = now();

  update tenant_roles set inbox_caixas = p_caixas
  where id = p_role and tenant_id = p_tenant;

  delete from role_report_tabs where tenant_id = p_tenant and role_id = p_role;
  insert into role_report_tabs (tenant_id, role_id, tab)
  select p_tenant, p_role, t from unnest(coalesce(p_abas, '{}'::text[])) as t;
end
$function$;

revoke execute on function public.salvar_matriz_do_cargo(uuid, uuid, jsonb, text, text[]) from public, anon, authenticated;
grant  execute on function public.salvar_matriz_do_cargo(uuid, uuid, jsonb, text, text[]) to service_role;

notify pgrst, 'reload schema';
