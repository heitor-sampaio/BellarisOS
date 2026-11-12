-- C32 do levantamento das regras (F67, 2026-11-12): o checkout do plano numa
-- transação só.
--
-- Até aqui `checkoutTreatmentPlan` gravava em pedaços: o desconto, cada
-- lançamento, cada agendamento, cada sessão, o ACCEPTED (sem conferir que o
-- plano ainda era PROPOSED) e a comissão de venda. Duas abas ao mesmo tempo —
-- ou uma falha no meio seguida de "tentar de novo" — gravavam o dinheiro duas
-- vezes, e o plano podia ficar aceito sem a comissão de venda.
--
-- Agora o app confere (permissão, documentos, peças da agenda, horário, quem
-- vendeu) e MONTA os lançamentos e os agendamentos; esta função TRAVA o plano,
-- confere que ainda é PROPOSED e grava tudo junto. A segunda chegada espera a
-- trava e ouve "Este plano já foi fechado".

create or replace function public.plano_checkout(
  p_tenant       uuid,
  p_plano        uuid,
  p_ator         uuid,
  p_desconto     numeric,
  p_precos       jsonb,
  p_lancamentos  jsonb,
  p_agendamentos jsonb,
  p_com_comissao boolean,
  p_vendedor     uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano      record;
  v_total      numeric;
  v_lancado    numeric;
  v_j          jsonb;
  v_id         uuid;
  v_primeiro   uuid;
  v_appt       uuid;
  v_primeira_c uuid;
  v_sessao     record;
begin
  select tp.id, tp.status, tp.branch_id, tp.client_id
    into v_plano
    from public.treatment_plans tp
    join public.branches b on b.id = tp.branch_id
   where tp.id = p_plano and b.tenant_id = p_tenant
     for update of tp;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = 'P0001';
  end if;
  if v_plano.status <> 'PROPOSED' then
    raise exception 'Este plano já foi fechado. Recarregue a tela.' using errcode = 'P0001';
  end if;

  -- O desconto vira o preço de cada procedimento (rateado), como antes.
  perform public.plano_aplicar_desconto(p_plano, p_tenant, p_ator, p_desconto, p_precos);

  select coalesce(sum(p.price), 0) into v_total
    from public.treatment_plan_session_procedures p
    join public.treatment_plan_sessions s on s.id = p.session_id
   where s.plan_id = p_plano;

  -- O dinheiro que o app montou fecha com o plano depois do desconto.
  select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) into v_lancado
    from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l;
  if jsonb_array_length(coalesce(p_lancamentos, '[]'::jsonb)) = 0 or round(v_lancado, 2) <> round(v_total, 2) then
    raise exception 'O pagamento não fecha com o valor do plano. Recarregue a tela.' using errcode = 'P0001';
  end if;

  for v_j in select x from jsonb_array_elements(p_lancamentos) x
  loop
    insert into public.financial_transactions
      (branch_id, client_id, treatment_plan_id, type, category, description, created_by,
       desconto_motivo, amount, payment_method, is_paid, paid_at, cartao_vezes, cartao_bandeira,
       due_date, notes, parcela_numero, parcela_total, parcela_grupo)
    values (
      v_plano.branch_id, v_plano.client_id, p_plano, 'INCOME', 'Serviços',
      v_j ->> 'description',
      p_ator::text,
      nullif(v_j ->> 'desconto_motivo', ''),
      round((v_j ->> 'amount')::numeric, 2),
      nullif(v_j ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_j ->> 'is_paid')::boolean, false),
      case when coalesce((v_j ->> 'is_paid')::boolean, false) then now() end,
      nullif(v_j ->> 'cartao_vezes', '')::smallint,
      private.bandeira_do_cartao(v_j ->> 'payment_method', v_j ->> 'cartao_bandeira'),
      nullif(v_j ->> 'due_date', '')::timestamptz,
      nullif(v_j ->> 'notes', ''),
      nullif(v_j ->> 'parcela_numero', '')::int,
      nullif(v_j ->> 'parcela_total', '')::int,
      nullif(v_j ->> 'parcela_grupo', '')::uuid
    )
    returning id into v_id;
    v_primeiro := coalesce(v_primeiro, v_id);
  end loop;

  -- As sessões: a agendada ganha o agendamento (o preço é o da sessão, já com
  -- o desconto); a outra fica sem.
  for v_sessao in select s.id from public.treatment_plan_sessions s where s.plan_id = p_plano order by s.sort_order, s.id
  loop
    v_appt := null;
    select x into v_j from jsonb_array_elements(coalesce(p_agendamentos, '[]'::jsonb)) x
     where (x ->> 'sessao')::uuid = v_sessao.id
     limit 1;
    if v_j is not null then
      insert into public.appointments
        (branch_id, client_id, procedure_id, professional_id, scheduled_at, duration_min, price,
         status, source, treatment_plan_id, room_id)
      values (
        (v_j ->> 'branch_id')::uuid, v_plano.client_id, (v_j ->> 'procedure_id')::uuid,
        (v_j ->> 'professional_id')::uuid, (v_j ->> 'scheduled_at')::timestamptz,
        (v_j ->> 'duration_min')::int,
        (select coalesce(sum(p.price), 0) from public.treatment_plan_session_procedures p where p.session_id = v_sessao.id),
        'SCHEDULED', 'INTERNAL', p_plano, nullif(v_j ->> 'room_id', '')::uuid
      )
      returning id into v_appt;
      v_primeira_c := coalesce(v_primeira_c, v_appt);
    end if;
    update public.treatment_plan_sessions set appointment_id = v_appt where id = v_sessao.id;
    v_j := null;
  end loop;

  update public.treatment_plans
     set status = 'ACCEPTED', updated_at = now()
   where id = p_plano and status = 'PROPOSED';

  if p_com_comissao then
    perform public.plano_comissao_de_venda(p_tenant, p_plano, p_vendedor);
  end if;

  return jsonb_build_object('transacao', v_primeiro, 'agendamento', v_primeira_c, 'total', round(v_total, 2));
end
$$;

revoke execute on function public.plano_checkout(uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function public.plano_checkout(uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, boolean, uuid) to service_role;

notify pgrst, 'reload schema';
