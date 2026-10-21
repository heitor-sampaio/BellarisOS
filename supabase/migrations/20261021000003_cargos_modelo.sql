-- Os cargos prontos viram MODELOS editáveis (2026-10-21, decisão do Heitor).
--
-- Toda rede nascia com Gerente, Recepcionista, Profissional e Financeiro
-- travados (is_system), SEM permissão nenhuma — sobra dos cargos fixos de
-- antes da matriz por rede. A tela os mostrava com cadeado e "acesso total à
-- rede", e as actions recusavam atribuí-los: a dona da simulação de um dia de
-- clínica (2026-10-20) criou os dela do zero.
--
-- Agora nascem destravados, com uma matriz inicial sensata que a rede ajusta.
-- O "Admin da rede" (acesso total de verdade) e o "Não definido" (quem ainda
-- não tem cargo) continuam de sistema. As redes de antes ganham a mesma
-- matriz SÓ nos cargos que nunca foram usados (sem permissão e sem ninguém).

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
      "team":["MANAGE","ALL"], "automations":["VIEW","ALL"], "copilot":["MANAGE","ALL"]}'::jsonb
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

create or replace function public.seed_tenant_roles()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_cargo record;
begin
  insert into public.tenant_roles (tenant_id, key, label, is_system)
  values
    (new.id, 'BRANCH_ADMIN',  'Gerente',        false),
    (new.id, 'RECEPTIONIST',  'Recepcionista',  false),
    (new.id, 'PROFESSIONAL',  'Profissional',   false),
    (new.id, 'FINANCIAL',     'Financeiro',     false),
    (new.id, 'NAO_DEFINIDO',  'Não definido',   true);
  for v_cargo in select id, key from public.tenant_roles
                  where tenant_id = new.id and key in ('BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL', 'FINANCIAL')
  loop
    perform private.cargos_modelo_semear(new.id, v_cargo.id, v_cargo.key);
  end loop;
  return new;
end;
$function$;

-- As redes de antes: só os cargos nunca usados (sem permissão e sem ninguém).
do $$
declare
  v_cargo record;
begin
  for v_cargo in
    select r.id, r.tenant_id, r.key
      from public.tenant_roles r
     where r.key in ('BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL', 'FINANCIAL')
       and r.is_system
       and not exists (select 1 from public.role_permissions p where p.role_id = r.id)
       and not exists (select 1 from public.users u where u.role_id = r.id)
  loop
    perform private.cargos_modelo_semear(v_cargo.tenant_id, v_cargo.id, v_cargo.key);
  end loop;
end $$;

notify pgrst, 'reload schema';
