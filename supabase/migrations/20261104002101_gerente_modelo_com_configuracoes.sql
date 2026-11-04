-- D15 da 6ª simulação (2026-11-04): o Gerente modelo nasce com Configurações.
--
-- A H7 (2026-11-01) deu à gerente de unidade fixa a aba Unidade de
-- Configurações — os dados, o horário e as salas dela — e recusa o que é da
-- clínica toda (`recusaDaConfigDaClinica`). Mas o cargo modelo "Gerente"
-- nascia SEM o módulo `settings`, e a gerente só via "Tags e importações" até
-- a dona liberar o módulo. O padrão sensato (princípio 1) é o que a H7
-- descreve: `settings: MANAGE` no Gerente.
--
-- As redes que já existiam NÃO mudam (princípio 6: nada se move sozinho; a
-- dona pode ter tirado o módulo de propósito) — menos as redes `[e2e]` dos
-- testes, que ganham a linha se o Gerente delas não tem nenhuma de settings.
-- Corpo de partida: o da produção em 2026-11-04 (igual a 20261021000003).
create or replace function private.cargos_modelo_semear(p_tenant uuid, p_cargo uuid, p_chave text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_matriz jsonb := case p_chave
    -- módulo → [nível, escopo]
    when 'BRANCH_ADMIN' then '{
      "agenda":["MANAGE","ALL"], "clients":["MANAGE","ALL"], "loyalty":["MANAGE","ALL"],
      "medical_records":["VIEW","ALL"], "documents":["MANAGE","ALL"], "procedures":["VIEW","ALL"],
      "stock":["MANAGE","ALL"], "financial":["MANAGE","ALL"], "cashier":["MANAGE","ALL"],
      "crm":["MANAGE","ALL"], "marketing":["VIEW","ALL"], "reports":["VIEW","ALL"],
      "team":["MANAGE","ALL"], "automations":["VIEW","ALL"], "copilot":["MANAGE","ALL"],
      "settings":["MANAGE","ALL"]}'::jsonb
    when 'RECEPTIONIST' then '{
      "agenda":["MANAGE","ALL"], "clients":["MANAGE","ALL"], "loyalty":["VIEW","ALL"],
      "documents":["MANAGE","ALL"], "procedures":["VIEW","ALL"], "cashier":["MANAGE","ALL"],
      "crm":["MANAGE","ALL"], "copilot":["VIEW","ALL"]}'::jsonb
    when 'PROFESSIONAL' then '{
      "agenda":["MANAGE","OWN"], "clients":["VIEW","ALL"], "medical_records":["MANAGE","OWN"],
      "documents":["VIEW","ALL"], "procedures":["VIEW","ALL"], "stock":["VIEW","ALL"],
      "financial":["VIEW","OWN"]}'::jsonb
    when 'FINANCIAL' then '{
      "agenda":["VIEW","ALL"], "clients":["VIEW","ALL"], "procedures":["VIEW","ALL"],
      "stock":["VIEW","ALL"], "financial":["MANAGE","ALL"], "cashier":["MANAGE","ALL"],
      "reports":["VIEW","ALL"]}'::jsonb
  end;
  v_abas text[] := case p_chave
    when 'BRANCH_ADMIN' then array['overview','financeiro','vendas','agenda','clientes','procedimentos','profissionais','estoque','comercial']
    when 'FINANCIAL'    then array['overview','financeiro','vendas','profissionais']
    else array[]::text[]
  end;
begin
  if v_matriz is null then return; end if;
  update public.tenant_roles set is_system = false where id = p_cargo;
  insert into public.role_permissions (tenant_id, role_id, module, level, scope)
  select p_tenant, p_cargo, m.key, (m.value ->> 0)::public.permission_level, (m.value ->> 1)::public.permission_scope
    from jsonb_each(v_matriz) m
  on conflict do nothing;
  insert into public.role_report_tabs (tenant_id, role_id, tab)
  select p_tenant, p_cargo, a from unnest(v_abas) a
  on conflict do nothing;
end
$function$;

revoke execute on function private.cargos_modelo_semear(uuid, uuid, text) from public, anon, authenticated;

-- As redes [e2e] dos testes: o Gerente delas sem nenhuma linha de settings.
insert into public.role_permissions (tenant_id, role_id, module, level, scope)
select r.tenant_id, r.id, 'settings', 'MANAGE'::public.permission_level, 'ALL'::public.permission_scope
  from public.tenant_roles r
  join public.tenants t on t.id = r.tenant_id
 where r.key = 'BRANCH_ADMIN'
   and t.name like '[e2e]%'
   and not exists (select 1 from public.role_permissions p where p.role_id = r.id and p.module = 'settings')
on conflict do nothing;

notify pgrst, 'reload schema';
