-- Fidelidade — fase 3: catálogo de recompensas e vouchers.
--
-- A rede cadastra recompensas (procedimento grátis, desconto em R$ ou %,
-- produto/brinde) com custo em pontos. A equipe troca os pontos do cliente por
-- uma recompensa: os pontos saem NA HORA e o cliente fica com um VOUCHER, com
-- validade, que aparece no portal. O voucher de procedimento/desconto é aplicado
-- no pagamento; o de produto é ENTREGUE (baixa no estoque da unidade).
--
-- Decisões (Heitor, 2026-09-28): o cliente não resgata sozinho pelo portal;
-- cancelar um voucher não usado devolve os pontos; voucher vencido não vale e
-- não devolve (o vencimento é lido de expires_at — não precisa de job).
--
-- O voucher guarda um RETRATO da recompensa (tipo, nome, valor, custo): editar
-- ou desativar a recompensa depois não muda o que o cliente já ganhou.

-- ─── Catálogo ────────────────────────────────────────────────────────────────
create table public.loyalty_rewards (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id),
  name           text not null check (length(trim(name)) >= 2),
  description    text,
  type           text not null check (type in ('PROCEDIMENTO', 'DESCONTO_VALOR', 'DESCONTO_PERCENTUAL', 'PRODUTO')),
  points_cost    int  not null check (points_cost > 0),
  procedure_id   uuid references public.procedures(id),
  product_id     uuid references public.products(id),
  discount_value numeric(12,2),
  validity_days  int  not null default 30 check (validity_days between 1 and 365),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Cada tipo com o que precisa, e só isso.
  constraint loyalty_rewards_por_tipo check (
    (type = 'PROCEDIMENTO'        and procedure_id is not null and product_id is null and discount_value is null) or
    (type = 'PRODUTO'             and product_id is not null and procedure_id is null and discount_value is null) or
    (type = 'DESCONTO_VALOR'      and discount_value > 0 and procedure_id is null and product_id is null) or
    (type = 'DESCONTO_PERCENTUAL' and discount_value > 0 and discount_value <= 100 and procedure_id is null and product_id is null)
  )
);
create index idx_loyalty_rewards_rede on public.loyalty_rewards (tenant_id, is_active);

-- ─── Vouchers ────────────────────────────────────────────────────────────────
create table public.loyalty_vouchers (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id),
  client_id              uuid not null references public.clients(id),
  branch_id              uuid not null references public.branches(id),
  reward_id              uuid not null references public.loyalty_rewards(id),
  -- Retrato da recompensa no momento da troca.
  type                   text not null,
  name                   text not null,
  procedure_id           uuid references public.procedures(id),
  product_id             uuid references public.products(id),
  discount_value         numeric(12,2),
  points_cost            int  not null,
  status                 text not null default 'ATIVO' check (status in ('ATIVO', 'USADO', 'CANCELADO')),
  expires_at             timestamptz not null,
  used_at                timestamptz,
  used_transaction_id    uuid references public.financial_transactions(id),
  used_stock_movement_id uuid references public.stock_movements(id),
  cancel_reason          text,
  cancelled_by           text,
  created_by             text,
  created_at             timestamptz not null default now()
);
create unique index uniq_voucher_por_pagamento on public.loyalty_vouchers (used_transaction_id)
  where used_transaction_id is not null;
create index idx_loyalty_vouchers_cliente on public.loyalty_vouchers (client_id, status);

alter table public.loyalty_transactions
  add constraint loyalty_transactions_voucher_id_fkey
    foreign key (voucher_id) references public.loyalty_vouchers(id);

-- ─── RLS: só leitura pela sessão ─────────────────────────────────────────────
alter table public.loyalty_rewards  enable row level security;
alter table public.loyalty_vouchers enable row level security;

create policy "loyalty_rewards_select" on public.loyalty_rewards for select
  using (
    (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid)
    or (public.jwt_claim('role') = 'CLIENT' and exists (
      select 1 from public.clients c
      where c.id::text = public.jwt_claim('client_id') and c.tenant_id = loyalty_rewards.tenant_id))
  );

create policy "loyalty_vouchers_select" on public.loyalty_vouchers for select
  using (
    (public.jwt_claim('role') <> 'CLIENT' and private.cliente_da_minha_rede(client_id))
    or (public.jwt_claim('role') = 'CLIENT' and client_id::text = public.jwt_claim('client_id'))
  );

-- ─── Trocar pontos por uma recompensa ────────────────────────────────────────
create or replace function public.resgatar_recompensa(
  p_tenant uuid, p_cliente uuid, p_recompensa uuid, p_unidade uuid, p_ator text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg     public.loyalty_configs%rowtype;
  v_rec     public.loyalty_rewards%rowtype;
  v_saldo   int;
  v_voucher uuid;
begin
  if not exists (select 1 from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant) then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select * into v_cfg from public.loyalty_configs c where c.tenant_id = p_tenant and c.enabled;
  if not found then
    raise exception 'O programa de fidelidade está desligado nesta rede.' using errcode = 'P0001';
  end if;
  select * into v_rec from public.loyalty_rewards r where r.id = p_recompensa and r.tenant_id = p_tenant;
  if not found then
    raise exception 'Recompensa não encontrada.' using errcode = 'no_data_found';
  end if;
  if not v_rec.is_active then
    raise exception 'Esta recompensa não está mais disponível.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('fidelidade:' || p_cliente::text));
  v_saldo := public.saldo_de_pontos(p_cliente, case when v_cfg.scope_per_branch then p_unidade else null end);
  if v_saldo < v_rec.points_cost then
    raise exception 'Saldo insuficiente: a recompensa custa % pontos e o cliente tem %.', v_rec.points_cost, greatest(v_saldo, 0)
      using errcode = 'P0001';
  end if;

  insert into public.loyalty_vouchers (
    tenant_id, client_id, branch_id, reward_id, type, name, procedure_id, product_id,
    discount_value, points_cost, expires_at, created_by
  ) values (
    p_tenant, p_cliente, p_unidade, v_rec.id, v_rec.type, v_rec.name, v_rec.procedure_id, v_rec.product_id,
    v_rec.discount_value, v_rec.points_cost, now() + make_interval(days => v_rec.validity_days), p_ator
  )
  returning id into v_voucher;

  insert into public.loyalty_transactions (
    loyalty_account_id, branch_id, kind, points, description, voucher_id, created_by
  ) values (
    public.fidelidade_conta(p_cliente), p_unidade, 'VOUCHER', -v_rec.points_cost,
    'Recompensa: ' || v_rec.name, v_voucher, p_ator
  );

  return v_voucher;
end;
$$;

-- ─── Cancelar um voucher não usado: os pontos voltam ─────────────────────────
create or replace function public.cancelar_voucher(p_tenant uuid, p_voucher uuid, p_ator text, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_v     public.loyalty_vouchers%rowtype;
  v_meses int;
begin
  select * into v_v from public.loyalty_vouchers v where v.id = p_voucher for update;
  if not found or v_v.tenant_id is distinct from p_tenant then
    raise exception 'Voucher não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_v.status <> 'ATIVO' then
    raise exception 'Só um voucher ativo pode ser cancelado.' using errcode = 'P0001';
  end if;
  if v_v.expires_at <= now() then
    raise exception 'Voucher vencido: os pontos não voltam.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'O motivo do cancelamento é obrigatório.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_v.client_id::text));

  update public.loyalty_vouchers
     set status = 'CANCELADO', cancel_reason = trim(p_motivo), cancelled_by = p_ator
   where id = p_voucher;

  select c.expiry_months into v_meses from public.loyalty_configs c where c.tenant_id = p_tenant;
  insert into public.loyalty_transactions (
    loyalty_account_id, branch_id, kind, points, description, voucher_id, expires_at, created_by
  ) values (
    public.fidelidade_conta(v_v.client_id), v_v.branch_id, 'VOUCHER_CANCELADO', v_v.points_cost,
    'Voucher cancelado: ' || v_v.name || ' — ' || trim(p_motivo), p_voucher,
    case when v_meses is null then null else now() + make_interval(months => v_meses) end,
    p_ator
  );
end;
$$;

-- ─── Entregar o produto de um voucher: baixa no estoque ──────────────────────
-- Como o passo 5 da conclusão: o app calcula o saldo (lib/estoque/baixa.ts) e o
-- banco grava. Um MANUAL_ADJUSTMENT negativo: o lote baixa pelo gatilho
-- (FEFO), o mínimo cruzado e o evento de estoque também. Produto faltando não
-- impede a entrega — o saldo fica negativo, como na conclusão.
create or replace function public.entregar_voucher_produto(
  p_tenant uuid, p_voucher uuid, p_unidade uuid, p_ator text, p_dados jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_v   public.loyalty_vouchers%rowtype;
  v_cfg public.loyalty_configs%rowtype;
  v_mov uuid;
begin
  select * into v_v from public.loyalty_vouchers v where v.id = p_voucher for update;
  if not found or v_v.tenant_id is distinct from p_tenant then
    raise exception 'Voucher não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_v.type <> 'PRODUTO' then
    raise exception 'Este voucher não é de produto: ele é usado no pagamento.' using errcode = 'P0001';
  end if;
  if v_v.status <> 'ATIVO' then
    raise exception 'Este voucher já foi usado ou cancelado.' using errcode = 'P0001';
  end if;
  if v_v.expires_at <= now() then
    raise exception 'Voucher vencido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select * into v_cfg from public.loyalty_configs c where c.tenant_id = p_tenant;
  if coalesce(v_cfg.scope_per_branch, false) and v_v.branch_id <> p_unidade then
    raise exception 'Este voucher é da outra unidade.' using errcode = 'P0001';
  end if;

  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, created_by, unit_cost, reference, notes)
  values (
    p_unidade, v_v.product_id, 'MANUAL_ADJUSTMENT',
    (p_dados ->> 'quantidade')::numeric,
    (p_dados ->> 'saldo_apos')::numeric,
    coalesce(p_ator, 'sistema'),
    (p_dados ->> 'custo')::numeric,
    'voucher:' || v_v.id,
    'Entrega de recompensa: ' || v_v.name
  )
  returning id into v_mov;

  insert into public.branch_product_stock
    (product_id, branch_id, current_stock, current_rendimento, min_stock, updated_at)
  values (
    v_v.product_id, p_unidade,
    (p_dados ->> 'embalagens')::numeric,
    (p_dados ->> 'rendimento')::numeric,
    coalesce((p_dados ->> 'minimo')::numeric, 0),
    now()
  )
  on conflict (product_id, branch_id) do update
    set current_stock      = excluded.current_stock,
        current_rendimento = excluded.current_rendimento,
        updated_at         = excluded.updated_at;

  update public.loyalty_vouchers
     set status = 'USADO', used_at = now(), used_stock_movement_id = v_mov
   where id = p_voucher;
end;
$$;

-- ─── Pagamento: aceita voucher (antes dos pontos) ────────────────────────────
-- Corpo de 20260929000002 + o voucher. O voucher desconta primeiro; os pontos
-- valem sobre o que sobra (o teto também). loyalty_discount soma os dois.
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

  if v_pontos < 0 or v_desconto < 0 or v_final < 0 or v_dv < 0 then
    raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
  end if;
  if v_final + v_desconto + v_dv <> round(v_preco, 2) then
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

  -- O voucher: do cliente, ativo, no prazo, e o desconto é o que ele vale.
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

  -- Os pontos valem sobre o que sobrou depois do voucher.
  v_base := round(v_preco, 2) - v_dv;
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
      v_final, v_desconto + v_dv, v_metodo::public."PaymentMethod", true, v_agora,
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

  if (v_pontos > 0 or v_vid is not null) and v_cfg.commission_base = 'VALOR_PAGO' and v_preco > 0 then
    update public.commissions c
       set amount = round(c.amount * v_final / v_preco, 2)
     where c.appointment_id = p_agendamento
       and c.status = 'OPEN';
  end if;

  if p_ator is not null then
    v_descricao := 'Pagamento confirmado' || coalesce(' via ' || v_metodo, '');
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
$$;

-- ─── Estorno: o voucher usado no pagamento volta a ativo ─────────────────────
-- Corpo de 20260929000002 + a volta do voucher. Ele mantém a validade de
-- origem: se já venceu, volta ativo mas vencido — não vale.
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

    if v_ganho.id is not null or v_resgate.id is not null
       or exists (select 1 from public.loyalty_vouchers v where v.used_transaction_id = p_transacao) then
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

    update public.loyalty_vouchers
       set status = 'ATIVO', used_at = null, used_transaction_id = null
     where used_transaction_id = p_transacao and status = 'USADO';
  end if;

  return v_novo_id;
end;
$$;

revoke execute on function public.resgatar_recompensa(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.resgatar_recompensa(uuid, uuid, uuid, uuid, text) to service_role;
revoke execute on function public.cancelar_voucher(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.cancelar_voucher(uuid, uuid, text, text) to service_role;
revoke execute on function public.entregar_voucher_produto(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.entregar_voucher_produto(uuid, uuid, uuid, text, jsonb) to service_role;
revoke execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;
revoke execute on function public.estornar_transacao(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.estornar_transacao(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
