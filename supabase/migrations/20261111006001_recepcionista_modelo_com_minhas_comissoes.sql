-- A3 da 12ª simulação (2026-11-11): o modelo Recepcionista vê as próprias comissões.
--
-- A recepção que vende é o caso comum (a Paula da Margarida, com 3% de
-- venda), e o cargo modelo "Recepcionista" nascia sem o Financeiro: ela não
-- via "Minhas comissões", e a dona criou um cargo "Recepção com vendas" à mão.
-- O padrão sensato (princípio 1) é o Financeiro em "Ver, só as próprias" —
-- que é exatamente o "Minhas comissões" (comissoes.md), sem o financeiro da
-- clínica.
--
-- Vale para a REDE NOVA: os cargos já gravados não mudam (princípio 6 — a
-- dona pode ter decidido o contrário).
-- Corpo de partida: o da produção em 2026-11-11 (igual a 20261104002101).
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
      "crm":["MANAGE","ALL"], "copilot":["VIEW","ALL"],
      "financial":["VIEW","OWN"]}'::jsonb
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

notify pgrst, 'reload schema';
