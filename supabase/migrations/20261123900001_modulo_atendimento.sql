-- O módulo Atendimento (o Heitor, 2026-11-18: "Agenda é agenda e atendimento é
-- atendimento. Só inicia e conclui atendimento quem tem gerenciar no
-- atendimento."). Ver = abre a tela do atendimento e os planos de tratamento;
-- Gerenciar = inicia e conclui. O escopo ("só os meus" × "todos") é como o da
-- Agenda (decisão do Claude pelo princípio 1, 2026-11-18).
--
-- `role_permissions.module` é texto (sem CHECK): o módulo novo é só dado.
--
-- Os cargos que já existem (decisão do Claude pelos princípios 1 e 2,
-- 2026-11-18 — ninguém ganha nem perde o que fazia):
--   * Agenda em Ver ou Gerenciar E Prontuário em Gerenciar (quem concluía até
--     aqui) → Atendimento em Gerenciar, com o escopo da Agenda;
--   * Agenda em Ver ou Gerenciar sem o Prontuário em Gerenciar (quem abria a
--     tela do atendimento e os planos) → Atendimento em Ver, com o escopo da
--     Agenda;
--   * o resto → nada (o módulo ausente vale NONE).
-- A Admin da rede tem tudo pelo cargo de sistema (`isNetworkAdmin`), sem linha.

insert into public.role_permissions (tenant_id, role_id, module, level, scope)
select a.tenant_id, a.role_id, 'atendimento',
       case when exists (select 1 from public.role_permissions m
                          where m.role_id = a.role_id and m.module = 'medical_records' and m.level = 'MANAGE')
            then 'MANAGE'::public.permission_level
            else 'VIEW'::public.permission_level end,
       coalesce(a.scope, 'ALL'::public.permission_scope)
  from public.role_permissions a
 where a.module = 'agenda' and a.level in ('VIEW', 'MANAGE')
on conflict (role_id, module) do nothing;

-- Os modelos de cargo da rede nova, pela mesma regra: o Profissional (Agenda
-- "só os meus" e Prontuário em Gerenciar) nasce com o Atendimento em Gerenciar
-- "só os meus"; o Gerente, a Recepcionista e o Financeiro (Agenda sem o
-- Prontuário em Gerenciar) com o Atendimento em Ver. Corpo de partida: o de
-- 20261121600001, só com a chave `atendimento`.
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
      "crm":["MANAGE","ALL"], "copilot":["VIEW","ALL"],
      "financial":["VIEW","OWN"]}'::jsonb
    when 'PROFESSIONAL' then '{
      "agenda":["MANAGE","OWN"], "atendimento":["MANAGE","OWN"], "clients":["VIEW","ALL"], "medical_records":["MANAGE","OWN"],
      "procedures":["VIEW","ALL"], "stock":["VIEW","ALL"],
      "financial":["VIEW","OWN"]}'::jsonb
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
