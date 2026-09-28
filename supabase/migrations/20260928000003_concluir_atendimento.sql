-- A conclusão do atendimento numa transação só (CLAUDE.md §10).
--
-- `finishSession` gravava em sequência — status, prontuário, comissão, pontos,
-- estoque, pacote, histórico —, cada um falhando alto, mas sem transação:
-- falhar o quinto deixava os quatro primeiros gravados, e o atendimento ficava
-- "concluído" com a comissão lançada e o estoque sem baixa. Repetir não
-- consertava: o status já dizia concluído e a action recusava.
--
-- O desenho é o do estorno (`estornar_transacao`): o TypeScript CALCULA — a
-- regra de comissão aplicada, os pontos, a baixa de cada insumo com rendimento
-- e o arredondamento das embalagens — e esta função GRAVA tudo numa transação.
-- Nenhuma regra de negócio duplicada no banco: ela recebe os números prontos.
--
-- De brinde, o agendamento é travado (`for update`) e o status conferido DE
-- NOVO lá dentro: dois cliques simultâneos em "finalizar" concluíam duas vezes
-- (dois movimentos de estoque, duas sessões de pacote usadas).
--
-- Eventos e notificações ficam FORA, no TypeScript, depois do sucesso: são
-- avisos do que aconteceu, e só podem sair quando aconteceu.
--
-- `p_dados`:
--   notas, intercorrencias            text
--   comissao  { valor, tipo, regra, periodo } | null
--   pontos    int (0 = nenhum)
--   insumos   [{ produto, quantidade, saldo_apos, embalagens, rendimento,
--                custo, minimo }]   — quantidade NEGATIVA (é saída)
--
-- Devolve { comissao_criada: bool, pacote: uuid | null }.

create or replace function public.concluir_atendimento(
  p_agendamento uuid,
  p_tenant      uuid,
  p_ator        uuid,
  p_ator_nome   text,
  p_dados       jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status     text;
  v_unidade    uuid;
  v_cliente    uuid;
  v_prof       uuid;
  v_rede       uuid;
  v_prontuario uuid;
  v_comissao   jsonb := p_dados -> 'comissao';
  v_pontos     int   := coalesce((p_dados ->> 'pontos')::int, 0);
  v_insumo     jsonb;
  v_conta      uuid;
  v_sessao     uuid;
  v_pacote     uuid;
  v_nova_com   boolean := false;
begin
  -- 1. O agendamento, travado. A rede é a da unidade dele.
  select a.status::text, a.branch_id, a.client_id, a.professional_id, b.tenant_id
    into v_status, v_unidade, v_cliente, v_prof, v_rede
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.id = p_agendamento
  for update of a;

  if not found or v_rede is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'Atendimento já concluído.' using errcode = 'invalid_parameter_value';
  end if;
  if v_status in ('CANCELLED', 'NO_SHOW') then
    raise exception 'Agendamento já finalizado.' using errcode = 'invalid_parameter_value';
  end if;

  update public.appointments
  set status = 'COMPLETED', completed_at = now()
  where id = p_agendamento;

  -- 2. Prontuário do cliente (nasce aqui se ainda não existe) e a entrada deste
  --    atendimento — uma por agendamento.
  select id into v_prontuario from public.medical_records where client_id = v_cliente;
  if v_prontuario is null then
    insert into public.medical_records (client_id) values (v_cliente) returning id into v_prontuario;
  end if;

  insert into public.medical_record_entries
    (medical_record_id, appointment_id, professional_id, notes, intercurrences)
  values
    (v_prontuario, p_agendamento, v_prof, p_dados ->> 'notas', p_dados ->> 'intercorrencias')
  on conflict (appointment_id) do update
    set medical_record_id = excluded.medical_record_id,
        professional_id   = excluded.professional_id,
        notes             = excluded.notes,
        intercurrences    = excluded.intercurrences;

  -- 3. Comissão, com a regra que o TypeScript aplicou.
  if v_comissao is not null and jsonb_typeof(v_comissao) = 'object'
     and not exists (select 1 from public.commissions where appointment_id = p_agendamento) then
    insert into public.commissions
      (branch_id, professional_id, appointment_id, amount, type, rule_value, period_ref, status)
    values (
      v_unidade, v_prof, p_agendamento,
      (v_comissao ->> 'valor')::numeric,
      (v_comissao ->> 'tipo')::"CommissionType",
      (v_comissao ->> 'regra')::numeric,
      v_comissao ->> 'periodo',
      'OPEN'
    );
    v_nova_com := true;
  end if;

  -- 4. Pontos de fidelidade. O saldo soma no banco — ler e regravar perdia
  --    pontos quando dois atendimentos do mesmo cliente fechavam juntos.
  if v_pontos > 0 then
    update public.loyalty_accounts
    set balance = balance + v_pontos, updated_at = now()
    where client_id = v_cliente
    returning id into v_conta;
    if v_conta is not null then
      insert into public.loyalty_transactions (loyalty_account_id, points, description, appointment_id)
      values (v_conta, v_pontos, 'Atendimento concluído', p_agendamento);
    end if;
  end if;

  -- 5. Insumos. O movimento dispara os gatilhos de estoque (evento, mínimo e a
  --    baixa do lote) dentro desta mesma transação.
  for v_insumo in select * from jsonb_array_elements(coalesce(p_dados -> 'insumos', '[]'::jsonb))
  loop
    insert into public.stock_movements
      (branch_id, product_id, type, quantity, balance_after, appointment_id, created_by, unit_cost)
    values (
      v_unidade,
      (v_insumo ->> 'produto')::uuid,
      'PROCEDURE_USAGE',
      (v_insumo ->> 'quantidade')::numeric,
      (v_insumo ->> 'saldo_apos')::numeric,
      p_agendamento,
      coalesce(p_ator::text, 'sistema'),
      (v_insumo ->> 'custo')::numeric
    );

    insert into public.branch_product_stock
      (product_id, branch_id, current_stock, current_rendimento, min_stock, updated_at)
    values (
      (v_insumo ->> 'produto')::uuid, v_unidade,
      (v_insumo ->> 'embalagens')::numeric,
      (v_insumo ->> 'rendimento')::numeric,
      coalesce((v_insumo ->> 'minimo')::numeric, 0),
      now()
    )
    on conflict (product_id, branch_id) do update
      set current_stock      = excluded.current_stock,
          current_rendimento = excluded.current_rendimento,
          updated_at         = excluded.updated_at;
  end loop;

  -- 6. Sessão do pacote, se este atendimento é de um. O contador soma no banco.
  select id, client_package_id into v_sessao, v_pacote
  from public.package_sessions
  where appointment_id = p_agendamento
  for update;
  if v_sessao is not null then
    update public.package_sessions set status = 'USED', used_at = now() where id = v_sessao;
    update public.client_packages set used_sessions = used_sessions + 1 where id = v_pacote;
  end if;

  -- 7. A linha do tempo do agendamento.
  if p_ator is not null then
    insert into public.appointment_history
      (appointment_id, changed_by_id, changed_by_name, action, description)
    values (p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'COMPLETED', 'Atendimento concluído pelo profissional');
  end if;

  return jsonb_build_object('comissao_criada', v_nova_com, 'pacote', v_pacote);
end
$$;

comment on function public.concluir_atendimento is
  'Conclui o atendimento numa transação: status, prontuário, comissão, pontos, '
  'insumos, pacote e histórico. Recebe os números calculados pelo app '
  '(finishSession); não tem regra de negócio própria.';

revoke execute on function public.concluir_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.concluir_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
