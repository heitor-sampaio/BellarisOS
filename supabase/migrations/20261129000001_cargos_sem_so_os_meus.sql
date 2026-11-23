-- Sem o "só os meus" nos cargos (o Heitor, 2026-11-23: SM1, "pode tirar, as
-- vistas pessoais resolvem").
--
-- Sem o escopo, o módulo em "só os meus" passaria a valer TUDO: o Financeiro
-- em Ver "só os meus" abriria o financeiro inteiro (o Fechamento do dia
-- junto), e a Agenda "só os meus" a agenda de todos. O Heitor, 23/11, à
-- pergunta do Claude: o Financeiro e a Agenda "só os meus" viram Sem acesso
-- (o que a pessoa via é a vista pessoal — as Minhas comissões e a Minha
-- agenda, a quem atende); o resto (Atendimento, Prontuário, CRM, Relatórios)
-- fica com o nível e vale "todos" (cada passo, um módulo — UM1 a UM5).
--
-- `role_permissions.scope` fica (nada a lê) e passa a ser sempre 'ALL'.

-- 1. Os cargos de hoje.
update public.role_permissions
   set level = 'NONE'
 where module in ('financial', 'agenda')
   and scope = 'OWN'
   and level <> 'NONE';

update public.role_permissions
   set scope = 'ALL'
 where scope is distinct from 'ALL';

-- 2. Os modelos da rede nova: a Recepcionista sem o Financeiro; o Profissional
-- sem a Agenda e sem o Financeiro, com o Atendimento e o Prontuário em
-- Gerenciar de todos. Corpo de partida: o de 20261123900001.
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
      "agenda":["MANAGE","ALL"], "atendimento":["VIEW","ALL"], "clients":["MANAGE","ALL"], "loyalty":["MANAGE","ALL"],
      "medical_records":["VIEW","ALL"], "procedures":["VIEW","ALL"],
      "stock":["MANAGE","ALL"], "financial":["MANAGE","ALL"], "cashier":["MANAGE","ALL"],
      "crm":["MANAGE","ALL"], "marketing":["VIEW","ALL"], "reports":["VIEW","ALL"],
      "team":["MANAGE","ALL"], "automations":["VIEW","ALL"], "copilot":["MANAGE","ALL"],
      "settings":["MANAGE","ALL"]}'::jsonb
    when 'RECEPTIONIST' then '{
      "agenda":["MANAGE","ALL"], "atendimento":["VIEW","ALL"], "clients":["MANAGE","ALL"], "loyalty":["VIEW","ALL"],
      "procedures":["VIEW","ALL"], "cashier":["MANAGE","ALL"],
      "crm":["MANAGE","ALL"], "copilot":["VIEW","ALL"]}'::jsonb
    when 'PROFESSIONAL' then '{
      "atendimento":["MANAGE","ALL"], "clients":["VIEW","ALL"], "medical_records":["MANAGE","ALL"],
      "procedures":["VIEW","ALL"], "stock":["VIEW","ALL"]}'::jsonb
    when 'FINANCIAL' then '{
      "agenda":["VIEW","ALL"], "atendimento":["VIEW","ALL"], "clients":["VIEW","ALL"], "procedures":["VIEW","ALL"],
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
