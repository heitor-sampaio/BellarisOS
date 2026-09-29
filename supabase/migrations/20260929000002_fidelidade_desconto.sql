-- Fidelidade — fase 2: pontos como DESCONTO no pagamento do atendimento.
--
-- Na recepção, o cliente usa pontos e paga o resto. Três decisões:
--  - `financial_transactions.amount` continua sendo o DINHEIRO RECEBIDO. O
--    desconto vai para `loyalty_discount` (bruto = amount + loyalty_discount).
--    Assim metrics_receitas_pagas, LTV e o estorno seguem certos sem mudar nada:
--    receita é o que entrou (CLAUDE.md §13.1).
--  - Tudo numa transação só (`confirmar_pagamento_do_atendimento`), como a
--    conclusão: o app CALCULA o desconto, o banco confere e grava — o pagamento,
--    o resgate dos pontos, a comissão e a linha do tempo. Antes eram gravações
--    soltas; com pontos no meio, falhar no resgate deixaria o pagamento feito e
--    os pontos intactos.
--  - A comissão segue a escolha da rede (`loyalty_configs.commission_base`):
--    PRECO não muda; VALOR_PAGO cai na proporção do que foi pago.

alter table public.financial_transactions
  add column loyalty_discount numeric(12,2) not null default 0
    check (loyalty_discount >= 0);

comment on column public.financial_transactions.loyalty_discount is
  'Desconto de fidelidade (pontos) deste pagamento. amount é o dinheiro recebido; o bruto é amount + loyalty_discount.';

-- ─── O pagamento do atendimento, numa transação ──────────────────────────────
-- p_dados: { metodo, pontos, desconto, valor_final } — calculados no app
-- (lib/fidelidade/resgate.ts) e CONFERIDOS aqui contra a config e o saldo.
create or replace function public.confirmar_pagamento_do_atendimento(
  p_agendamento uuid,
  p_tenant      uuid,
  p_ator        uuid,
  p_ator_nome   text,
  p_dados       jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_status   text;
  v_unidade  uuid;
  v_cliente  uuid;
  v_preco    numeric;
  v_plano    uuid;
  v_rede     uuid;
  v_metodo   text    := nullif(trim(coalesce(p_dados ->> 'metodo', '')), '');
  v_pontos   int     := coalesce((p_dados ->> 'pontos')::int, 0);
  v_desconto numeric := round(coalesce((p_dados ->> 'desconto')::numeric, 0), 2);
  v_final    numeric := round(coalesce((p_dados ->> 'valor_final')::numeric, -1), 2);
  v_cfg      public.loyalty_configs%rowtype;
  v_saldo    int;
  v_tx       uuid;
  v_pago     boolean;
  v_agora    timestamptz := now();
begin
  select a.status::text, a.branch_id, a.client_id, a.price, a.treatment_plan_id, b.tenant_id
    into v_status, v_unidade, v_cliente, v_preco, v_plano, v_rede
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

  -- A conta fecha: o que se recebe + o desconto = o preço do atendimento.
  if v_pontos < 0 or v_desconto < 0 or v_final < 0 then
    raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
  end if;
  if v_final + v_desconto <> round(v_preco, 2) then
    raise exception 'O valor recebido mais o desconto não fecham com o preço do atendimento.' using errcode = 'P0001';
  end if;
  if v_final > 0 and v_metodo is null then
    raise exception 'Selecione a forma de pagamento.' using errcode = 'P0001';
  end if;

  if v_pontos = 0 and v_desconto > 0 then
    raise exception 'Desconto sem pontos.' using errcode = 'P0001';
  end if;

  if v_pontos > 0 then
    select * into v_cfg from public.loyalty_configs c where c.tenant_id = p_tenant and c.enabled;
    if not found then
      raise exception 'O programa de fidelidade está desligado nesta rede.' using errcode = 'P0001';
    end if;
    if v_pontos < v_cfg.redeem_min_points then
      raise exception 'O mínimo para usar pontos é % pontos.', v_cfg.redeem_min_points using errcode = 'P0001';
    end if;
    -- O desconto é o valor dos pontos (limitado ao preço) e respeita o teto.
    if v_desconto <> least(round(v_pontos * v_cfg.redeem_points_value, 2), round(v_preco, 2)) then
      raise exception 'O desconto não corresponde aos pontos usados.' using errcode = 'P0001';
    end if;
    if v_desconto > round(v_preco * v_cfg.redeem_max_pct / 100, 2) then
      raise exception 'Os pontos pagam no máximo % %% do atendimento.',
        trim(to_char(v_cfg.redeem_max_pct, 'FM990D##')) using errcode = 'P0001';
    end if;

    perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_cliente::text));
    v_saldo := public.saldo_de_pontos(v_cliente, case when v_cfg.scope_per_branch then v_unidade else null end);
    if v_saldo < v_pontos then
      raise exception 'Saldo de pontos insuficiente: o cliente tem % pontos.', greatest(v_saldo, 0) using errcode = 'P0001';
    end if;
  end if;

  -- O recebível que a conclusão deixou, ou um lançamento novo.
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
           loyalty_discount = v_desconto,
           payment_method   = v_metodo::public."PaymentMethod",
           is_paid          = true,
           paid_at          = v_agora,
           updated_at       = v_agora
     where id = v_tx;
  else
    insert into public.financial_transactions (
      branch_id, appointment_id, client_id, type, category, description,
      amount, loyalty_discount, payment_method, is_paid, paid_at, created_by
    ) values (
      v_unidade, p_agendamento, v_cliente, 'INCOME', 'Serviços', 'Atendimento concluído',
      v_final, v_desconto, v_metodo::public."PaymentMethod", true, v_agora,
      coalesce(p_ator::text, 'sistema')
    )
    returning id into v_tx;
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

    -- A comissão cai junto só se a rede escolheu assim.
    if v_cfg.commission_base = 'VALOR_PAGO' and v_preco > 0 then
      update public.commissions c
         set amount = round(c.amount * v_final / v_preco, 2)
       where c.appointment_id = p_agendamento
         and c.status = 'OPEN';
    end if;
  end if;

  if p_ator is not null then
    insert into public.appointment_history
      (appointment_id, changed_by_id, changed_by_name, action, description)
    values (
      p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'PAYMENT_CONFIRMED',
      case when v_pontos > 0
           then 'Pagamento confirmado' || coalesce(' via ' || v_metodo, '') ||
                ', com ' || v_pontos || ' pontos (R$ ' || replace(to_char(v_desconto, 'FM999999990.00'), '.', ',') || ')'
           else 'Pagamento confirmado via ' || coalesce(v_metodo, '—') end
    );
  end if;

  return v_tx;
end;
$$;

-- ─── Estorno: devolve também os pontos usados no pagamento ───────────────────
-- Corpo inteiro de 20260929000001 + o bloco do RESGATE.
create or replace function public.estornar_transacao(p_transacao uuid, p_tenant uuid, p_ator text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tx      public.financial_transactions%rowtype;
  v_tenant  uuid;
  v_novo_id uuid;
  v_ganho   public.loyalty_transactions%rowtype;
  v_resgate public.loyalty_transactions%rowtype;
  v_meses   int;
begin
  select t.* into v_tx
  from public.financial_transactions t
  where t.id = p_transacao
  for update;

  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'no_data_found';
  end if;

  select b.tenant_id into v_tenant
  from public.branches b where b.id = v_tx.branch_id;

  if v_tenant is distinct from p_tenant then
    raise exception 'Lançamento não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_tx.notes = 'Estornada' then
    raise exception 'Este lançamento já foi estornado.' using errcode = 'invalid_parameter_value';
  end if;

  if v_tx.category = 'Estorno' then
    raise exception 'Um estorno não se estorna — para desfazer, fale com o financeiro.' using errcode = 'invalid_parameter_value';
  end if;

  if not v_tx.is_paid then
    raise exception 'Lançamento ainda não pago: não há o que estornar.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.financial_transactions (
    branch_id, client_id, appointment_id, treatment_plan_id,
    type, category, description, amount,
    is_paid, paid_at, created_by
  ) values (
    v_tx.branch_id, v_tx.client_id, null, v_tx.treatment_plan_id,
    case when v_tx.type = 'INCOME' then 'EXPENSE' else 'INCOME' end::public."TransactionType",
    'Estorno',
    'Estorno: ' || v_tx.description,
    v_tx.amount,
    true, now(), p_ator
  )
  returning id into v_novo_id;

  update public.financial_transactions
     set notes = 'Estornada', updated_at = now()
   where id = p_transacao;

  if v_tx.payment_method = 'INTERNAL_CREDIT' and v_tx.type = 'INCOME' and v_tx.client_id is not null then
    insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
    values (v_tx.client_id, v_tx.branch_id, v_tx.amount, 'Estorno: ' || v_tx.description, v_novo_id);
  end if;

  if v_tx.type = 'INCOME' and v_tx.client_id is not null then
    select l.* into v_ganho
      from public.loyalty_transactions l
     where l.transaction_id = p_transacao and l.kind = 'GANHO';
    select l.* into v_resgate
      from public.loyalty_transactions l
     where l.transaction_id = p_transacao and l.kind = 'RESGATE';

    if v_ganho.id is not null or v_resgate.id is not null then
      perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_tx.client_id::text));
    end if;

    if v_ganho.id is not null then
      insert into public.loyalty_transactions (
        loyalty_account_id, branch_id, kind, points, description,
        transaction_id, appointment_id, treatment_plan_id, created_by
      ) values (
        v_ganho.loyalty_account_id, v_ganho.branch_id, 'ESTORNO_GANHO', -v_ganho.points,
        'Estorno: ' || v_tx.description,
        v_novo_id, v_ganho.appointment_id, v_ganho.treatment_plan_id, p_ator
      );
    end if;

    -- Os pontos usados como desconto voltam ao cliente — com validade nova,
    -- se a rede usa validade.
    if v_resgate.id is not null then
      select c.expiry_months into v_meses from public.loyalty_configs c where c.tenant_id = p_tenant;
      insert into public.loyalty_transactions (
        loyalty_account_id, branch_id, kind, points, description,
        transaction_id, appointment_id, expires_at, created_by
      ) values (
        v_resgate.loyalty_account_id, v_resgate.branch_id, 'ESTORNO_RESGATE', -v_resgate.points,
        'Estorno: ' || v_tx.description,
        v_novo_id, v_resgate.appointment_id,
        case when v_meses is null then null else now() + make_interval(months => v_meses) end,
        p_ator
      );
    end if;
  end if;

  return v_novo_id;
end;
$$;

-- ─── Pagamento de R$ 0 (tudo em pontos) não é "Purchase" para a Meta ─────────
-- Corpo inteiro de on_transaction_paid; o evento pagamento.recebido continua
-- saindo (com valor 0), só a conversão de compra fica de fora.
create or replace function public.on_transaction_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid;
  v_clid   text;
  v_ad     text;
  v_nome   text;
begin
  if new.is_paid is not true then return new; end if;
  if tg_op = 'UPDATE' and old.is_paid is true then return new; end if;
  if new.type::text <> 'INCOME' then return new; end if;
  if new.client_id is null then return new; end if;
  if coalesce(new.category, '') = 'Estorno' then return new; end if;

  select b.tenant_id into v_tenant
  from public.branches b where b.id = new.branch_id;
  if v_tenant is null then return new; end if;

  select c.name, c.ctwa_clid into v_nome, v_clid
  from public.clients c where c.id = new.client_id;

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
  values (
    v_tenant, new.branch_id, 'pagamento.recebido', 'pagamento', new.id,
    jsonb_build_object(
      'clienteId', new.client_id, 'clienteNome', v_nome, 'valor', new.amount,
      'formaPagamento', new.payment_method::text, 'categoria', new.category,
      'descricao', new.description, 'planoId', new.treatment_plan_id,
      'agendamentoId', new.appointment_id
    ),
    'sistema', 'banco', 'pagamento.recebido:' || new.id,
    coalesce(new.paid_at, now())
  )
  on conflict (tenant_id, chave) where chave is not null do nothing;

  if v_clid is null or new.amount <= 0 then return new; end if;

  select (attribution ->> 'ad_id') into v_ad
  from public.conversations
  where tenant_id = v_tenant
    and client_id = new.client_id
    and attribution ->> 'ad_id' is not null
  order by last_message_at desc nulls last limit 1;

  insert into public.meta_capi_events
    (tenant_id, event_id, event_name, ctwa_clid, ad_id, valor, ocorrido_em)
  values
    (v_tenant, 'purchase:' || new.id, 'Purchase', v_clid, v_ad,
     new.amount, coalesce(new.paid_at, now()))
  on conflict (tenant_id, event_id) do nothing;

  return new;
end
$$;

revoke execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;
revoke execute on function public.estornar_transacao(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.estornar_transacao(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
