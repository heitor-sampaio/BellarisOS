-- O módulo `documents` passa a ser o dos MODELOS de documento (o Heitor,
-- 2026-11-16): "A permissão de gerenciar documentos serve para alguém poder
-- criar/editar/excluir os modelos de documentos. É uma proteção para que os
-- documentos não sejam modificados por quem não deve. Um
-- procedimento/plano/pacote que tenha documentos que precisam de assinatura,
-- os documentos precisam ser assinados. É só uma questão de disponibilizar
-- para o cliente assinar e isso não representa risco."
--
-- Até aqui `documents` era COLHER a assinatura (VIEW vê, MANAGE colhe), e os
-- modelos eram `forms: MANAGE`. Agora:
--   * colher e ver os documentos da cliente não pedem permissão de documento
--     (o app confere quem está com a cliente: Clientes, Agenda, Prontuário ou
--     o recebimento, e `documentoAoAlcance`);
--   * `documents` aceita só NONE/MANAGE: MANAGE cria, edita e desativa os
--     modelos e dispensa um documento obrigatório (com motivo).
--
-- Quem já mexia nos modelos (`forms: MANAGE`) segue mexendo: o nível de
-- `documents` de cada cargo passa a ser MANAGE se o cargo tem `forms` em
-- Gerenciar; senão NONE. NONE é linha gravada (como a tela de Cargos grava),
-- não linha apagada. O escopo do módulo é ALL (não é escopável).
-- Nenhuma política nem função do banco lê o módulo `documents` (conferido em
-- pg_proc e pg_policies em 2026-11-16): a mudança é só de dado.

update public.role_permissions d
   set level = case when exists (
                 select 1 from public.role_permissions f
                  where f.role_id = d.role_id and f.module = 'forms' and f.level = 'MANAGE')
               then 'MANAGE'::public.permission_level
               else 'NONE'::public.permission_level end,
       scope = 'ALL'::public.permission_scope
 where d.module = 'documents';

insert into public.role_permissions (tenant_id, role_id, module, level, scope)
select f.tenant_id, f.role_id, 'documents', 'MANAGE'::public.permission_level, 'ALL'::public.permission_scope
  from public.role_permissions f
 where f.module = 'forms' and f.level = 'MANAGE'
on conflict (role_id, module) do nothing;

-- Os modelos de cargo da rede nova: nenhum deles tem os Modelos de ficha, e
-- por isso nenhum nasce com os Modelos de documento (antes o Gerente e a
-- Recepcionista nasciam em Gerenciar e a Profissional em Ver — era o colher,
-- que agora vem de Clientes, da Agenda e do PDV). Corpo de partida: o de
-- 20261111006001, só sem a chave `documents`.
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
      "medical_records":["VIEW","ALL"], "procedures":["VIEW","ALL"],
      "stock":["MANAGE","ALL"], "financial":["MANAGE","ALL"], "cashier":["MANAGE","ALL"],
      "crm":["MANAGE","ALL"], "marketing":["VIEW","ALL"], "reports":["VIEW","ALL"],
      "team":["MANAGE","ALL"], "automations":["VIEW","ALL"], "copilot":["MANAGE","ALL"],
      "settings":["MANAGE","ALL"]}'::jsonb
    when 'RECEPTIONIST' then '{
      "agenda":["MANAGE","ALL"], "clients":["MANAGE","ALL"], "loyalty":["VIEW","ALL"],
      "procedures":["VIEW","ALL"], "cashier":["MANAGE","ALL"],
      "crm":["MANAGE","ALL"], "copilot":["VIEW","ALL"],
      "financial":["VIEW","OWN"]}'::jsonb
    when 'PROFESSIONAL' then '{
      "agenda":["MANAGE","OWN"], "clients":["VIEW","ALL"], "medical_records":["MANAGE","OWN"],
      "procedures":["VIEW","ALL"], "stock":["VIEW","ALL"],
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
