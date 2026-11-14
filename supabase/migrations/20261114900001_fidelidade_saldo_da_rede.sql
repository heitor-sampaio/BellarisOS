-- FD3 do plano de adaptação (o Heitor, 2026-11-13: "concordo"): "pontos só na
-- unidade" sai. A cliente é da rede e qualquer unidade a atende; o saldo é
-- sempre UM, da rede. Saem junto o "Onde o bônus pode ser usado" (H10) e a
-- C64 — com um saldo só, não há o que escolher.
--
-- O branch_id de cada lançamento (loyalty_transactions) e de cada voucher
-- FICA: é o fato de onde ele aconteceu (o extrato diz "· Unidade X"), nunca
-- um recorte do saldo.
--
-- DESTRUTIVO ("aplica e anota", o Heitor, 2026-11-13; o banco é zerado antes
-- do lançamento, sem saldo a migrar, sem backfill):
--   - loyalty_configs.scope_per_branch: a coluna sai;
--   - saldos_por_unidade(uuid): sai;
--   - saldo_de_pontos(uuid, uuid)                  → saldo_de_pontos(uuid);
--   - fidelidade_a_expirar(uuid, uuid, timestamptz) → fidelidade_a_expirar(uuid, timestamptz);
--   - pontos_expirando(uuid, uuid, timestamptz)     → pontos_expirando(uuid, timestamptz).
-- Recriadas sem a abrangência (o corpo parte do da produção em 2026-11-14,
-- pg_get_functiondef): ajustar_pontos, resgatar_recompensa,
-- entregar_voucher_produto, expirar_pontos, avisos_de_vencimento,
-- on_transaction_loyalty_earn, confirmar_pagamento_do_atendimento,
-- private.fidelidade_na_venda, fidelidade_pontos_do_conjunto e
-- fidelidade_pontos_do_estorno. As assinaturas delas não mudam (a p_unidade
-- de quem a tem continua: é onde o lançamento acontece). Os grants ficam os
-- de antes: só o service_role (o private, só o dono).

-- 1. As contas do saldo, sem unidade ---------------------------------------
drop function if exists public.saldos_por_unidade(uuid);
drop function if exists public.saldo_de_pontos(uuid, uuid);
drop function if exists public.pontos_expirando(uuid, uuid, timestamptz);
drop function if exists public.fidelidade_a_expirar(uuid, uuid, timestamptz);

create function public.saldo_de_pontos(p_cliente uuid)
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(sum(t.points), 0)::int
  from public.loyalty_transactions t
  join public.loyalty_accounts a on a.id = t.loyalty_account_id
  where a.client_id = p_cliente
$function$;

create function public.fidelidade_a_expirar(p_conta uuid, p_ate timestamp with time zone)
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  select greatest(0,
    coalesce(sum(t.points) filter (
      where (t.points > 0 or t.kind = 'ESTORNO_GANHO')
        and t.expires_at is not null and t.expires_at <= p_ate), 0)
    - coalesce(-sum(t.points) filter (where t.points < 0 and t.kind <> 'ESTORNO_GANHO'), 0)
  )::int
  from public.loyalty_transactions t
  where t.loyalty_account_id = p_conta
$function$;

create function public.pontos_expirando(p_cliente uuid, p_ate timestamp with time zone)
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(public.fidelidade_a_expirar(a.id, p_ate), 0)
  from public.loyalty_accounts a
  where a.client_id = p_cliente
$function$;

-- 2. Quem usava a abrangência ----------------------------------------------
create or replace function public.ajustar_pontos(p_tenant uuid, p_cliente uuid, p_unidade uuid, p_pontos integer, p_motivo text, p_ator text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_cfg   public.loyalty_configs%rowtype;
  v_saldo int;
  v_conta uuid;
  v_linha uuid;
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

  if coalesce(p_pontos, 0) = 0 then
    raise exception 'Informe quantos pontos creditar ou debitar.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'O motivo do ajuste é obrigatório.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('fidelidade:' || p_cliente::text));

  if p_pontos < 0 then
    v_saldo := public.saldo_de_pontos(p_cliente);
    if v_saldo < -p_pontos then
      raise exception 'Saldo insuficiente: o cliente tem % pontos.', v_saldo using errcode = 'P0001';
    end if;
  end if;

  v_conta := public.fidelidade_conta(p_cliente);

  insert into public.loyalty_transactions (
    loyalty_account_id, branch_id, kind, points, description, expires_at, created_by
  ) values (
    v_conta, p_unidade, 'AJUSTE', p_pontos, trim(p_motivo),
    case when p_pontos > 0 and v_cfg.expiry_months is not null
         then now() + make_interval(months => v_cfg.expiry_months) end,
    p_ator
  )
  returning id into v_linha;

  return v_linha;
end;
$function$;

create or replace function public.resgatar_recompensa(p_tenant uuid, p_cliente uuid, p_recompensa uuid, p_unidade uuid, p_ator text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  v_saldo := public.saldo_de_pontos(p_cliente);
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
$function$;

create or replace function public.entregar_voucher_produto(p_tenant uuid, p_voucher uuid, p_unidade uuid, p_ator text, p_dados jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_v   public.loyalty_vouchers%rowtype;
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

  -- A7 da 12ª: o brinde sem produto (texto livre) não mexe no estoque.
  if v_v.product_id is null then
    update public.loyalty_vouchers set status = 'USADO', used_at = now() where id = p_voucher;
    return;
  end if;

  perform private.estoque_conferir_lido(v_v.product_id, p_unidade, p_dados);
  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, created_by, unit_cost, reference, notes)
  values (
    p_unidade, v_v.product_id, 'MANUAL_ADJUSTMENT',
    (p_dados ->> 'quantidade')::numeric,
    (p_dados ->> 'saldo_apos')::numeric,
    coalesce(p_ator, 'sistema'),
    (select public.custo_de_consumo(p) from public.products p where p.id = v_v.product_id),
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
$function$;

create or replace function public.expirar_pontos(p_ate timestamp with time zone default now(), p_tenant uuid default null::uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_linha record;
  v_qtd   int;
  v_total int := 0;
begin
  for v_linha in
    select distinct a.id as conta, a.client_id as cliente
      from public.loyalty_transactions t
      join public.loyalty_accounts a on a.id = t.loyalty_account_id
      join public.clients c on c.id = a.client_id
      join public.loyalty_configs cfg on cfg.tenant_id = c.tenant_id
     where cfg.enabled and cfg.expiry_months is not null
       and (p_tenant is null or c.tenant_id = p_tenant)
       and t.expires_at is not null and t.expires_at <= p_ate
  loop
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_linha.cliente::text));
    v_qtd := public.fidelidade_a_expirar(v_linha.conta, p_ate);
    if v_qtd > 0 then
      -- O vencimento é da rede; a unidade do lançamento é a do último movimento.
      insert into public.loyalty_transactions (loyalty_account_id, branch_id, kind, points, description, created_by)
      values (
        v_linha.conta,
        (select t2.branch_id from public.loyalty_transactions t2
          where t2.loyalty_account_id = v_linha.conta
          order by t2.created_at desc limit 1),
        'EXPIRACAO', -v_qtd, 'Pontos vencidos', 'sistema'
      );
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$function$;

create or replace function public.avisos_de_vencimento(p_agora timestamp with time zone default now(), p_tenant uuid default null::uuid)
 returns table(client_id uuid, pontos integer, ate timestamp with time zone, slug text)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_linha    record;
  v_ate      timestamptz;
  v_na_janela int;
  v_ja_avisado int;
begin
  for v_linha in
    select a.id as conta, a.client_id as cliente, a.aviso_vencimento_ate as avisado,
           cfg.expiry_notice_days as dias,
           coalesce(b.slug, (select b2.slug from public.branches b2
                              where b2.tenant_id = c.tenant_id and b2.is_active order by b2.created_at limit 1)) as slug_da_unidade
      from public.loyalty_accounts a
      join public.clients c on c.id = a.client_id
      join public.loyalty_configs cfg on cfg.tenant_id = c.tenant_id
      left join public.branches b on b.id = c.branch_id
     where cfg.enabled and cfg.expiry_months is not null and cfg.expiry_notice_days is not null
       and (p_tenant is null or c.tenant_id = p_tenant)
       and exists (select 1 from public.loyalty_transactions t
                    where t.loyalty_account_id = a.id and t.expires_at is not null
                      and t.expires_at > p_agora
                      and t.expires_at <= p_agora + make_interval(days => cfg.expiry_notice_days))
  loop
    v_ate := p_agora + make_interval(days => v_linha.dias);
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_linha.cliente::text));

    v_na_janela  := public.fidelidade_a_expirar(v_linha.conta, v_ate);
    v_ja_avisado := public.fidelidade_a_expirar(v_linha.conta, coalesce(v_linha.avisado, p_agora));

    if v_na_janela > v_ja_avisado then
      update public.loyalty_accounts a set aviso_vencimento_ate = v_ate
       where a.id = v_linha.conta and a.aviso_vencimento_ate is not distinct from v_linha.avisado;
      if found then
        client_id := v_linha.cliente; pontos := v_na_janela; ate := v_ate; slug := v_linha.slug_da_unidade;
        return next;
      end if;
    end if;
  end loop;
end;
$function$;

create or replace function public.on_transaction_loyalty_earn()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rede   uuid;
  v_cfg    public.loyalty_configs%rowtype;
  v_pontos int;
  v_conta  uuid;
  v_linha  uuid;
  v_saldo  int;
  v_nome   text;
begin
  if not coalesce(new.is_paid, false) then return null; end if;
  if tg_op = 'UPDATE' and old.is_paid then return null; end if;
  if new.type <> 'INCOME' or new.category = 'Estorno' then return null; end if;
  if new.client_id is null or new.amount <= 0 then return null; end if;
  if new.payment_method is not distinct from 'INTERNAL_CREDIT' then return null; end if;

  select b.tenant_id into v_rede from public.branches b where b.id = new.branch_id;
  if v_rede is null then return null; end if;

  select * into v_cfg from public.loyalty_configs c where c.tenant_id = v_rede and c.enabled;
  if not found then return null; end if;
  -- A fidelidade é do PLANO da rede (lib/planos/recursos.ts).
  if not private.rede_tem_recurso(v_rede, 'fidelidade') then return null; end if;

  perform pg_advisory_xact_lock(hashtext('fidelidade:' || new.client_id::text));

  v_pontos := public.fidelidade_pontos_do_pagamento(new, v_cfg);
  if coalesce(v_pontos, 0) <= 0 then return null; end if;

  v_conta := public.fidelidade_conta(new.client_id);

  insert into public.loyalty_transactions (
    loyalty_account_id, branch_id, kind, points, description,
    transaction_id, appointment_id, treatment_plan_id, expires_at, created_by
  ) values (
    v_conta, new.branch_id, 'GANHO', v_pontos, 'Pagamento: ' || new.description,
    new.id, new.appointment_id, new.treatment_plan_id,
    case when v_cfg.expiry_months is null then null
         else coalesce(new.paid_at, now()) + make_interval(months => v_cfg.expiry_months) end,
    'sistema'
  )
  on conflict (transaction_id, kind) where transaction_id is not null do nothing
  returning id into v_linha;

  if v_linha is null then return null; end if;

  v_saldo := public.saldo_de_pontos(new.client_id);
  select c.name into v_nome from public.clients c where c.id = new.client_id;

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
  values (
    v_rede, new.branch_id, 'fidelidade.pontos_ganhos', 'fidelidade', v_linha,
    jsonb_build_object(
      'clienteId', new.client_id, 'clienteNome', v_nome, 'pontos', v_pontos,
      'saldo', v_saldo, 'pagamentoId', new.id, 'valor', new.amount
    ),
    'sistema', 'banco', 'fidelidade.pontos_ganhos:' || new.id,
    coalesce(new.paid_at, now())
  )
  on conflict (tenant_id, chave) where chave is not null do nothing;

  return null;
end;
$function$;

create or replace function private.fidelidade_na_venda(p_tenant uuid, p_cliente uuid, p_unidade uuid, p_tx uuid, p_fidelidade jsonb, p_ator uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_pontos   int     := coalesce((p_fidelidade ->> 'pontos')::int, 0);
  v_desconto numeric := round(coalesce((p_fidelidade ->> 'desconto')::numeric, 0), 2);
  v_vid      uuid    := nullif(p_fidelidade ->> 'voucher_id', '')::uuid;
  v_dv       numeric := round(coalesce((p_fidelidade ->> 'desconto_voucher')::numeric, 0), 2);
  v_cfg      public.loyalty_configs%rowtype;
  v_voucher  public.loyalty_vouchers%rowtype;
  v_tx       public.financial_transactions%rowtype;
  v_base     numeric;
  v_esperado numeric;
  v_saldo    int;
  v_agora    timestamptz := now();
begin
  if v_pontos < 0 or v_desconto < 0 or v_dv < 0 then
    raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
  end if;
  if v_pontos = 0 and v_desconto > 0 then
    raise exception 'Desconto sem pontos.' using errcode = 'P0001';
  end if;
  if v_vid is null and v_dv > 0 then
    raise exception 'Desconto de voucher sem voucher.' using errcode = 'P0001';
  end if;
  select * into v_tx from public.financial_transactions f where f.id = p_tx for update;
  if not found or v_tx.is_paid or v_tx.client_id is distinct from p_cliente then
    raise exception 'Lançamento da venda não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_pontos > 0 or v_vid is not null then
    select * into v_cfg from public.loyalty_configs c where c.tenant_id = p_tenant and c.enabled;
    if not found then
      raise exception 'O programa de fidelidade está desligado nesta rede.' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || p_cliente::text));
  end if;

  v_base := round(v_tx.amount, 2);
  if v_vid is not null then
    select * into v_voucher from public.loyalty_vouchers v where v.id = v_vid for update;
    if not found or v_voucher.tenant_id is distinct from p_tenant or v_voucher.client_id is distinct from p_cliente then
      raise exception 'Voucher não encontrado para este cliente.' using errcode = 'no_data_found';
    end if;
    if v_voucher.status <> 'ATIVO' then
      raise exception 'Este voucher já foi usado ou cancelado.' using errcode = 'P0001';
    end if;
    if v_voucher.expires_at <= v_agora then
      raise exception 'Voucher vencido.' using errcode = 'P0001';
    end if;
    v_esperado := case v_voucher.type
      when 'DESCONTO_VALOR'      then least(v_voucher.discount_value, v_base)
      when 'DESCONTO_PERCENTUAL' then round(v_base * v_voucher.discount_value / 100, 2)
      else null end;
    if v_esperado is null then
      raise exception 'Este voucher não vale nesta venda: o de procedimento se usa no atendimento, e o de produto é entregue.' using errcode = 'P0001';
    end if;
    if v_dv <> v_esperado then
      raise exception 'O desconto não corresponde ao voucher.' using errcode = 'P0001';
    end if;
  end if;

  v_base := v_base - v_dv;
  if v_pontos > 0 then
    if v_pontos < v_cfg.redeem_min_points then
      raise exception 'O mínimo para usar pontos é % pontos.', v_cfg.redeem_min_points using errcode = 'P0001';
    end if;
    if v_desconto <> least(round(v_pontos * v_cfg.redeem_points_value, 2), v_base) then
      raise exception 'O desconto não corresponde aos pontos usados.' using errcode = 'P0001';
    end if;
    if v_desconto > round(v_base * v_cfg.redeem_max_pct / 100, 2) then
      raise exception 'Os pontos pagam no máximo % %% da venda.',
        trim(to_char(v_cfg.redeem_max_pct, 'FM990D##')) using errcode = 'P0001';
    end if;
    v_saldo := public.saldo_de_pontos(p_cliente);
    if v_saldo < v_pontos then
      raise exception 'Saldo de pontos insuficiente: o cliente tem % pontos.', greatest(v_saldo, 0) using errcode = 'P0001';
    end if;
  end if;

  update public.financial_transactions
     set amount           = round(v_tx.amount, 2) - v_dv - v_desconto,
         loyalty_discount = v_dv + v_desconto,
         is_paid          = true,
         paid_at          = v_agora,
         recebido_por     = (select u.id from public.users u where u.id = p_ator),
         updated_at       = v_agora
   where id = p_tx;

  if v_vid is not null then
    update public.loyalty_vouchers
       set status = 'USADO', used_at = v_agora, used_transaction_id = p_tx
     where id = v_vid;
  end if;
  if v_pontos > 0 then
    insert into public.loyalty_transactions (
      loyalty_account_id, branch_id, kind, points, description, transaction_id, created_by
    ) values (
      public.fidelidade_conta(p_cliente), p_unidade, 'RESGATE', -v_pontos,
      'Desconto no pagamento: R$ ' || replace(to_char(v_desconto, 'FM999999990.00'), '.', ','),
      p_tx, coalesce(p_ator::text, 'sistema')
    );
  end if;
end $function$;

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
  v_prof      uuid;
  v_metodo    text    := nullif(trim(coalesce(p_dados ->> 'metodo', '')), '');
  v_pontos    int     := coalesce((p_dados ->> 'pontos')::int, 0);
  v_desconto  numeric := round(coalesce((p_dados ->> 'desconto')::numeric, 0), 2);
  v_final     numeric := round(coalesce((p_dados ->> 'valor_final')::numeric, -1), 2);
  v_vid       uuid    := nullif(p_dados ->> 'voucher_id', '')::uuid;
  v_dv        numeric := round(coalesce((p_dados ->> 'desconto_voucher')::numeric, 0), 2);
  v_dvenda    numeric := round(coalesce((p_dados ->> 'desconto_venda')::numeric, 0), 2);
  v_vezes     int     := coalesce(nullif(p_dados ->> 'cartao_vezes', '')::int, 1);
  v_bandeira  text    := private.bandeira_do_cartao(nullif(trim(coalesce(p_dados ->> 'metodo', '')), ''), p_dados ->> 'cartao_bandeira');
  v_maquina   uuid    := nullif(p_dados ->> 'maquininha_id', '')::uuid;
  v_motivo    text    := left(nullif(trim(coalesce(p_dados ->> 'desconto_motivo', '')), ''), 300);
  v_voucher   public.loyalty_vouchers%rowtype;
  v_esperado  numeric;
  v_base      numeric;
  v_cfg       public.loyalty_configs%rowtype;
  v_saldo     int;
  v_tx        uuid;
  v_pago      boolean;
  v_agora     timestamptz := now();
  v_descricao text;
  v_comanda   uuid;
  v_itens     numeric := 0;
  v_itens_txt text;
  v_itens_js  jsonb;
  v_total     numeric;
  v_rem_at    numeric;
  v_rem_it    numeric;
  v_dv_it     numeric := 0;
  v_dvenda_it numeric := 0;
  v_desc_it   numeric := 0;
  v_pts_it    int     := 0;
  v_venda     uuid;
  v_tx_it     uuid;
  v_vendedor  uuid;
begin
  select a.status::text, a.branch_id, a.client_id, a.price, a.treatment_plan_id, a.procedure_id, a.professional_id, b.tenant_id
    into v_status, v_unidade, v_cliente, v_preco, v_plano, v_proc, v_prof, v_rede
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.id = p_agendamento
  for update of a;

  if not found or v_rede is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status not in ('IN_PROGRESS', 'COMPLETED') then
    raise exception 'O atendimento ainda não começou: a comanda nasce quando ele é iniciado.' using errcode = 'P0001';
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

  select c.id into v_comanda from public.comandas c
   where c.appointment_id = p_agendamento and c.cancelada_em is null;
  if v_comanda is not null then
    select coalesce(sum(round(p.sale_price, 2) * i.quantidade), 0),
           string_agg(i.quantidade || '× ' || p.name, ' + ' order by i.acrescentado_em, i.id),
           jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantidade) order by i.acrescentado_em, i.id)
      into v_itens, v_itens_txt, v_itens_js
      from public.comanda_itens i
      join public.products p on p.id = i.product_id
     where i.comanda_id = v_comanda and i.product_sale_id is null;
    v_itens := coalesce(v_itens, 0);
  end if;
  v_total := round(v_preco, 2) + v_itens;

  if v_pontos < 0 or v_desconto < 0 or v_final < 0 or v_dv < 0 or v_dvenda < 0 then
    raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
  end if;
  if v_vezes < 1 or v_vezes > 12 or (v_vezes > 1 and v_metodo is distinct from 'CREDIT_CARD') then
    raise exception 'Parcelar na maquininha só no cartão de crédito, de 1 a 12 vezes.' using errcode = 'P0001';
  end if;
  if v_final + v_desconto + v_dv + v_dvenda <> v_total then
    raise exception 'O valor recebido mais os descontos não fecham com o total da comanda.' using errcode = 'P0001';
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
  if v_dvenda = 0 then
    v_motivo := null;
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
    v_esperado := case v_voucher.type
      when 'PROCEDIMENTO' then
        case when v_voucher.procedure_id = v_proc then round(v_preco, 2) else null end
      when 'DESCONTO_VALOR'      then least(v_voucher.discount_value, v_total)
      when 'DESCONTO_PERCENTUAL' then round(v_total * v_voucher.discount_value / 100, 2)
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

  if v_dvenda > v_total - v_dv then
    raise exception 'O desconto não pode ser maior que o total da comanda.' using errcode = 'P0001';
  end if;

  v_base := v_total - v_dv - v_dvenda;
  if v_pontos > 0 then
    if v_pontos < v_cfg.redeem_min_points then
      raise exception 'O mínimo para usar pontos é % pontos.', v_cfg.redeem_min_points using errcode = 'P0001';
    end if;
    if v_desconto <> least(round(v_pontos * v_cfg.redeem_points_value, 2), v_base) then
      raise exception 'O desconto não corresponde aos pontos usados.' using errcode = 'P0001';
    end if;
    if v_desconto > round(v_base * v_cfg.redeem_max_pct / 100, 2) then
      raise exception 'Os pontos pagam no máximo % %% da comanda.',
        trim(to_char(v_cfg.redeem_max_pct, 'FM990D##')) using errcode = 'P0001';
    end if;
    v_saldo := public.saldo_de_pontos(v_cliente);
    if v_saldo < v_pontos then
      raise exception 'Saldo de pontos insuficiente: o cliente tem % pontos.', greatest(v_saldo, 0) using errcode = 'P0001';
    end if;
  end if;

  v_rem_at := round(v_preco, 2);
  v_rem_it := v_itens;
  if v_itens > 0 then
    v_dv_it := case when v_vid is not null and v_voucher.type = 'PROCEDIMENTO' then 0
                    else private.parte_dos_itens(v_dv, v_rem_at, v_rem_it) end;
    v_rem_at := v_rem_at - (v_dv - v_dv_it);
    v_rem_it := v_rem_it - v_dv_it;
    v_dvenda_it := private.parte_dos_itens(v_dvenda, v_rem_at, v_rem_it);
    v_rem_at := v_rem_at - (v_dvenda - v_dvenda_it);
    v_rem_it := v_rem_it - v_dvenda_it;
    v_desc_it := private.parte_dos_itens(v_desconto, v_rem_at, v_rem_it);
    v_pts_it := case when v_desconto > 0 then round(v_pontos * v_desc_it / v_desconto)::int else 0 end;
  end if;

  select f.id, f.is_paid into v_tx, v_pago
    from public.financial_transactions f
   where f.appointment_id = p_agendamento
     and coalesce(f.notes, '') <> 'Estornada'
   for update;

  if v_pago then
    raise exception 'Pagamento já registrado para este atendimento.' using errcode = 'P0001';
  end if;

  if v_tx is not null then
    update public.financial_transactions
       set amount           = round(v_preco, 2) - (v_dv - v_dv_it) - (v_dvenda - v_dvenda_it) - (v_desconto - v_desc_it),
           loyalty_discount = (v_desconto - v_desc_it) + (v_dv - v_dv_it),
           sale_discount    = v_dvenda - v_dvenda_it,
           desconto_motivo  = v_motivo,
           payment_method   = v_metodo::public."PaymentMethod",
           cartao_vezes     = case when v_vezes > 1 then v_vezes end,
           cartao_bandeira  = v_bandeira,
           maquininha_id    = v_maquina,
           is_paid          = true,
           recebido_por     = (select u.id from public.users u where u.id = p_ator),
           paid_at          = v_agora,
           updated_at       = v_agora
     where id = v_tx;
  else
    insert into public.financial_transactions (
      branch_id, appointment_id, client_id, type, category, description,
      amount, loyalty_discount, sale_discount, desconto_motivo, payment_method, cartao_vezes, cartao_bandeira, maquininha_id, is_paid, paid_at, created_by
    ) values (
      v_unidade, p_agendamento, v_cliente, 'INCOME', 'Serviços', 'Atendimento concluído',
      round(v_preco, 2) - (v_dv - v_dv_it) - (v_dvenda - v_dvenda_it) - (v_desconto - v_desc_it),
      (v_desconto - v_desc_it) + (v_dv - v_dv_it), v_dvenda - v_dvenda_it, v_motivo, v_metodo::public."PaymentMethod",
      case when v_vezes > 1 then v_vezes end, v_bandeira, v_maquina, true, v_agora,
      coalesce(p_ator::text, 'sistema')
    )
    returning id into v_tx;
  end if;

  if v_itens > 0 then
    select u.id into v_vendedor from public.users u
     where u.id = v_prof and u.tenant_id = p_tenant and coalesce(u.is_active, true);
    perform set_config('bellaris.venda_na_comanda', v_comanda::text, true);
    v_venda := public.produto_vender_itens(
      p_tenant, v_cliente, v_unidade, p_ator, v_vendedor, v_itens_js, v_dvenda_it,
      jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'amount', v_itens - v_dvenda_it,
        'payment_method', v_metodo,
        'is_paid', false,
        'cartao_vezes', case when v_vezes > 1 then v_vezes end,
        'cartao_bandeira', v_bandeira,
        'maquininha_id', v_maquina,
        'desconto_motivo', case when v_dvenda_it > 0 then v_motivo end))));
    perform set_config('bellaris.venda_na_comanda', '', true);

    select f.id into v_tx_it from public.financial_transactions f where f.product_sale_id = v_venda limit 1;
    update public.financial_transactions
       set amount           = v_itens - v_dvenda_it - v_dv_it - v_desc_it,
           loyalty_discount = v_dv_it + v_desc_it,
           sale_discount    = v_dvenda_it,
           is_paid          = true,
           paid_at          = v_agora,
           recebido_por     = (select u.id from public.users u where u.id = p_ator),
           updated_at       = v_agora
     where id = v_tx_it;

    update public.comanda_itens set product_sale_id = v_venda
     where comanda_id = v_comanda and product_sale_id is null;
  end if;

  if v_vid is not null then
    update public.loyalty_vouchers
       set status = 'USADO', used_at = v_agora, used_transaction_id = v_tx
     where id = v_vid;
  end if;

  if v_pontos - v_pts_it > 0 then
    insert into public.loyalty_transactions (
      loyalty_account_id, branch_id, kind, points, description,
      transaction_id, appointment_id, created_by
    ) values (
      public.fidelidade_conta(v_cliente), v_unidade, 'RESGATE', -(v_pontos - v_pts_it),
      'Desconto no pagamento: R$ ' || replace(to_char(v_desconto - v_desc_it, 'FM999999990.00'), '.', ','),
      v_tx, p_agendamento, coalesce(p_ator::text, 'sistema')
    );
  end if;
  if v_pts_it > 0 then
    insert into public.loyalty_transactions (
      loyalty_account_id, branch_id, kind, points, description,
      transaction_id, appointment_id, created_by
    ) values (
      public.fidelidade_conta(v_cliente), v_unidade, 'RESGATE', -v_pts_it,
      'Desconto no pagamento: R$ ' || replace(to_char(v_desc_it, 'FM999999990.00'), '.', ','),
      v_tx_it, p_agendamento, coalesce(p_ator::text, 'sistema')
    );
  end if;

  if p_ator is not null then
    v_descricao := 'Pagamento confirmado'
      || coalesce(' via ' || private.rotulo_do_pagamento(p_tenant, v_metodo, v_vezes, v_bandeira, v_maquina), '');
    if v_itens > 0 then
      v_descricao := v_descricao || ', com ' || v_itens_txt;
    end if;
    if v_dvenda > 0 then
      v_descricao := v_descricao || ', com desconto de R$ ' || replace(to_char(v_dvenda, 'FM999999990.00'), '.', ',')
        || coalesce(' (' || v_motivo || ')', '');
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

create or replace function public.fidelidade_pontos_do_conjunto(p_tenant uuid, p_pacote uuid, p_plano uuid)
 returns table(ganhos integer, saldo integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with dono as (
    select cp.client_id from public.client_packages cp
      join public.clients c on c.id = cp.client_id and c.tenant_id = p_tenant
     where p_pacote is not null and cp.id = p_pacote
    union all
    select tp.client_id from public.treatment_plans tp
      join public.branches b on b.id = tp.branch_id and b.tenant_id = p_tenant
     where p_plano is not null and tp.id = p_plano
  ),
  lancamentos as (
    select t.id from public.financial_transactions t
      join public.branches b on b.id = t.branch_id and b.tenant_id = p_tenant
     where (p_pacote is not null and t.client_package_id = p_pacote)
        or (p_plano is not null and t.treatment_plan_id = p_plano)
  )
  select coalesce((select sum(lt.points)::int from public.loyalty_transactions lt
                    where lt.transaction_id in (select id from lancamentos)
                      and lt.kind in ('GANHO', 'ESTORNO_GANHO')), 0),
         coalesce((select public.saldo_de_pontos(d.client_id) from dono d limit 1), 0)
$function$;

create or replace function public.fidelidade_pontos_do_estorno(p_tenant uuid, p_transacao uuid)
 returns table(ligada boolean, cliente text, ganhos integer, usados integer, saldo integer, indicadora text, premio_pontos integer, premio_voucher text, premio_voucher_status text, premio_passa boolean)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with t as (
    select f.* from public.financial_transactions f
      join public.branches b on b.id = f.branch_id and b.tenant_id = p_tenant
     where f.id = p_transacao and f.type = 'INCOME' and f.client_id is not null
  ),
  pr as (
    select p.* from public.indicacao_premios p
      join t on p.transaction_id = t.id
     where p.estornado_em is null
     limit 1
  )
  select coalesce((select c.enabled from public.loyalty_configs c where c.tenant_id = p_tenant), false),
         (select c.name from public.clients c where c.id = t.client_id),
         coalesce((select sum(l.points)::int from public.loyalty_transactions l where l.transaction_id = t.id and l.kind = 'GANHO'), 0),
         coalesce((select sum(abs(l.points))::int from public.loyalty_transactions l where l.transaction_id = t.id and l.kind = 'RESGATE'), 0),
         coalesce(public.saldo_de_pontos(t.client_id), 0),
         (select c.name from public.clients c join pr on c.id = pr.indicadora_id),
         coalesce((select l.points from public.loyalty_transactions l join pr on l.id = pr.loyalty_transaction_id), 0),
         (select v.name from public.loyalty_vouchers v join pr on v.id = pr.voucher_id),
         (select v.status from public.loyalty_vouchers v join pr on v.id = pr.voucher_id),
         exists (
           select 1 from pr, public.financial_transactions f
            where f.client_id = t.client_id and f.id <> t.id
              and private.indicacao_pagamento_que_vale(f)
         )
    from t
$function$;

-- 3. Os grants (os de antes: só o service_role; o private, só o dono) -------
revoke all on function public.saldo_de_pontos(uuid) from public, anon, authenticated;
revoke all on function public.fidelidade_a_expirar(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.pontos_expirando(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.saldo_de_pontos(uuid) to service_role;
grant execute on function public.fidelidade_a_expirar(uuid, timestamptz) to service_role;
grant execute on function public.pontos_expirando(uuid, timestamptz) to service_role;

revoke all on function public.ajustar_pontos(uuid, uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.resgatar_recompensa(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.entregar_voucher_produto(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.expirar_pontos(timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.avisos_de_vencimento(timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.on_transaction_loyalty_earn() from public, anon, authenticated;
revoke all on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fidelidade_pontos_do_conjunto(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.fidelidade_pontos_do_estorno(uuid, uuid) from public, anon, authenticated;
revoke all on function private.fidelidade_na_venda(uuid, uuid, uuid, uuid, jsonb, uuid) from public, anon, authenticated, service_role;

-- 4. A coluna da abrangência ------------------------------------------------
alter table public.loyalty_configs drop column if exists scope_per_branch;

notify pgrst, 'reload schema';
