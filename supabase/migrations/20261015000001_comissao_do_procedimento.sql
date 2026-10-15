-- A comissão pelo PROCEDIMENTO (pedido do Heitor, 2026-10-15): cada
-- procedimento pode ter uma comissão GERAL, a mesma para todo mundo, ou uma
-- diferente para cada profissional.
--
-- - A geral é uma linha de `commission_rules` SEM profissional
--   (`professional_id` nulo, `procedure_id` preenchido). O índice único
--   `(professional_id, procedure_id) nulls not distinct` já garante uma por
--   procedimento.
-- - "Por profissional" são as exceções de sempre (profissional + procedimento),
--   agora editáveis também pelo procedimento.
-- - Qual vale (`regraAplicavel`): a geral do procedimento; senão a exceção do
--   profissional; senão o padrão dele. Com a geral, o procedimento não tem
--   exceção: gravá-la tira as exceções, e a Equipe não aceita exceção nele.

alter table public.commission_rules alter column professional_id drop not null;
alter table public.commission_rules
  add constraint commission_rules_alvo check (professional_id is not null or procedure_id is not null);

-- ─── A comissão de um procedimento, numa transação ──────────────────────────
-- Substitui o conjunto inteiro do procedimento (a geral e as exceções de
-- todos): a tela é da rede e mostra todos os profissionais. Procedimento e
-- profissionais têm de ser da rede — os ids vêm do navegador.
create or replace function public.comissao_do_procedimento_definir(
  p_tenant uuid, p_procedimento uuid, p_geral jsonb, p_profissionais jsonb, p_ator uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if not exists (select 1 from public.procedures p where p.id = p_procedimento and p.tenant_id = p_tenant) then
    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
  if p_geral is not null and jsonb_array_length(coalesce(p_profissionais, '[]'::jsonb)) > 0 then
    raise exception 'Com a comissão geral, o procedimento não tem valor por profissional.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_profissionais, '[]'::jsonb)) e
     where not exists (select 1 from public.users u where u.id = (e->>'professional_id')::uuid and u.tenant_id = p_tenant)
  ) then
    raise exception 'Profissional não encontrado.' using errcode = 'no_data_found';
  end if;

  delete from public.commission_rules r where r.procedure_id = p_procedimento and r.tenant_id = p_tenant;

  if p_geral is not null then
    insert into public.commission_rules (tenant_id, professional_id, procedure_id, type, value, is_active, updated_by)
    values (p_tenant, null, p_procedimento, (p_geral->>'tipo')::public."CommissionType", (p_geral->>'valor')::numeric, true, p_ator);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_profissionais, '[]'::jsonb)) loop
    insert into public.commission_rules (tenant_id, professional_id, procedure_id, type, value, is_active, updated_by)
    values (p_tenant, (v_item->>'professional_id')::uuid, p_procedimento, (v_item->>'tipo')::public."CommissionType",
            (v_item->>'valor')::numeric, true, p_ator);
  end loop;
end $$;

revoke execute on function public.comissao_do_procedimento_definir(uuid, uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.comissao_do_procedimento_definir(uuid, uuid, jsonb, jsonb, uuid) to service_role;

-- ─── As regras de um profissional: sem exceção em procedimento com geral ────
create or replace function public.comissao_regras_definir(
  p_tenant uuid, p_profissional uuid, p_padrao jsonb, p_excecoes jsonb, p_ator uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_nome text;
begin
  if not exists (select 1 from public.users u where u.id = p_profissional and u.tenant_id = p_tenant) then
    raise exception 'Profissional não encontrado.' using errcode = 'no_data_found';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_excecoes, '[]'::jsonb)) e
     where not exists (select 1 from public.procedures p where p.id = (e->>'procedure_id')::uuid and p.tenant_id = p_tenant)
  ) then
    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
  select p.name into v_nome
    from jsonb_array_elements(coalesce(p_excecoes, '[]'::jsonb)) e
    join public.commission_rules g on g.procedure_id = (e->>'procedure_id')::uuid and g.professional_id is null and g.tenant_id = p_tenant
    join public.procedures p on p.id = g.procedure_id
   limit 1;
  if v_nome is not null then
    raise exception '% tem comissão geral, a mesma para todos: mude no procedimento.', v_nome using errcode = 'invalid_parameter_value';
  end if;

  delete from public.commission_rules r where r.professional_id = p_profissional and r.tenant_id = p_tenant;

  if p_padrao is not null then
    insert into public.commission_rules (tenant_id, professional_id, procedure_id, type, value, is_active, updated_by)
    values (p_tenant, p_profissional, null, (p_padrao->>'tipo')::public."CommissionType", (p_padrao->>'valor')::numeric, true, p_ator);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_excecoes, '[]'::jsonb)) loop
    insert into public.commission_rules (tenant_id, professional_id, procedure_id, type, value, is_active, updated_by)
    values (p_tenant, p_profissional, (v_item->>'procedure_id')::uuid, (v_item->>'tipo')::public."CommissionType",
            (v_item->>'valor')::numeric, true, p_ator);
  end loop;
end $$;

revoke execute on function public.comissao_regras_definir(uuid, uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.comissao_regras_definir(uuid, uuid, jsonb, jsonb, uuid) to service_role;

notify pgrst, 'reload schema';
