-- A48 (simulação de 2026-10-27): "Ficha já respondida" não oferecia caminho
-- para corrigir nada. A espiada do link passa a devolver também o telefone da
-- unidade do agendamento (o da rede, se o agendamento não tem unidade), para a
-- página dizer com quem falar. O telefone é dado de contato da clínica — o
-- mesmo que já vai nos documentos —, não dado da cliente.
create or replace function public.pre_atendimento_link_espiar(p_token_hash text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_link public.pre_atendimento_links%rowtype;
  v_pre  public.pre_atendimentos%rowtype;
  v_cpf  text;
begin
  select * into v_link from public.pre_atendimento_links l where l.token_hash = p_token_hash;
  if not found then return jsonb_build_object('estado', 'invalido'); end if;
  select * into v_pre from public.pre_atendimentos p where p.id = v_link.pre_atendimento_id;
  select regexp_replace(coalesce(c.document, ''), '\D', '', 'g') into v_cpf from public.clients c where c.id = v_pre.client_id;
  return jsonb_build_object(
    'estado', case
      when v_link.used_at is not null or v_pre.status = 'RESPONDIDO' then 'usado'
      when v_link.revoked_at is not null then 'revogado'
      when v_link.expires_at < now() then 'vencido'
      when v_pre.status <> 'PENDENTE' then 'indisponivel'
      else 'valido' end,
    'clinica', coalesce(
      (select b.name from public.appointments a join public.branches b on b.id = a.branch_id where a.id = v_pre.appointment_id),
      (select t.name from public.tenants t where t.id = v_pre.tenant_id)),
    'telefone', (select nullif(btrim(b.phone), '') from public.appointments a join public.branches b on b.id = a.branch_id where a.id = v_pre.appointment_id),
    'pede', case when v_cpf <> '' then 'CPF' else 'NASCIMENTO' end);
end $$;

revoke execute on function public.pre_atendimento_link_espiar(text) from public, anon, authenticated;
grant execute on function public.pre_atendimento_link_espiar(text) to service_role;

notify pgrst, 'reload schema';
