-- "Abater do pacote": o avulso CONCLUÍDO e a receber vira uma sessão do
-- pacote da cliente (D9 da simulação de 2026-10-28).
--
-- A Bianca fez uma drenagem avulsa e comprou o pacote "10 drenagens" na saída.
-- O "Receber" cobrava R$ 150 sem citar o pacote, e nada ligava o atendimento
-- já concluído a uma sessão: ou ela pagava duas vezes, ou a drenagem ficava a
-- receber para sempre.
--
-- Decisão do Heitor: numa transação, o atendimento passa a ser uma sessão do
-- pacote — a sessão (do MESMO procedimento, livre, do pacote DESTA cliente, na
-- validade) é ligada e usada, o contador soma, o preço do atendimento vira a
-- parte da sessão no rateio da venda, e a comissão passa à regra da sessão de
-- pacote: a linha AVULSO é cancelada (o acerto lança o que ela já tinha
-- liberado de volta) e nasce a linha PACOTE (base = a parte da sessão; no modo
-- "quando paga", na proporção do que a venda recebeu). O estoque já baixou na
-- conclusão. Sem cobrança nova; a conta a receber que tivesse sido lançada
-- (o "Concluído" antigo da agenda) é substituída (valor zero e nota), como o
-- recebimento do plano no check-in faz.
--
-- O app confere antes (permissão, unidade ao alcance); a função confere tudo
-- de novo sob trava.

create or replace function public.atendimento_abater_do_pacote(
  p_agendamento uuid, p_sessao uuid, p_tenant uuid, p_ator uuid, p_ator_nome text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ap        record;
  v_s         record;
  v_proc_s    uuid;
  v_preco     numeric;
  v_soma      numeric;
  v_linha     public.commission_lines%rowtype;
  v_item      int;
  v_nova      uuid;
begin
  select a.id, a.status::text as status, a.branch_id, a.client_id, a.procedure_id, a.price, a.treatment_plan_id, b.tenant_id
    into v_ap
    from public.appointments a
    join public.branches b on b.id = a.branch_id
   where a.id = p_agendamento
   for update of a;
  if not found or v_ap.tenant_id is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_ap.status <> 'COMPLETED' then
    raise exception 'Só o atendimento concluído se abate do pacote.' using errcode = 'P0001';
  end if;
  if v_ap.treatment_plan_id is not null then
    raise exception 'Sessão de plano de tratamento: já é paga no plano.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.package_sessions ps where ps.appointment_id = p_agendamento) then
    raise exception 'Este atendimento já é uma sessão de pacote.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.procedure_sale_units u where u.appointment_id = p_agendamento and u.status <> 'CANCELADA') then
    raise exception 'Procedimento pré-pago: já foi pago na venda.' using errcode = 'P0001';
  end if;
  if coalesce(v_ap.price, 0) <= 0 then
    raise exception 'Atendimento sem cobrança: não há o que abater.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.financial_transactions f
              where f.appointment_id = p_agendamento and f.type = 'INCOME' and f.is_paid
                and coalesce(f.notes, '') <> 'Estornada') then
    raise exception 'Pagamento já registrado para este atendimento.' using errcode = 'P0001';
  end if;

  select s.id, s.status::text as status, s.appointment_id, s.procedure_id, s.preco, s.session_number,
         cp.id as pacote, cp.client_id, cp.expires_at, cp.price as pacote_preco, cp.total_sessions,
         sp.procedure_id as proc_do_pacote, sp.name as pacote_nome, b.tenant_id
    into v_s
    from public.package_sessions s
    join public.client_packages cp on cp.id = s.client_package_id
    join public.branches b on b.id = cp.branch_id
    left join public.service_packages sp on sp.id = cp.package_id
   where s.id = p_sessao
   for update of s, cp;
  if not found or v_s.tenant_id is distinct from p_tenant or v_s.client_id is distinct from v_ap.client_id then
    raise exception 'Sessão de pacote não encontrada para esta cliente.' using errcode = 'no_data_found';
  end if;
  if v_s.status <> 'AVAILABLE' or v_s.appointment_id is not null then
    raise exception 'Esta sessão já foi usada ou agendada.' using errcode = 'P0001';
  end if;
  if v_s.expires_at is not null and v_s.expires_at < now() then
    raise exception 'Este pacote venceu.' using errcode = 'P0001';
  end if;
  v_proc_s := coalesce(v_s.procedure_id, v_s.proc_do_pacote);
  if v_proc_s is distinct from v_ap.procedure_id then
    raise exception 'A sessão do pacote é de outro procedimento.' using errcode = 'P0001';
  end if;
  -- A parte da sessão no rateio da venda; pacote de antes do rateio: preço ÷ sessões.
  v_preco := coalesce(v_s.preco, round(coalesce(v_s.pacote_preco, 0) / greatest(v_s.total_sessions, 1), 2));

  update public.package_sessions
     set appointment_id = p_agendamento, status = 'USED', used_at = now()
   where id = p_sessao;
  update public.client_packages set used_sessions = used_sessions + 1 where id = v_s.pacote;
  update public.appointments set price = v_preco, updated_at = now() where id = p_agendamento;

  -- A conta a receber lançada (o "Concluído" antigo da agenda) é substituída.
  update public.financial_transactions
     set amount = 0, notes = 'Substituído pela sessão do pacote', updated_at = now()
   where appointment_id = p_agendamento and type = 'INCOME' and not is_paid
     and coalesce(notes, '') <> 'Estornada';

  -- A comissão passa à regra da sessão de pacote.
  select coalesce(max(cl.item), -1) + 1 into v_item
    from public.commission_lines cl where cl.appointment_id = p_agendamento;
  select coalesce(sum(cl.preco), 0) into v_soma
    from public.commission_lines cl
   where cl.appointment_id = p_agendamento and cl.status <> 'CANCELADA' and cl.origem = 'AVULSO';
  for v_linha in
    select * from public.commission_lines cl
     where cl.appointment_id = p_agendamento and cl.status <> 'CANCELADA' and cl.origem = 'AVULSO'
     order by cl.item
  loop
    update public.commission_lines set status = 'CANCELADA' where id = v_linha.id;
    perform private.comissao_acertar_linha(v_linha.id, 'Atendimento abatido do pacote', null);
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
       client_package_id, procedure_sale_id, regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa,
       base_com_pontos, preco, custo_insumos)
    values (
      v_linha.tenant_id, v_linha.branch_id, p_agendamento, v_item, v_linha.procedure_id, v_linha.professional_id,
      'PACOTE', null, v_s.pacote, null, v_linha.regra_tipo, v_linha.regra_valor, v_linha.modo,
      v_linha.desconta_insumos, v_linha.desconta_taxa, v_linha.base_com_pontos,
      case when v_soma > 0 then round(v_preco * v_linha.preco / v_soma, 2) else v_preco end,
      v_linha.custo_insumos
    )
    returning id into v_nova;
    perform private.comissao_acertar_linha(v_nova, 'Sessão do pacote', null);
    v_item := v_item + 1;
  end loop;

  if p_ator is not null then
    insert into public.appointment_history
      (appointment_id, changed_by_id, changed_by_name, action, description)
    values (
      p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'PACKAGE_SESSION',
      'Abatido do pacote "' || coalesce(v_s.pacote_nome, 'Pacote') || '" (sessão ' || v_s.session_number
        || ' de ' || v_s.total_sessions || ') — sem cobrança'
    );
  end if;

  return jsonb_build_object('pacote', v_s.pacote, 'sessao', p_sessao, 'preco', v_preco);
end
$function$;

revoke execute on function public.atendimento_abater_do_pacote(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.atendimento_abater_do_pacote(uuid, uuid, uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
