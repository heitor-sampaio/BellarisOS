-- A troca do responsável da oportunidade e o evento da linha do tempo
-- ("Responsável: de X para Y") valem juntos: uma função grava os dois numa
-- transação (CLAUDE.md §14: "o app calcula, uma função grava"). Eram duas
-- gravações seguidas em `trocarResponsavelCore` (lib/crm/responsavel.ts): o
-- responsável novo aparecia antes de o evento existir — a completa de 26/11 (a
-- da 32ª simulação) pegou o `e2e/crm-responsavel.spec.ts:103` lendo o
-- responsável trocado e nenhum OWNER_CHANGED —, e uma falha entre as duas
-- deixava a troca sem registro. O app confere a rede, a pessoa ativa e o nome
-- antes; aqui só grava. Só o servidor (service_role) chama.

create or replace function public.lead_trocar_responsavel(
  p_tenant uuid,
  p_lead uuid,
  p_usuario uuid,
  p_actor_user uuid,
  p_actor_name text,
  p_changes jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leads
     set owner_id = p_usuario
   where id = p_lead
     and tenant_id = p_tenant;
  if not found then
    return false;
  end if;

  insert into public.lead_events (tenant_id, lead_id, type, actor_user_id, actor_name, changes)
  values (p_tenant, p_lead, 'OWNER_CHANGED', p_actor_user, p_actor_name, p_changes);
  return true;
end $$;

revoke all on function public.lead_trocar_responsavel(uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.lead_trocar_responsavel(uuid, uuid, uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
