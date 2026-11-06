-- A20 da 8ª simulação (2026-11-06): a Bruna foi agendada avulsa a R$ 180 com a
-- sessão do pacote livre, e o agendamento não se ligava ao pacote depois. A
-- janela da agenda passa a oferecer "Usar o pacote" (ou o pré-pago) no
-- agendamento AVULSO ainda não concluído, do mesmo procedimento.
--
-- UMA transação: o agendamento e o crédito travados, tudo conferido de novo —
-- da rede, avulso (sem plano, sem sessão de pacote, sem unidade pré-paga, sem
-- lançamento vivo), em aberto; o crédito livre, da MESMA cliente, do MESMO
-- procedimento, na validade e de pacote não cancelado —, a ligação e o preço do
-- agendamento passando a ser a parte do crédito (a regra do agendar com
-- crédito, §9.3.2). O concluído segue pelo "Abater do pacote".

create or replace function public.agendamento_usar_credito(
  p_agendamento uuid, p_tenant uuid, p_tipo text, p_credito uuid, p_ator uuid, p_ator_nome text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status  text;
  v_cliente uuid;
  v_proc    uuid;
  v_plano   uuid;
  v_rede    uuid;
  v_preco   numeric;
  v_origem  text;
  v_ok      boolean;
begin
  select a.status::text, a.client_id, a.procedure_id, a.treatment_plan_id, b.tenant_id
    into v_status, v_cliente, v_proc, v_plano, v_rede
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.id = p_agendamento
  for update of a;

  if not found or v_rede is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status not in ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS') then
    raise exception 'Este agendamento já foi encerrado.' using errcode = 'invalid_parameter_value';
  end if;
  if v_plano is not null
     or exists (select 1 from public.package_sessions where appointment_id = p_agendamento)
     or exists (select 1 from public.procedure_sale_units where appointment_id = p_agendamento) then
    raise exception 'Este agendamento já usa o que foi pago antes.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.financial_transactions
              where appointment_id = p_agendamento and notes is distinct from 'Estornada') then
    raise exception 'Este agendamento já tem lançamento no caixa.' using errcode = 'invalid_parameter_value';
  end if;

  if p_tipo = 'PACOTE' then
    select coalesce(s.preco, round(coalesce(cp.price, sp.price, 0) / greatest(cp.total_sessions, 1), 2)),
           coalesce(sp.name, 'Pacote'),
           s.status::text = 'AVAILABLE' and s.appointment_id is null and cp.client_id = v_cliente
             and coalesce(s.procedure_id, sp.procedure_id) = v_proc and cp.cancelado_em is null
             and (cp.expires_at is null or cp.expires_at >= now())
      into v_preco, v_origem, v_ok
    from public.package_sessions s
    join public.client_packages cp on cp.id = s.client_package_id
    join public.branches b on b.id = cp.branch_id and b.tenant_id = p_tenant
    left join public.service_packages sp on sp.id = cp.package_id
    where s.id = p_credito
    for update of s;
    if not coalesce(v_ok, false) then
      raise exception 'Esta sessão do pacote não serve a este agendamento (já usada, de outro procedimento ou vencida).' using errcode = 'invalid_parameter_value';
    end if;
    update public.package_sessions set appointment_id = p_agendamento where id = p_credito;
  elsif p_tipo = 'PRE_PAGO' then
    select u.preco, 'Pré-pago',
           u.status::text = 'DISPONIVEL' and u.appointment_id is null and v.client_id = v_cliente
             and v.procedure_id = v_proc and (v.expires_at is null or v.expires_at >= now())
      into v_preco, v_origem, v_ok
    from public.procedure_sale_units u
    join public.procedure_sales v on v.id = u.sale_id and v.tenant_id = p_tenant
    where u.id = p_credito
    for update of u;
    if not coalesce(v_ok, false) then
      raise exception 'Esta unidade pré-paga não serve a este agendamento (já usada, de outro procedimento ou vencida).' using errcode = 'invalid_parameter_value';
    end if;
    update public.procedure_sale_units set appointment_id = p_agendamento where id = p_credito;
  else
    raise exception 'Crédito desconhecido.' using errcode = 'invalid_parameter_value';
  end if;

  update public.appointments set price = v_preco, updated_at = now() where id = p_agendamento;

  insert into public.appointment_history
    (appointment_id, changed_by_id, changed_by_name, action, description, metadata)
  values (p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'CREDIT_LINKED',
          'Ligado ao que já foi pago: ' || v_origem,
          jsonb_build_object('tipo', p_tipo, 'credito', p_credito, 'preco', v_preco));

  return jsonb_build_object('preco', v_preco, 'origem', v_origem);
end
$function$;

revoke execute on function public.agendamento_usar_credito(uuid, uuid, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.agendamento_usar_credito(uuid, uuid, text, uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
