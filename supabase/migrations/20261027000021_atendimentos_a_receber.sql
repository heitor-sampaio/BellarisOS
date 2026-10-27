-- O atendimento concluído a receber (D5) e o de R$ 0, sem cobrança (D9) —
-- simulação de um dia de clínica, 2026-10-27, decisões do Heitor.
--
-- D5: nenhuma tela levava ao "Confirmar pagamento" de um atendimento
-- concluído. A agenda dizia "Este agendamento já foi encerrado.", e nem o
-- Fechamento do dia nem a ficha listavam o que estava a receber. A lista é
-- UMA conta, aqui: concluído, com preço, avulso (sem plano, sem sessão de
-- pacote, sem unidade pré-paga — esses já foram pagos na venda) e sem
-- recebimento lançado. É o mesmo conjunto que `confirmar_pagamento_do_atendimento`
-- aceita receber.
--
-- D9: a avaliação de R$ 0 ficava "aguardando pagamento" para sempre. Ela não
-- tem o que receber: não entra na lista, e o banco recusa "receber" R$ 0 (o
-- lançamento de zero não nasce).

create or replace function public.atendimentos_a_receber(
  p_tenant       uuid,
  p_unidade      uuid default null,
  p_cliente      uuid default null,
  p_agendamento  uuid default null,
  p_profissional uuid default null
)
returns table (
  appointment_id   uuid,
  branch_id        uuid,
  branch_slug      text,
  client_id        uuid,
  client_name      text,
  procedure_id     uuid,
  procedure_name   text,
  professional_name text,
  price            numeric,
  scheduled_at     timestamptz,
  completed_at     timestamptz,
  -- O total da lista inteira (não da página): a tela não soma.
  total_n          bigint,
  total_valor      numeric
)
language sql
stable
set search_path = ''
as $fn$
  select a.id, a.branch_id, b.slug, a.client_id, c.name, a.procedure_id, p.name, u.name,
         round(a.price, 2), a.scheduled_at, a.completed_at,
         count(*) over (), round(sum(a.price) over (), 2)
    from public.appointments a
    join public.branches b on b.id = a.branch_id
    left join public.clients c    on c.id = a.client_id
    left join public.procedures p on p.id = a.procedure_id
    left join public.users u      on u.id = a.professional_id
   where b.tenant_id = p_tenant
     and a.status = 'COMPLETED'
     and coalesce(a.price, 0) > 0
     and a.treatment_plan_id is null
     and (p_unidade      is null or a.branch_id       = p_unidade)
     and (p_cliente      is null or a.client_id       = p_cliente)
     and (p_agendamento  is null or a.id              = p_agendamento)
     and (p_profissional is null or a.professional_id = p_profissional)
     and not exists (select 1 from public.package_sessions ps where ps.appointment_id = a.id)
     and not exists (select 1 from public.procedure_sale_units un
                      where un.appointment_id = a.id and un.status <> 'CANCELADA')
     and not exists (select 1 from public.financial_transactions f
                      where f.appointment_id = a.id and f.type = 'INCOME' and f.is_paid)
   order by a.completed_at, a.id
$fn$;

revoke all on function public.atendimentos_a_receber(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.atendimentos_a_receber(uuid, uuid, uuid, uuid, uuid) to service_role;

-- D9: receber R$ 0 é recusado. A guarda entra logo depois das de plano,
-- pacote e pré-pago; o resto da função é o de 20261020000005.
create or replace function public.confirmar_pagamento_do_atendimento(p_agendamento uuid, p_tenant uuid, p_ator uuid, p_ator_nome text, p_dados jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_status    text;
  v_unidade   uuid;
  v_cliente   uuid;
  v_preco     numeric;
  v_plano     uuid;
  v_rede      uuid;
  v_proc      uuid;
  v_metodo    text    := nullif(trim(coalesce(p_dados ->> 'metodo', '')), '');
  v_pontos    int     := coalesce((p_dados ->> 'pontos')::int, 0);
  v_desconto  numeric := round(coalesce((p_dados ->> 'desconto')::numeric, 0), 2);
  v_final     numeric := round(coalesce((p_dados ->> 'valor_final')::numeric, -1), 2);
  v_vid       uuid    := nullif(p_dados ->> 'voucher_id', '')::uuid;
  v_dv        numeric := round(coalesce((p_dados ->> 'desconto_voucher')::numeric, 0), 2);
  v_dvenda    numeric := round(coalesce((p_dados ->> 'desconto_venda')::numeric, 0), 2);
  v_vezes     int     := coalesce(nullif(p_dados ->> 'cartao_vezes', '')::int, 1);
  v_voucher   public.loyalty_vouchers%rowtype;
  v_esperado  numeric;
  v_base      numeric;
  v_cfg       public.loyalty_configs%rowtype;
  v_saldo     int;
  v_tx        uuid;
  v_pago      boolean;
  v_agora     timestamptz := now();
  v_descricao text;
begin
  select a.status::text, a.branch_id, a.client_id, a.price, a.treatment_plan_id, a.procedure_id, b.tenant_id
    into v_status, v_unidade, v_cliente, v_preco, v_plano, v_proc, v_rede
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.id = p_agendamento
  for update of a;

  if not found or v_rede is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'COMPLETED' then
    raise exception 'O atendimento precisa estar concluído para confirmar pagamento.' using errcode = 'P0001';
  end if;
  if v_plano is not null then
    raise exception 'Sessão de plano de tratamento: o pagamento é recebido no plano, não no atendimento.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.package_sessions ps where ps.appointment_id = p_agendamento) then
    raise exception 'Sessão de pacote: já foi paga na venda do pacote.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.procedure_sale_units u where u.appointment_id = p_agendamento and u.status <> 'CANCELADA') then
    raise exception 'Procedimento pré-pago: já foi pago na venda.' using errcode = 'P0001';
  end if;
  if coalesce(v_preco, 0) <= 0 then
    raise exception 'Atendimento sem cobrança: não há o que receber.' using errcode = 'P0001';
  end if;

  if v_pontos < 0 or v_desconto < 0 or v_final < 0 or v_dv < 0 or v_dvenda < 0 then
    raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
  end if;
  if v_vezes < 1 or v_vezes > 12 or (v_vezes > 1 and v_metodo is distinct from 'CREDIT_CARD') then
    raise exception 'Parcelar na maquininha só no cartão de crédito, de 1 a 12 vezes.' using errcode = 'P0001';
  end if;
  if v_final + v_desconto + v_dv + v_dvenda <> round(v_preco, 2) then
    raise exception 'O valor recebido mais os descontos não fecham com o preço do atendimento.' using errcode = 'P0001';
  end if;
  if v_final > 0 and v_metodo is null then
    raise exception 'Selecione a forma de pagamento.' using errcode = 'P0001';
  end if;
  if v_pontos = 0 and v_desconto > 0 then
    raise exception 'Desconto sem pontos.' using errcode = 'P0001';
  end if;
  if v_vid is null and v_dv > 0 then
    raise exception 'Desconto de voucher sem voucher.' using errcode = 'P0001';
  end if;

  if v_pontos > 0 or v_vid is not null then
    select * into v_cfg from public.loyalty_configs c where c.tenant_id = p_tenant and c.enabled;
    if not found then
      raise exception 'O programa de fidelidade está desligado nesta rede.' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_cliente::text));
  end if;

  if v_vid is not null then
    select * into v_voucher from public.loyalty_vouchers v where v.id = v_vid for update;
    if not found or v_voucher.tenant_id is distinct from p_tenant or v_voucher.client_id is distinct from v_cliente then
      raise exception 'Voucher não encontrado para este cliente.' using errcode = 'no_data_found';
    end if;
    if v_voucher.status <> 'ATIVO' then
      raise exception 'Este voucher já foi usado ou cancelado.' using errcode = 'P0001';
    end if;
    if v_voucher.expires_at <= v_agora then
      raise exception 'Voucher vencido.' using errcode = 'P0001';
    end if;
    if v_cfg.scope_per_branch and v_voucher.branch_id <> v_unidade then
      raise exception 'Este voucher é de outra unidade.' using errcode = 'P0001';
    end if;
    v_esperado := case v_voucher.type
      when 'PROCEDIMENTO' then
        case when v_voucher.procedure_id = v_proc then round(v_preco, 2) else null end
      when 'DESCONTO_VALOR'      then least(v_voucher.discount_value, round(v_preco, 2))
      when 'DESCONTO_PERCENTUAL' then round(v_preco * v_voucher.discount_value / 100, 2)
      else null end;
    if v_voucher.type = 'PRODUTO' then
      raise exception 'Voucher de produto é entregue, não aplicado no pagamento.' using errcode = 'P0001';
    end if;
    if v_esperado is null then
      raise exception 'Este voucher é de outro procedimento.' using errcode = 'P0001';
    end if;
    if v_dv <> v_esperado then
      raise exception 'O desconto não corresponde ao voucher.' using errcode = 'P0001';
    end if;
  end if;

  if v_dvenda > round(v_preco, 2) - v_dv then
    raise exception 'O desconto não pode ser maior que o valor do atendimento.' using errcode = 'P0001';
  end if;

  v_base := round(v_preco, 2) - v_dv - v_dvenda;
  if v_pontos > 0 then
    if v_pontos < v_cfg.redeem_min_points then
      raise exception 'O mínimo para usar pontos é % pontos.', v_cfg.redeem_min_points using errcode = 'P0001';
    end if;
    if v_desconto <> least(round(v_pontos * v_cfg.redeem_points_value, 2), v_base) then
      raise exception 'O desconto não corresponde aos pontos usados.' using errcode = 'P0001';
    end if;
    if v_desconto > round(v_base * v_cfg.redeem_max_pct / 100, 2) then
      raise exception 'Os pontos pagam no máximo % %% do atendimento.',
        trim(to_char(v_cfg.redeem_max_pct, 'FM990D##')) using errcode = 'P0001';
    end if;
    v_saldo := public.saldo_de_pontos(v_cliente, case when v_cfg.scope_per_branch then v_unidade else null end);
    if v_saldo < v_pontos then
      raise exception 'Saldo de pontos insuficiente: o cliente tem % pontos.', greatest(v_saldo, 0) using errcode = 'P0001';
    end if;
  end if;

  select f.id, f.is_paid into v_tx, v_pago
    from public.financial_transactions f
   where f.appointment_id = p_agendamento
   for update;

  if v_pago then
    raise exception 'Pagamento já registrado para este atendimento.' using errcode = 'P0001';
  end if;

  if v_tx is not null then
    update public.financial_transactions
       set amount           = v_final,
           loyalty_discount = v_desconto + v_dv,
           sale_discount    = v_dvenda,
           payment_method   = v_metodo::public."PaymentMethod",
           cartao_vezes     = case when v_vezes > 1 then v_vezes end,
           is_paid          = true,
           paid_at          = v_agora,
           updated_at       = v_agora
     where id = v_tx;
  else
    insert into public.financial_transactions (
      branch_id, appointment_id, client_id, type, category, description,
      amount, loyalty_discount, sale_discount, payment_method, cartao_vezes, is_paid, paid_at, created_by
    ) values (
      v_unidade, p_agendamento, v_cliente, 'INCOME', 'Serviços', 'Atendimento concluído',
      v_final, v_desconto + v_dv, v_dvenda, v_metodo::public."PaymentMethod",
      case when v_vezes > 1 then v_vezes end, true, v_agora,
      coalesce(p_ator::text, 'sistema')
    )
    returning id into v_tx;
  end if;

  if v_vid is not null then
    update public.loyalty_vouchers
       set status = 'USADO', used_at = v_agora, used_transaction_id = v_tx
     where id = v_vid;
  end if;

  if v_pontos > 0 then
    insert into public.loyalty_transactions (
      loyalty_account_id, branch_id, kind, points, description,
      transaction_id, appointment_id, created_by
    ) values (
      public.fidelidade_conta(v_cliente), v_unidade, 'RESGATE', -v_pontos,
      'Desconto no pagamento: R$ ' || replace(to_char(v_desconto, 'FM999999990.00'), '.', ','),
      v_tx, p_agendamento, coalesce(p_ator::text, 'sistema')
    );
  end if;

  if p_ator is not null then
    v_descricao := 'Pagamento confirmado' || coalesce(' via ' || v_metodo, '')
      || case when v_vezes > 1 then ' em ' || v_vezes || 'x' else '' end;
    if v_dvenda > 0 then
      v_descricao := v_descricao || ', com desconto de R$ ' || replace(to_char(v_dvenda, 'FM999999990.00'), '.', ',');
    end if;
    if v_vid is not null then
      v_descricao := v_descricao || ', com o voucher "' || v_voucher.name || '"';
    end if;
    if v_pontos > 0 then
      v_descricao := v_descricao || ', com ' || v_pontos || ' pontos (R$ ' ||
        replace(to_char(v_desconto, 'FM999999990.00'), '.', ',') || ')';
    end if;
    insert into public.appointment_history
      (appointment_id, changed_by_id, changed_by_name, action, description)
    values (p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'PAYMENT_CONFIRMED', v_descricao);
  end if;

  return v_tx;
end;
$function$;

notify pgrst, 'reload schema';
