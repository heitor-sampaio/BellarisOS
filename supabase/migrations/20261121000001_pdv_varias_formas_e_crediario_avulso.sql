-- As duas decisões do Heitor de 2026-11-16 (a revisão da 18ª simulação):
--
-- 1. "A comanda recebe em mais de uma forma?" → "Ok" (D1 da 18ª): o "+ Outra
--    forma" no à vista — parte no Pix, parte no crédito 3x Visa —, com o valor
--    de cada uma, na comanda do atendimento, da venda e do plano. Cada forma é
--    um lançamento pago (o app calcula, a função grava numa transação).
-- 2. "Crediário no atendimento avulso" → "Mesma regra de pagamentos dos
--    outros": a comanda do atendimento oferece as formas da venda — o à vista
--    (dividido ou não), o crediário com entrada e parcelas e o a receber.
--
-- O que muda aqui:
--   * private.fidelidade_na_venda ganha a base da venda (p_base): com a venda
--     dividida, o voucher e o teto dos pontos são sobre o total, e o desconto
--     abate o PRIMEIRO lançamento (o de 6 argumentos segue, sem base);
--   * venda_com_fidelidade e plano_checkout_com_fidelidade aceitam várias
--     formas à vista (eram "um lançamento só");
--   * confirmar_pagamento_do_atendimento grava os lançamentos que vêm em
--     `p_dados -> 'lancamentos'` (sem eles, o pagamento de uma forma de antes),
--     cobra só o que falta do atendimento (`v_ja`: a comanda reaberta pelo
--     estorno de UMA das formas cobra a parte estornada) e reparte o recebido
--     entre o atendimento e os produtos da comanda, na ordem;
--   * o atendimento coberto por lançamentos vivos (pagos, ou a receber do
--     crediário e do "a receber") está fechado: pdv_comandas, atendimentos_a_receber,
--     metrics_financeiro_do_cliente, a comanda que se cancela sozinha;
--   * a comissão do avulso (H4) olha todos os lançamentos vivos do atendimento —
--     o crediário espera a última parcela —, e a base do pagamento soma as formas
--     daquele pagamento;
--   * os pontos do atendimento pago em mais de um lançamento se ganham uma vez;
--   * metrics_vendas soma o desconto das formas (não fica com uma delas).
--
-- O lançamento a receber SEM forma que o "Concluir" antigo deixava (sem notas,
-- `completeAppointment`) não é cobertura: é a conta do atendimento esperando o
-- pagamento, e o primeiro lançamento do recebimento é ele (como antes).

-- ---------------------------------------------------------------------------
-- A fidelidade na venda: a base é a venda inteira; o desconto abate o primeiro.
-- ---------------------------------------------------------------------------
create or replace function private.fidelidade_na_venda(p_tenant uuid, p_cliente uuid, p_unidade uuid, p_tx uuid, p_fidelidade jsonb, p_ator uuid, p_base numeric)
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

  -- A venda dividida em formas (D1 da 18ª): o voucher e o teto dos pontos são
  -- sobre a venda inteira; sem a base, a venda é o lançamento (uma forma só).
  v_base := coalesce(round(p_base, 2), round(v_tx.amount, 2));
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

  if v_dv + v_desconto > round(v_tx.amount, 2) then
    raise exception 'Os pontos e o voucher passam do valor da primeira forma: ponha nela ao menos o desconto.' using errcode = 'P0001';
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

revoke all on function private.fidelidade_na_venda(uuid, uuid, uuid, uuid, jsonb, uuid, numeric) from public, anon, authenticated, service_role;

-- O de seis argumentos (a venda de uma forma só) é o de sete sem a base.
create or replace function private.fidelidade_na_venda(p_tenant uuid, p_cliente uuid, p_unidade uuid, p_tx uuid, p_fidelidade jsonb, p_ator uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform private.fidelidade_na_venda(p_tenant, p_cliente, p_unidade, p_tx, p_fidelidade, p_ator, null::numeric);
end $function$;

revoke all on function private.fidelidade_na_venda(uuid, uuid, uuid, uuid, jsonb, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A venda e o plano com pontos ou voucher: uma ou mais formas, todas à vista.
-- O primeiro lançamento entra a receber e a fidelidade o abate e o dá por pago.
-- ---------------------------------------------------------------------------
create or replace function public.venda_com_fidelidade(
  p_tenant uuid, p_tipo text, p_args jsonb, p_fidelidade jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_l        jsonb := p_args -> 'p_lancamentos';
  v_cliente  uuid  := (p_args ->> 'p_cliente')::uuid;
  v_unidade  uuid  := (p_args ->> 'p_unidade')::uuid;
  v_ator     uuid  := nullif(p_args ->> 'p_ator', '')::uuid;
  v_vendedor uuid  := nullif(p_args ->> 'p_vendedor', '')::uuid;
  v_desc     numeric := coalesce((p_args ->> 'p_desconto')::numeric, 0);
  v_base     numeric;
  v_id       uuid;
  v_tx       uuid;
begin
  if jsonb_typeof(v_l) is distinct from 'array' or jsonb_array_length(v_l) < 1
     or exists (select 1 from jsonb_array_elements(v_l) x where not coalesce((x ->> 'is_paid')::boolean, false)) then
    raise exception 'Os pontos e o voucher se usam no pagamento à vista.' using errcode = 'P0001';
  end if;
  select sum(round((x ->> 'amount')::numeric, 2)) into v_base from jsonb_array_elements(v_l) x;
  v_l := jsonb_set(v_l, '{0,is_paid}', 'false'::jsonb);

  case p_tipo
    when 'PRODUTO' then
      v_id := public.produto_vender_itens(p_tenant, v_cliente, v_unidade, v_ator, v_vendedor,
                p_args -> 'p_itens', v_desc, v_l);
      select f.id into v_tx from public.financial_transactions f where f.product_sale_id = v_id and not f.is_paid limit 1;
    when 'PACOTE' then
      v_id := public.pacote_vender_com_equipe(p_tenant, v_cliente, (p_args ->> 'p_pacote')::uuid, v_unidade, v_ator,
                v_vendedor, nullif(p_args ->> 'p_responsavel', '')::uuid, v_l, p_args -> 'p_sessoes', v_desc);
      select f.id into v_tx from public.financial_transactions f where f.client_package_id = v_id and not f.is_paid limit 1;
    when 'PROCEDIMENTO' then
      v_id := public.procedimento_vender_com_equipe(p_tenant, v_cliente, (p_args ->> 'p_procedimento')::uuid, v_unidade, v_ator,
                v_vendedor, (p_args ->> 'p_quantidade')::int, v_desc, nullif(p_args ->> 'p_validade_dias', '')::int,
                v_l, p_args -> 'p_unidades');
      select f.id into v_tx from public.financial_transactions f where f.procedure_sale_id = v_id and not f.is_paid limit 1;
    else
      raise exception 'Venda inválida.' using errcode = 'P0001';
  end case;

  perform private.fidelidade_na_venda(p_tenant, v_cliente, v_unidade, v_tx, p_fidelidade, v_ator, v_base);
  return v_id;
end $$;

revoke execute on function public.venda_com_fidelidade(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.venda_com_fidelidade(uuid, text, jsonb, jsonb) to service_role;

create or replace function public.plano_checkout_com_fidelidade(
  p_tenant uuid, p_plano uuid, p_ator uuid, p_desconto numeric, p_precos jsonb, p_lancamentos jsonb,
  p_agendamentos jsonb, p_com_comissao boolean, p_vendedor uuid, p_fidelidade jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_l     jsonb := p_lancamentos;
  v_r     jsonb;
  v_base  numeric;
  v_tx    uuid;
  v_plano record;
begin
  if jsonb_typeof(v_l) is distinct from 'array' or jsonb_array_length(v_l) < 1
     or exists (select 1 from jsonb_array_elements(v_l) x where not coalesce((x ->> 'is_paid')::boolean, false)) then
    raise exception 'Os pontos e o voucher se usam no pagamento à vista.' using errcode = 'P0001';
  end if;
  select sum(round((x ->> 'amount')::numeric, 2)) into v_base from jsonb_array_elements(v_l) x;
  v_l := jsonb_set(v_l, '{0,is_paid}', 'false'::jsonb);

  v_r := public.plano_checkout(p_tenant, p_plano, p_ator, p_desconto, p_precos, v_l,
                               p_agendamentos, p_com_comissao, p_vendedor);

  -- O lançamento que a fidelidade abate: o único a receber que este checkout gravou.
  select f.id into v_tx from public.financial_transactions f
   where f.treatment_plan_id = p_plano and f.type::text = 'INCOME' and not f.is_paid
     and f.estorno_de is null and f.created_at = now()
   limit 1;
  select tp.client_id, tp.branch_id into v_plano from public.treatment_plans tp where tp.id = p_plano;
  perform private.fidelidade_na_venda(p_tenant, v_plano.client_id, v_plano.branch_id,
                                      coalesce(v_tx, (v_r ->> 'transacao')::uuid), p_fidelidade, p_ator, v_base);
  return v_r;
end $function$;
revoke execute on function public.plano_checkout_com_fidelidade(uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, boolean, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plano_checkout_com_fidelidade(uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, boolean, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- O recebimento da comanda do atendimento: as formas da venda.
-- ---------------------------------------------------------------------------
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
  v_maquina   uuid    := nullif(p_dados ->> 'maquininha_id', '')::uuid;
  v_motivo    text    := left(nullif(trim(coalesce(p_dados ->> 'desconto_motivo', '')), ''), 300);
  v_voucher   public.loyalty_vouchers%rowtype;
  v_esperado  numeric;
  v_base      numeric;
  v_cfg       public.loyalty_configs%rowtype;
  v_saldo     int;
  v_tx        uuid;
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
  -- As formas (2026-11-16): o que já cobre o atendimento, o que falta, e os lançamentos.
  v_ja        numeric := 0;
  v_falta     numeric;
  v_l         jsonb;
  v_x         jsonb;
  v_l_at      jsonb := '[]'::jsonb;
  v_l_it      jsonb := '[]'::jsonb;
  v_amt       numeric;
  v_parte     numeric;
  v_soma      numeric := 0;
  v_resto_at  numeric;
  v_tudo_pago boolean;
  v_pago_x    boolean;
  v_vezes_x   int;
  v_metodo_x  text;
  v_primeira  boolean := true;
  v_reserva   uuid;
  v_id        uuid;
  v_loy_it    numeric;
  v_forcou    boolean := false;
  v_pagos     text;
  v_n_pagos   int := 0;
  v_abertos   numeric := 0;
  v_parcelas  int := 0;
  v_ator      uuid;
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
  v_ator := (select u.id from public.users u where u.id = p_ator);

  -- O que já cobre o atendimento: os lançamentos vivos dele, pagos ou a receber
  -- do crediário e do "a receber" (o desconto e a fidelidade de cada um também
  -- cobrem). A comanda reaberta pelo estorno de UMA das formas cobra só a parte
  -- estornada. O a receber sem forma do "Concluir" antigo (sem notas) não cobre.
  select coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0) + coalesce(f.sale_discount, 0)), 0)
    into v_ja
    from public.financial_transactions f
   where f.appointment_id = p_agendamento and f.type::text = 'INCOME' and f.estorno_de is null
     and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno'
     and (f.is_paid or f.notes is not null);
  v_falta := round(v_preco, 2) - round(v_ja, 2);
  if v_falta <= 0 then
    raise exception 'Pagamento já registrado para este atendimento.' using errcode = 'P0001';
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
  v_total := v_falta + v_itens;

  if v_pontos < 0 or v_desconto < 0 or v_final < 0 or v_dv < 0 or v_dvenda < 0 then
    raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
  end if;
  if v_final + v_desconto + v_dv + v_dvenda <> v_total then
    raise exception 'O valor recebido mais os descontos não fecham com o total da comanda.' using errcode = 'P0001';
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

  -- Os lançamentos do recebimento (lancamentosDoPagamento, no app): o à vista
  -- numa forma ou em várias, a entrada e as parcelas do crediário, o a receber.
  -- Sem eles, o pagamento de uma forma só, como antes.
  v_l := p_dados -> 'lancamentos';
  if v_l is null or jsonb_typeof(v_l) <> 'array' or jsonb_array_length(v_l) = 0 then
    if v_vezes < 1 or v_vezes > 12 or (v_vezes > 1 and v_metodo is distinct from 'CREDIT_CARD') then
      raise exception 'Parcelar na maquininha só no cartão de crédito, de 1 a 12 vezes.' using errcode = 'P0001';
    end if;
    if v_final > 0 and v_metodo is null then
      raise exception 'Selecione a forma de pagamento.' using errcode = 'P0001';
    end if;
    v_l := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
             'amount', v_final, 'payment_method', v_metodo, 'is_paid', true,
             'cartao_vezes', case when v_vezes > 1 then v_vezes end,
             'cartao_bandeira', p_dados ->> 'cartao_bandeira', 'maquininha_id', v_maquina)));
  end if;
  if jsonb_array_length(v_l) > 30 then
    raise exception 'Formas demais neste pagamento.' using errcode = 'P0001';
  end if;
  for v_x in select x from jsonb_array_elements(v_l) with ordinality t(x, n) order by n loop
    v_amt      := round(coalesce((v_x ->> 'amount')::numeric, -1), 2);
    v_pago_x   := coalesce((v_x ->> 'is_paid')::boolean, false);
    v_metodo_x := nullif(trim(coalesce(v_x ->> 'payment_method', '')), '');
    v_vezes_x  := coalesce(nullif(v_x ->> 'cartao_vezes', '')::int, 1);
    if v_amt < 0 or (not v_pago_x and v_amt = 0) then
      raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
    end if;
    if v_pago_x and v_amt > 0 and v_metodo_x is null then
      raise exception 'Selecione a forma de pagamento.' using errcode = 'P0001';
    end if;
    if v_vezes_x < 1 or v_vezes_x > 12 or (v_vezes_x > 1 and v_metodo_x is distinct from 'CREDIT_CARD') then
      raise exception 'Parcelar na maquininha só no cartão de crédito, de 1 a 12 vezes.' using errcode = 'P0001';
    end if;
    v_soma := v_soma + v_amt;
  end loop;
  if v_soma <> v_final then
    raise exception 'As formas não fecham com o valor a receber da comanda. Recarregue a tela.' using errcode = 'P0001';
  end if;
  v_tudo_pago := not exists (select 1 from jsonb_array_elements(v_l) x where not coalesce((x ->> 'is_paid')::boolean, false));
  if (v_pontos > 0 or v_vid is not null) and not v_tudo_pago then
    raise exception 'Os pontos e o voucher se usam no pagamento à vista.' using errcode = 'P0001';
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
    -- O de procedimento paga o que falta do atendimento (o atendimento inteiro, sem estorno antes).
    v_esperado := case v_voucher.type
      when 'PROCEDIMENTO' then
        case when v_voucher.procedure_id = v_proc then v_falta else null end
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

  v_rem_at := v_falta;
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

  -- O recebido se reparte na ordem dos lançamentos: primeiro o atendimento (o
  -- que falta dele, menos a parte dele nos descontos), depois os produtos. A
  -- forma que passa da divisa vira dois lançamentos, com os mesmos dados.
  v_resto_at := v_falta - (v_dv - v_dv_it) - (v_dvenda - v_dvenda_it) - (v_desconto - v_desc_it);
  for v_x in select x from jsonb_array_elements(v_l) with ordinality t(x, n) order by n loop
    v_amt   := round((v_x ->> 'amount')::numeric, 2);
    v_parte := least(v_amt, greatest(v_resto_at, 0));
    if v_parte > 0 then
      v_l_at := v_l_at || jsonb_build_array(jsonb_set(v_x, '{amount}', to_jsonb(v_parte)));
      v_resto_at := v_resto_at - v_parte;
    end if;
    if v_amt - v_parte > 0 then
      v_l_it := v_l_it || jsonb_build_array(jsonb_set(v_x, '{amount}', to_jsonb(v_amt - v_parte)));
    end if;
  end loop;
  -- O atendimento todo em descontos (o voucher do procedimento): um lançamento
  -- de zero, pago, leva os descontos dele — como antes.
  if jsonb_array_length(v_l_at) = 0 then
    v_l_at := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('amount', 0, 'is_paid', true,
                'payment_method', case when coalesce((v_l -> 0 ->> 'is_paid')::boolean, false) then v_l -> 0 ->> 'payment_method' end)));
  end if;

  -- O lançamento a receber sem forma do "Concluir" antigo vira o primeiro.
  select f.id into v_reserva from public.financial_transactions f
   where f.appointment_id = p_agendamento and f.type::text = 'INCOME' and f.estorno_de is null
     and not f.is_paid and f.notes is null and coalesce(f.category, '') <> 'Estorno'
   order by f.created_at, f.id
   limit 1
   for update;

  for v_x in select x from jsonb_array_elements(v_l_at) with ordinality t(x, n) order by n loop
    v_pago_x   := coalesce((v_x ->> 'is_paid')::boolean, false);
    v_metodo_x := case when v_pago_x then nullif(trim(coalesce(v_x ->> 'payment_method', '')), '') end;
    v_vezes_x  := coalesce(nullif(v_x ->> 'cartao_vezes', '')::int, 1);
    if v_primeira and v_reserva is not null then
      update public.financial_transactions
         set description      = 'Atendimento concluído' || coalesce(' — ' || nullif(v_x ->> 'sufixo', ''), ''),
             amount           = round((v_x ->> 'amount')::numeric, 2),
             loyalty_discount = (v_desconto - v_desc_it) + (v_dv - v_dv_it),
             sale_discount    = v_dvenda - v_dvenda_it,
             desconto_motivo  = v_motivo,
             payment_method   = v_metodo_x::public."PaymentMethod",
             cartao_vezes     = case when v_pago_x and v_vezes_x > 1 then v_vezes_x end,
             cartao_bandeira  = case when v_pago_x then private.bandeira_do_cartao(v_metodo_x, v_x ->> 'cartao_bandeira') end,
             maquininha_id    = case when v_pago_x then nullif(v_x ->> 'maquininha_id', '')::uuid end,
             is_paid          = v_pago_x,
             paid_at          = case when v_pago_x then v_agora end,
             recebido_por     = case when v_pago_x then v_ator end,
             due_date         = nullif(v_x ->> 'due_date', '')::timestamptz,
             notes            = case when v_pago_x then nullif(v_x ->> 'notes', '')
                                     else coalesce(nullif(v_x ->> 'notes', ''), 'Atendimento — a receber') end,
             parcela_numero   = nullif(v_x ->> 'parcela_numero', '')::int,
             parcela_total    = nullif(v_x ->> 'parcela_total', '')::int,
             parcela_grupo    = nullif(v_x ->> 'parcela_grupo', '')::uuid,
             -- O pagamento de agora: as formas dele nascem juntas (a base da comissão as junta assim).
             created_at       = v_agora,
             updated_at       = v_agora
       where id = v_reserva;
      v_id := v_reserva;
    else
      insert into public.financial_transactions (
        branch_id, appointment_id, client_id, type, category, description,
        amount, loyalty_discount, sale_discount, desconto_motivo, payment_method, cartao_vezes, cartao_bandeira, maquininha_id,
        is_paid, paid_at, recebido_por, due_date, notes, parcela_numero, parcela_total, parcela_grupo, created_by
      ) values (
        v_unidade, p_agendamento, v_cliente, 'INCOME', 'Serviços',
        'Atendimento concluído' || coalesce(' — ' || nullif(v_x ->> 'sufixo', ''), ''),
        round((v_x ->> 'amount')::numeric, 2),
        case when v_primeira then (v_desconto - v_desc_it) + (v_dv - v_dv_it) else 0 end,
        case when v_primeira then v_dvenda - v_dvenda_it else 0 end,
        case when v_primeira then v_motivo end,
        v_metodo_x::public."PaymentMethod",
        case when v_pago_x and v_vezes_x > 1 then v_vezes_x end,
        case when v_pago_x then private.bandeira_do_cartao(v_metodo_x, v_x ->> 'cartao_bandeira') end,
        case when v_pago_x then nullif(v_x ->> 'maquininha_id', '')::uuid end,
        v_pago_x, case when v_pago_x then v_agora end, case when v_pago_x then v_ator end,
        nullif(v_x ->> 'due_date', '')::timestamptz,
        case when v_pago_x then nullif(v_x ->> 'notes', '')
             else coalesce(nullif(v_x ->> 'notes', ''), 'Atendimento — a receber') end,
        nullif(v_x ->> 'parcela_numero', '')::int,
        nullif(v_x ->> 'parcela_total', '')::int,
        nullif(v_x ->> 'parcela_grupo', '')::uuid,
        coalesce(p_ator::text, 'sistema')
      )
      returning id into v_id;
    end if;
    if v_primeira then
      v_tx := v_id;
    end if;
    v_primeira := false;
  end loop;

  if v_itens > 0 then
    if jsonb_array_length(v_l_it) = 0 then
      v_l_it := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('amount', 0, 'is_paid', true,
                  'payment_method', case when coalesce((v_l -> 0 ->> 'is_paid')::boolean, false) then v_l -> 0 ->> 'payment_method' end)));
    end if;
    -- A fidelidade dos produtos abate o primeiro lançamento deles: entra a
    -- receber com ela, e sai pago sem ela (os pontos e o voucher são do à vista).
    v_loy_it := v_dv_it + v_desc_it;
    if v_loy_it > 0 then
      v_l_it := jsonb_set(v_l_it, '{0,amount}', to_jsonb(round((v_l_it -> 0 ->> 'amount')::numeric + v_loy_it, 2)));
      v_l_it := jsonb_set(v_l_it, '{0,is_paid}', 'false'::jsonb);
      v_forcou := true;
    end if;
    if v_dvenda_it > 0 and v_motivo is not null then
      v_l_it := jsonb_set(v_l_it, '{0,desconto_motivo}', to_jsonb(v_motivo));
    end if;

    select u.id into v_vendedor from public.users u
     where u.id = v_prof and u.tenant_id = p_tenant and coalesce(u.is_active, true);
    perform set_config('bellaris.venda_na_comanda', v_comanda::text, true);
    v_venda := public.produto_vender_itens(
      p_tenant, v_cliente, v_unidade, p_ator, v_vendedor, v_itens_js, v_dvenda_it, v_l_it);
    perform set_config('bellaris.venda_na_comanda', '', true);

    select f.id into v_tx_it from public.financial_transactions f
     where f.product_sale_id = v_venda
     order by (f.desconto_motivo is not null) desc, (not f.is_paid and f.parcela_grupo is null) desc,
              f.parcela_numero nulls first, f.amount desc
     limit 1;
    if v_forcou then
      update public.financial_transactions
         set amount           = amount - v_loy_it,
             loyalty_discount = v_loy_it,
             sale_discount    = v_dvenda_it,
             is_paid          = true,
             paid_at          = v_agora,
             recebido_por     = v_ator,
             updated_at       = v_agora
       where id = v_tx_it;
    elsif v_dvenda_it > 0 then
      update public.financial_transactions
         set sale_discount = v_dvenda_it, updated_at = v_agora
       where id = v_tx_it;
    end if;

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
    -- As formas do que entrou agora; com mais de uma, o valor de cada.
    select count(*) filter (where coalesce((x ->> 'is_paid')::boolean, false)),
           coalesce(sum((x ->> 'amount')::numeric) filter (where not coalesce((x ->> 'is_paid')::boolean, false)), 0),
           count(*) filter (where not coalesce((x ->> 'is_paid')::boolean, false) and nullif(x ->> 'parcela_grupo', '') is not null)
      into v_n_pagos, v_abertos, v_parcelas
      from jsonb_array_elements(v_l) x;
    select string_agg(
             private.rotulo_do_pagamento(p_tenant, nullif(x ->> 'payment_method', ''), coalesce(nullif(x ->> 'cartao_vezes', '')::int, 1),
               private.bandeira_do_cartao(nullif(x ->> 'payment_method', ''), x ->> 'cartao_bandeira'), nullif(x ->> 'maquininha_id', '')::uuid)
             || case when v_n_pagos > 1
                     then ' R$ ' || replace(to_char(round((x ->> 'amount')::numeric, 2), 'FM999999990.00'), '.', ',') else '' end,
             ' + ' order by n)
      into v_pagos
      from jsonb_array_elements(v_l) with ordinality t(x, n)
     where coalesce((x ->> 'is_paid')::boolean, false) and nullif(x ->> 'payment_method', '') is not null;
    v_descricao := case when v_pagos is not null then 'Pagamento confirmado via ' || v_pagos
                        when v_abertos > 0 then 'Comanda fechada'
                        else 'Pagamento confirmado' end;
    if v_abertos > 0 then
      v_descricao := v_descricao || case when v_pagos is not null then ', e ' else ': ' end
        || 'R$ ' || replace(to_char(v_abertos, 'FM999999990.00'), '.', ',')
        || case when v_parcelas > 0
                then ' no crediário em ' || v_parcelas || case when v_parcelas = 1 then ' parcela' else ' parcelas' end
                else ' a receber' end;
    end if;
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

-- ---------------------------------------------------------------------------
-- O atendimento a receber: o que FALTA dele (o coberto pelos lançamentos vivos
-- sai). A coluna `price` passa a dizer o que falta — o que a tela cobra.
-- ---------------------------------------------------------------------------
create or replace function public.atendimentos_a_receber(p_tenant uuid, p_unidade uuid default null::uuid, p_cliente uuid default null::uuid, p_agendamento uuid default null::uuid, p_profissional uuid default null::uuid)
 returns table(appointment_id uuid, branch_id uuid, branch_slug text, client_id uuid, client_name text, procedure_id uuid, procedure_name text, professional_name text, price numeric, scheduled_at timestamp with time zone, completed_at timestamp with time zone, total_n bigint, total_valor numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select a.id, a.branch_id, b.slug, a.client_id, c.name, a.procedure_id, p.name, u.name,
         round(a.price, 2) - cob.valor, a.scheduled_at, a.completed_at,
         count(*) over (), round(sum(round(a.price, 2) - cob.valor) over (), 2)
    from public.appointments a
    join public.branches b on b.id = a.branch_id
    left join public.clients c    on c.id = a.client_id
    left join public.procedures p on p.id = a.procedure_id
    left join public.users u      on u.id = a.professional_id
    cross join lateral (
      -- 2026-11-16: os lançamentos vivos do atendimento (pagos, ou a receber do
      -- crediário e do "a receber") cobrem; o a receber sem forma do "Concluir" antigo, não.
      select round(coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0) + coalesce(f.sale_discount, 0)), 0), 2) as valor
        from public.financial_transactions f
       where f.appointment_id = a.id and f.type = 'INCOME' and f.estorno_de is null
         and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno'
         and (f.is_paid or f.notes is not null)
    ) cob
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
     and round(a.price, 2) - cob.valor > 0
   order by a.completed_at, a.id
$function$;

-- O a receber da cliente: os lançamentos a receber (as parcelas do avulso
-- também) mais o que falta dos atendimentos — menos os que ainda têm o a
-- receber sem forma do "Concluir" antigo, que já está na primeira soma.
create or replace function public.metrics_financeiro_do_cliente(p_tenant uuid, p_client uuid, p_profissional uuid default null::uuid)
 returns table(pago numeric, a_receber numeric, credito numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select
    coalesce((
      select round(sum(t.amount), 2)
        from public.metrics_receitas_pagas(p_tenant, null, '2000-01-01'::timestamptz, 'infinity'::timestamptz) t
       where t.client_id = p_client
         and (p_profissional is null or exists (
               select 1 from public.appointments a
                where a.id = t.appointment_id and a.professional_id = p_profissional))
    ), 0),
    coalesce((
      select round(sum(t.amount), 2)
        from public.financial_transactions t
        join public.branches b on b.id = t.branch_id
       where b.tenant_id = p_tenant and t.client_id = p_client
         and t.type = 'INCOME' and not t.is_paid
         and coalesce(t.notes, '')    <> 'Estornada'
         and coalesce(t.category, '') <> 'Estorno'
         and (p_profissional is null or exists (
               select 1 from public.appointments a
                where a.id = t.appointment_id and a.professional_id = p_profissional))
    ), 0)
    + coalesce((
      select round(sum(r.price), 2)
        from public.atendimentos_a_receber(p_tenant, null, p_client, null, p_profissional) r
       where not exists (select 1 from public.financial_transactions f
                          where f.appointment_id = r.appointment_id and f.type = 'INCOME'
                            and not f.is_paid and f.notes is null and f.estorno_de is null)
    ), 0),
    case when p_profissional is null then coalesce((
      select round(sum(c.amount), 2) from public.internal_credits c where c.client_id = p_client
    ), 0) end
$function$;

-- ---------------------------------------------------------------------------
-- A comanda do atendimento se cancela sozinha só sem lançamento vivo dele
-- (pago, ou a receber do crediário e do "a receber").
-- ---------------------------------------------------------------------------
create or replace function private.comanda_do_atendimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rede uuid;
begin
  if new.status::text in ('IN_PROGRESS', 'COMPLETED')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.client_id is not null
       and coalesce(new.price, 0) > 0
       and new.treatment_plan_id is null
       and not exists (select 1 from public.package_sessions ps where ps.appointment_id = new.id)
       and not exists (select 1 from public.procedure_sale_units u where u.appointment_id = new.id and u.status <> 'CANCELADA') then
      select b.tenant_id into v_rede from public.branches b where b.id = new.branch_id;
      insert into public.comandas (tenant_id, branch_id, client_id, numero, origem, appointment_id)
      values (v_rede, new.branch_id, new.client_id, 0, 'ATENDIMENTO', new.id)
      on conflict (appointment_id) do nothing;
    end if;
  elsif tg_op = 'UPDATE' and new.status::text in ('CANCELLED', 'NO_SHOW')
        and old.status is distinct from new.status then
    -- A paga fica: o dinheiro que entrou se desfaz pelo estorno.
    update public.comandas c
       set cancelada_em = now(),
           cancelada_motivo = case when new.status::text = 'NO_SHOW' then 'A cliente não compareceu' else 'Atendimento cancelado' end
     where c.appointment_id = new.id
       and c.cancelada_em is null
       and not exists (
         select 1 from public.financial_transactions f
          where f.appointment_id = new.id and f.type::text = 'INCOME' and f.estorno_de is null
            and (f.is_paid or f.notes is not null) and coalesce(f.notes, '') <> 'Estornada');
  end if;
  return null;
end;
$$;

create or replace function private.comanda_sem_cobranca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.appointment_id is not null
     and (tg_op = 'INSERT' or old.appointment_id is distinct from new.appointment_id)
     and (tg_table_name <> 'procedure_sale_units' or coalesce(to_jsonb(new) ->> 'status', '') <> 'CANCELADA') then
    update public.comandas c
       set cancelada_em = now(),
           cancelada_motivo = case tg_table_name when 'package_sessions' then 'Sessão do pacote' else 'Procedimento pré-pago' end
     where c.appointment_id = new.appointment_id
       and c.cancelada_em is null
       and not exists (
         select 1 from public.financial_transactions f
          where f.appointment_id = new.appointment_id and f.type::text = 'INCOME' and f.estorno_de is null
            and (f.is_paid or f.notes is not null) and coalesce(f.notes, '') <> 'Estornada');
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- A base da comissão de um pagamento do avulso (D5 da 18ª): as formas daquele
-- pagamento — os lançamentos do atendimento que nasceram juntos com ele.
-- ---------------------------------------------------------------------------
create or replace function private.comissao_base_do_pagamento(
  p_linha uuid, p_transacao uuid,
  out base numeric, out base_desconto numeric, out base_taxa numeric, out base_insumos numeric)
 returns record
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  v_l        public.commission_lines%rowtype;
  v_f        public.financial_transactions%rowtype;
  v_desconto numeric := 0;
  v_dvenda   numeric := 0;
  v_taxa     numeric := 0;
  v_fid      numeric := 0;
  v_base     numeric;
begin
  base := null; base_desconto := 0; base_taxa := 0; base_insumos := 0;
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.origem <> 'AVULSO' or v_l.appointment_id is null or p_transacao is null then
    return;
  end if;
  select * into v_f from public.financial_transactions f
   where f.id = p_transacao and f.appointment_id = v_l.appointment_id and f.type = 'INCOME';
  if not found then
    return;
  end if;

  -- As formas do mesmo pagamento (2026-11-16): nascem na mesma transação.
  select coalesce(sum(f.loyalty_discount), 0), coalesce(sum(f.sale_discount), 0),
         case when coalesce(sum(f.amount) filter (where f.amount > 0), 0) > 0 then
           sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                 coalesce(f.cartao_vezes, f.parcela_total, 1), f.cartao_bandeira, f.maquininha_id)) filter (where f.amount > 0)
           / sum(f.amount) filter (where f.amount > 0)
         else private.comissao_taxa_pct(v_l.tenant_id, v_f.payment_method::text,
                coalesce(v_f.cartao_vezes, v_f.parcela_total, 1), v_f.cartao_bandeira, v_f.maquininha_id) end
    into v_fid, v_dvenda, v_taxa
    from public.financial_transactions f
   where f.appointment_id = v_l.appointment_id and f.type = 'INCOME' and f.estorno_de is null
     and f.created_at = v_f.created_at;

  -- Os pontos e o voucher só reduzem a base no "sobre o pago" (como na conta da linha).
  if v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO' then
    v_desconto := v_fid;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    base_desconto := least(v_desconto, v_l.preco);
    v_base := v_l.preco - base_desconto;
  else
    base_desconto := least(v_desconto + v_dvenda, v_l.preco);
    v_base := v_l.preco - base_desconto;
    if v_l.desconta_taxa then
      base_taxa := round(v_base * v_taxa / 100, 2);
      v_base := v_base - base_taxa;
    end if;
    if v_l.desconta_insumos then
      base_insumos := v_l.custo_insumos;
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_base := greatest(v_base, 0);
  end if;
  base := round(v_base, 2);
end $function$;

revoke execute on function private.comissao_base_do_pagamento(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A conta da comissão: o avulso olha TODOS os lançamentos vivos do atendimento.
-- Pago = eles cobrem o preço e nenhum está em aberto (H4: o crediário espera a
-- última parcela). "Sobre o pago" vai na proporção do que entrou, como na venda.
-- O resto do corpo é o de 20261110004901.
-- ---------------------------------------------------------------------------
create or replace function private.comissao_conta_detalhe(p_linha uuid, OUT alvo numeric, OUT previsto numeric, OUT quitado boolean, OUT base numeric, OUT base_desconto numeric, OUT base_taxa numeric, OUT base_insumos numeric, OUT base_fator numeric)
 returns record
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_l         public.commission_lines%rowtype;
  v_fracao    numeric := 1;
  v_desconto  numeric := 0;
  v_taxa      numeric := 0;
  v_base      numeric;
  v_valor     numeric;
  v_pago      boolean := false;
  v_estornado boolean := false;
  v_total     numeric;
  v_recebido  numeric;
  v_quitado   numeric;
  v_dvenda    numeric := 0;
  v_fica      numeric;
  v_cheio     numeric;
  v_fator     numeric := 1;
  v_vivos     int := 0;
  v_abertos   int := 0;
begin
  alvo := 0; previsto := 0; quitado := false;
  base := null; base_desconto := 0; base_taxa := 0; base_insumos := 0; base_fator := 1;
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return;
  end if;
  quitado := true;

  if v_l.origem = 'AVULSO' then
    select round(coalesce(a.price, 0), 2) into v_total from public.appointments a where a.id = v_l.appointment_id;
    select count(*),
           count(*) filter (where not f.is_paid and f.amount > 0),
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0) + coalesce(f.sale_discount, 0)) filter (where f.is_paid), 0),
           coalesce(sum(f.loyalty_discount) filter (where f.is_paid), 0),
           coalesce(sum(f.sale_discount) filter (where f.is_paid), 0),
           case when coalesce(sum(f.amount) filter (where f.is_paid and f.amount > 0), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, 1), f.cartao_bandeira, f.maquininha_id)) filter (where f.is_paid and f.amount > 0)
             / sum(f.amount) filter (where f.is_paid and f.amount > 0)
           else 0 end
      into v_vivos, v_abertos, v_quitado, v_desconto, v_dvenda, v_taxa
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME' and f.estorno_de is null
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno';
    v_pago := v_vivos > 0 and v_abertos = 0 and round(v_quitado, 2) >= coalesce(v_total, 0);
    v_estornado := v_vivos = 0 and exists (
      select 1 from public.financial_transactions f
       where f.appointment_id = v_l.appointment_id and f.type = 'INCOME' and f.notes = 'Estornada');
    v_dvenda := coalesce(v_dvenda, 0);
    quitado  := v_pago;
    v_fracao := case
      when v_l.modo = 'PAGAMENTO' then
        case when coalesce(v_total, 0) <= 0 then case when v_pago then 1 else 0 end
             else least(1, v_quitado / v_total) end
      when v_l.modo = 'INTEGRAL' then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    -- PAGAMENTO era sempre "sobre o pago"; INTEGRAL e ATENDIMENTO seguem a
    -- base com pontos da configuração (retratada na linha).
    if not (v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO') then
      v_desconto := 0;
    end if;

  elsif v_l.origem = 'PLANO' or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and v_l.client_package_id is not null)
        or (v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null)
        or (v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null) then
    if v_l.origem = 'PLANO' then
      -- O plano cancelado vale o que foi usado (D4 da 9ª, a regra do pacote):
      -- a soma dos procedimentos menos as sessões canceladas.
      select coalesce(sum(p.price), 0) into v_total
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
       where s.plan_id = v_l.treatment_plan_id;
      v_total := v_total - coalesce((select tp.valor_cancelado from public.treatment_plans tp where tp.id = v_l.treatment_plan_id), 0);
    elsif v_l.origem in ('PACOTE', 'PACOTE_VENDA') then
      -- O pacote cancelado vale o que foi usado (F2b): o preço vendido menos
      -- as sessões canceladas.
      select cp.price - coalesce(cp.valor_cancelado, 0) into v_total
        from public.client_packages cp where cp.id = v_l.client_package_id;
    elsif v_l.origem = 'PRODUTO' then
      -- A devolução em parte (A34 da 8ª): a venda vale o vendido menos o devolvido.
      select ps.price - coalesce(ps.valor_devolvido, 0) into v_total from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                   where u.sale_id = ps.id and u.status = 'CANCELADA'), 0)
        into v_total
        from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    end if;
    select coalesce(sum(f.amount), 0),
           -- Pontos são forma de pagamento: quitam como o dinheiro.
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0)), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1), f.cartao_bandeira, f.maquininha_id))
             / sum(f.amount)
           else 0 end
      into v_recebido, v_quitado, v_taxa
      from public.financial_transactions f
     where ((v_l.origem = 'PLANO' and f.treatment_plan_id = v_l.treatment_plan_id)
         or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and f.client_package_id = v_l.client_package_id)
         or (v_l.origem = 'PRE_PAGO' and f.procedure_sale_id = v_l.procedure_sale_id)
         or (v_l.origem = 'PRODUTO' and f.product_sale_id = v_l.product_sale_id))
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    -- Sem preço de venda (o pacote de antes da venda no sistema): libera na conclusão, como sempre.
    quitado := v_total is null or v_total <= 0 or round(v_quitado, 2) >= round(v_total, 2);
    if v_l.modo = 'PAGAMENTO' and v_total is not null then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    elsif v_l.modo = 'INTEGRAL' then
      v_fracao := case when quitado then 1 else 0 end;
    end if;

  else
    v_fracao := 1;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    v_valor := case when v_l.preco > 0
      then round(v_l.regra_valor * (v_l.preco - least(v_desconto, v_l.preco)) / v_l.preco, 2)
      else v_l.regra_valor end;
    -- O fixo só os pontos e o voucher reduzem, na proporção (a base é o preço sem eles).
    base_desconto := least(v_desconto, v_l.preco);
    v_base := v_l.preco - base_desconto;
  else
    base_desconto := least(v_desconto + v_dvenda, v_l.preco);
    v_base := v_l.preco - base_desconto;
    if v_l.desconta_taxa then
      base_taxa := round(v_base * v_taxa / 100, 2);
      v_base := v_base - base_taxa;
    end if;
    if v_l.desconta_insumos then
      base_insumos := v_l.custo_insumos;
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_base := greatest(v_base, 0);
    v_valor := round(v_base * v_l.regra_valor / 100, 2);
  end if;

  -- A comissão de VENDA do pacote cancelado volta na proporção do que foi
  -- cancelado (F2b) — o previsto também, para não liberar sobre o que caiu.
  if v_l.origem = 'PACOTE_VENDA' and v_l.client_package_id is not null then
    select case when coalesce(cp.price, 0) > 0
                then greatest(cp.price - coalesce(cp.valor_cancelado, 0), 0) / cp.price
                else 1 end
      into v_fica
      from public.client_packages cp where cp.id = v_l.client_package_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
  end if;

  -- A comissão de VENDA do plano cancelado (a linha PLANO sem atendimento),
  -- igual (D4 da 9ª): na proporção do que ficou.
  if v_l.origem = 'PLANO' and v_l.appointment_id is null then
    select coalesce(sum(p.price), 0) into v_cheio
      from public.treatment_plan_sessions s
      join public.treatment_plan_session_procedures p on p.session_id = s.id
     where s.plan_id = v_l.treatment_plan_id;
    select case when v_cheio > 0
                then greatest(v_cheio - coalesce(tp.valor_cancelado, 0), 0) / v_cheio
                else 1 end
      into v_fica
      from public.treatment_plans tp where tp.id = v_l.treatment_plan_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
  end if;

  -- A da venda de PRODUTO com devolução em parte (A34 da 8ª): a linha do
  -- total na proporção do que a venda passou a valer; a de um item (o "por
  -- produto"), na do que ficou daquele item.
  if v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null then
    if coalesce(v_l.item, 0) = 0 then
      select case when coalesce(ps.price, 0) > 0
                  then greatest(ps.price - coalesce(ps.valor_devolvido, 0), 0) / ps.price
                  else 1 end
        into v_fica
        from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select case when coalesce(v_l.preco, 0) > 0
                  then greatest(v_l.preco - coalesce(i.valor_devolvido, 0), 0) / v_l.preco
                  else 1 end
        into v_fica
        from public.product_sale_items i where i.sale_id = v_l.product_sale_id and i.sort_order = v_l.item;
    end if;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
  end if;

  -- A17 da 11ª: a de VENDA do pré-pago (a linha sem atendimento), na proporção
  -- do que ficou (o vendido menos as unidades canceladas), como a do pacote.
  if v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null and v_l.appointment_id is null then
    select case when coalesce(ps.price, 0) > 0
                then greatest(ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                                    where u.sale_id = ps.id and u.status = 'CANCELADA'), 0), 0) / ps.price
                else 1 end
      into v_fica
      from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
  end if;

  previsto   := v_valor;
  alvo       := round(v_valor * v_fracao, 2);
  base_fator := v_fator;
  base       := round(v_base * v_fator, 2);
end $function$;

-- ---------------------------------------------------------------------------
-- Os pontos do atendimento pago em mais de um lançamento (as formas, as
-- parcelas): uma vez, pelo que já entrou — como no plano e no pacote. O de uma
-- forma só dá o mesmo de antes. O resto do corpo não muda.
-- ---------------------------------------------------------------------------
create or replace function public.fidelidade_pontos_do_pagamento(p_tx public.financial_transactions, p_cfg public.loyalty_configs)
 returns integer
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_total     numeric;
  v_pago      numeric;
  v_cob       numeric;
  v_ja        int;
  v_plano_pts numeric;
  v_alvo      int;
begin
  -- O crédito na clínica VENDIDO (decisão 1 da 9ª): pelo dinheiro pago, também
  -- no modo "por procedimento" — o uso depois, pago com crédito, não pontua.
  if p_tx.credito_vendido_id is not null then
    return floor(p_tx.amount * p_cfg.points_per_real)::int;
  end if;

  -- A venda de produto (D4): só pontua se a clínica ligou, e por real pago.
  if p_tx.product_sale_id is not null then
    if not coalesce(p_cfg.pontua_venda_de_produto, false) then
      return 0;
    end if;
    return floor(p_tx.amount * p_cfg.points_per_real)::int;
  end if;

  if p_cfg.earn_mode = 'POR_PROCEDIMENTO' and (p_tx.procedure_sale_id is not null or p_tx.client_package_id is not null) then
    if p_tx.procedure_sale_id is not null then
      select ps.price - coalesce(sum(u.preco) filter (where u.status = 'CANCELADA'), 0),
             coalesce(pr.loyalty_points, 0) * count(*) filter (where u.status <> 'CANCELADA')
        into v_total, v_plano_pts
        from public.procedure_sales ps
        join public.procedures pr on pr.id = ps.procedure_id
        left join public.procedure_sale_units u on u.sale_id = ps.id
       where ps.id = p_tx.procedure_sale_id
       group by ps.price, pr.loyalty_points;
    else
      select cp.price, coalesce(sum(coalesce(pr.loyalty_points, 0)), 0)
        into v_total, v_plano_pts
        from public.client_packages cp
        left join public.package_sessions s on s.client_package_id = cp.id
        left join public.procedures pr on pr.id = s.procedure_id
       where cp.id = p_tx.client_package_id
       group by cp.price;
    end if;

    select coalesce(sum(f.amount), 0) into v_pago
      from public.financial_transactions f
     where ((p_tx.procedure_sale_id is not null and f.procedure_sale_id = p_tx.procedure_sale_id)
         or (p_tx.procedure_sale_id is null and f.client_package_id = p_tx.client_package_id))
       and f.type = 'INCOME' and f.is_paid
       and f.category <> 'Estorno' and coalesce(f.notes, '') <> 'Estornada'
       and f.payment_method is distinct from 'INTERNAL_CREDIT';

    select coalesce(sum(l.points), 0)::int into v_ja
      from public.loyalty_transactions l
      join public.financial_transactions f on f.id = l.transaction_id
      left join public.financial_transactions o on o.id = f.estorno_de
     where ((p_tx.procedure_sale_id is not null and coalesce(f.procedure_sale_id, o.procedure_sale_id) = p_tx.procedure_sale_id)
         or (p_tx.procedure_sale_id is null and coalesce(f.client_package_id, o.client_package_id) = p_tx.client_package_id))
       and l.kind in ('GANHO', 'ESTORNO_GANHO');

    v_alvo := case when coalesce(v_total, 0) > 0
                   then floor(coalesce(v_plano_pts, 0) * least(v_pago, v_total) / v_total)::int
                   else 0 end;
    return greatest(v_alvo - v_ja, 0);
  end if;

  -- C43: por real, o pacote e o pré-pago também são cumulativos.
  if p_tx.procedure_sale_id is not null or p_tx.client_package_id is not null then
    select coalesce(sum(f.amount), 0) into v_pago
      from public.financial_transactions f
     where ((p_tx.procedure_sale_id is not null and f.procedure_sale_id = p_tx.procedure_sale_id)
         or (p_tx.procedure_sale_id is null and f.client_package_id = p_tx.client_package_id))
       and f.type = 'INCOME' and f.is_paid
       and f.category <> 'Estorno' and coalesce(f.notes, '') <> 'Estornada'
       and f.payment_method is distinct from 'INTERNAL_CREDIT';
    select coalesce(sum(l.points), 0)::int into v_ja
      from public.loyalty_transactions l
      join public.financial_transactions f on f.id = l.transaction_id
      left join public.financial_transactions o on o.id = f.estorno_de
     where ((p_tx.procedure_sale_id is not null and coalesce(f.procedure_sale_id, o.procedure_sale_id) = p_tx.procedure_sale_id)
         or (p_tx.procedure_sale_id is null and coalesce(f.client_package_id, o.client_package_id) = p_tx.client_package_id))
       and l.kind in ('GANHO', 'ESTORNO_GANHO');
    v_alvo := floor(v_pago * p_cfg.points_per_real)::int;
    return greatest(v_alvo - v_ja, 0);
  end if;

  if p_tx.treatment_plan_id is not null then
    select coalesce(sum(p.price), 0)
      into v_total
      from public.treatment_plan_sessions s
      join public.treatment_plan_session_procedures p on p.session_id = s.id
     where s.plan_id = p_tx.treatment_plan_id;

    select coalesce(sum(f.amount), 0)
      into v_pago
      from public.financial_transactions f
     where f.treatment_plan_id = p_tx.treatment_plan_id
       and f.type = 'INCOME'
       and f.is_paid
       and f.category <> 'Estorno'
       and coalesce(f.notes, '') <> 'Estornada'
       and f.payment_method is distinct from 'INTERNAL_CREDIT';

    select coalesce(sum(l.points), 0)::int
      into v_ja
      from public.loyalty_transactions l
     where l.treatment_plan_id = p_tx.treatment_plan_id
       and l.kind in ('GANHO', 'ESTORNO_GANHO');

    if p_cfg.earn_mode = 'POR_PROCEDIMENTO' then
      select coalesce(sum(coalesce(pr.loyalty_points, 0)), 0)
        into v_plano_pts
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
        join public.procedures pr on pr.id = p.procedure_id
       where s.plan_id = p_tx.treatment_plan_id;
      v_alvo := case when v_total > 0
                     then floor(v_plano_pts * least(v_pago, v_total) / v_total)::int
                     else 0 end;
    else
      v_alvo := floor(v_pago * p_cfg.points_per_real)::int;
    end if;

    return greatest(v_alvo - v_ja, 0);
  end if;

  -- O atendimento avulso (2026-11-16): pago em várias formas ou no crediário,
  -- pontua uma vez, pelo que já entrou. "Por procedimento", os pontos dele na
  -- proporção do que cobre o preço (o desconto e a fidelidade cobrem, como antes).
  if p_tx.appointment_id is not null then
    select round(coalesce(ap.price, 0), 2), coalesce(pr.loyalty_points, 0)
      into v_total, v_plano_pts
      from public.appointments ap
      left join public.procedures pr on pr.id = ap.procedure_id
     where ap.id = p_tx.appointment_id;

    select coalesce(sum(f.amount), 0),
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0) + coalesce(f.sale_discount, 0)), 0)
      into v_pago, v_cob
      from public.financial_transactions f
     where f.appointment_id = p_tx.appointment_id
       and f.type = 'INCOME' and f.is_paid and f.estorno_de is null
       and f.category <> 'Estorno' and coalesce(f.notes, '') <> 'Estornada'
       and f.payment_method is distinct from 'INTERNAL_CREDIT';

    select coalesce(sum(l.points), 0)::int into v_ja
      from public.loyalty_transactions l
      join public.financial_transactions f on f.id = l.transaction_id
      left join public.financial_transactions o on o.id = f.estorno_de
     where coalesce(f.appointment_id, o.appointment_id) = p_tx.appointment_id
       and l.kind in ('GANHO', 'ESTORNO_GANHO');

    if p_cfg.earn_mode = 'POR_PROCEDIMENTO' then
      v_alvo := case when coalesce(v_total, 0) > 0
                     then floor(coalesce(v_plano_pts, 0) * least(v_cob, v_total) / v_total)::int
                     else 0 end;
    else
      v_alvo := floor(v_pago * p_cfg.points_per_real)::int;
    end if;
    return greatest(v_alvo - v_ja, 0);
  end if;

  if p_cfg.earn_mode = 'POR_PROCEDIMENTO' then
    return 0;
  end if;

  return floor(p_tx.amount * p_cfg.points_per_real)::int;
end;
$function$;

-- ---------------------------------------------------------------------------
-- O PDV: a comanda do atendimento fechada por lançamentos vivos (as formas, a
-- entrada e as parcelas, o a receber), com o em aberto dela e dos produtos; a
-- reaberta pelo estorno de UMA forma vale o que falta. O resto do corpo é o de
-- 20261119100001; a assinatura não muda.
-- ---------------------------------------------------------------------------
create or replace function public.pdv_comandas(p_tenant uuid, p_branch uuid, p_situacao text, p_de timestamptz, p_ate timestamptz)
 returns table(id uuid, numero integer, origem text, aberta_em timestamptz, cancelada_em timestamptz, cancelada_motivo text,
               client_id uuid, cliente text, appointment_id uuid, procedimento text, profissional text, agendado_para timestamptz,
               atendimento_status text, valor numeric, paga boolean, paga_em timestamptz, recebido numeric, forma text,
               lancamento_id uuid, estornada boolean, treatment_plan_id uuid,
               em_aberto numeric, parcelas_em_aberto integer, proxima_parcela timestamptz, produtos integer,
               ja_pago numeric,
               formas jsonb, desconto numeric, fidelidade numeric, voucher text, estorno_anterior jsonb)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with c as (
    select c.*, a.price, a.scheduled_at, a.status::text as a_status, a.procedure_id, a.professional_id,
           f.id as f_id, f.paid_at, f.amount, f.payment_method as f_forma,
           f.coberto as f_coberto, f.em_aberto as f_em_aberto, f.parcelas as f_parcelas, f.proxima as f_proxima,
           f.crediario as f_crediario, f.a_receber as f_a_receber,
           it.valor as it_valor, it.vendidos as it_vendidos, it.recebido as it_recebido, it.produtos as it_produtos,
           it.em_aberto as it_em_aberto, it.parcelas as it_parcelas, it.proxima as it_proxima,
           it.crediario as it_crediario, it.a_receber as it_a_receber,
           v.valor as v_valor, v.recebido as v_recebido, v.forma as v_forma, v.estornada as v_estornada,
           v.primeiro as v_primeiro, v.em_aberto as v_em_aberto, v.parcelas as v_parcelas, v.proxima as v_proxima,
           v.substituida_id as v_substituida,
           case
             when c.client_package_id is not null then (select sp.name from public.client_packages cp
                 join public.service_packages sp on sp.id = cp.package_id where cp.id = c.client_package_id)
             when c.procedure_sale_id is not null then (select s.quantity || '× ' || pr.name from public.procedure_sales s
                 join public.procedures pr on pr.id = s.procedure_id where s.id = c.procedure_sale_id)
             when c.product_sale_id is not null then (select coalesce(nullif(s.descricao, ''), p.name) from public.product_sales s
                 left join public.products p on p.id = s.product_id where s.id = c.product_sale_id)
             when c.credito_vendido_id is not null then 'Crédito na rede'
             when c.treatment_plan_id is not null then (select coalesce(nullif(trim(tp.name), ''), 'Plano de tratamento')
                 from public.treatment_plans tp where tp.id = c.treatment_plan_id)
           end as v_item,
           case
             when c.client_package_id is not null then (select u.name from public.client_packages cp
                 join public.users u on u.id = cp.sold_by where cp.id = c.client_package_id)
             when c.procedure_sale_id is not null then (select u.name from public.procedure_sales s
                 join public.users u on u.id = s.sold_by where s.id = c.procedure_sale_id)
             when c.product_sale_id is not null then (select u.name from public.product_sales s
                 join public.users u on u.id = s.sold_by where s.id = c.product_sale_id)
             when c.credito_vendido_id is not null then (select s.registrado_por_nome from public.creditos_vendidos s
                 where s.id = c.credito_vendido_id)
             when c.treatment_plan_id is not null then (select u.name from public.treatment_plans tp
                 join public.users u on u.id = tp.professional_id where tp.id = c.treatment_plan_id)
           end as v_quem,
           case when c.treatment_plan_id is not null then (select coalesce(sum(p.price), 0)
                 from public.treatment_plan_session_procedures p
                 join public.treatment_plan_sessions s on s.id = p.session_id
                where s.plan_id = c.treatment_plan_id) end as pl_valor
      from public.comandas c
      left join public.appointments a on a.id = c.appointment_id
      left join lateral (
        -- 2026-11-16 (as várias formas e o crediário no avulso): os lançamentos VIVOS
        -- do atendimento — pagos, ou a receber do crediário e do "a receber" (o a
        -- receber sem forma do "Concluir" antigo não fecha a comanda). Fechada quando
        -- eles cobrem o preço; a forma é a maior paga (o crediário e o a receber se dizem).
        select (array_agg(f.id order by f.created_at, f.amount desc, f.id))[1] as id,
               max(f.created_at) as paid_at,
               coalesce(sum(f.amount) filter (where f.is_paid), 0) as amount,
               (array_agg(f.payment_method::text order by f.amount desc, f.created_at)
                  filter (where f.is_paid and f.payment_method is not null))[1] as payment_method,
               coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0) + coalesce(f.sale_discount, 0)), 0) as coberto,
               coalesce(sum(f.amount) filter (where not f.is_paid and f.amount > 0), 0) as em_aberto,
               (count(*) filter (where not f.is_paid and f.amount > 0 and f.parcela_grupo is not null))::integer as parcelas,
               min(f.due_date) filter (where not f.is_paid and f.amount > 0) as proxima,
               coalesce(bool_or(f.parcela_grupo is not null), false) as crediario,
               coalesce(bool_or(not f.is_paid and f.amount > 0), false) as a_receber
          from public.financial_transactions f
         where c.appointment_id is not null and f.appointment_id = c.appointment_id
           and f.type::text = 'INCOME' and f.estorno_de is null
           and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno'
           and (f.is_paid or f.notes is not null)
      ) f on true
      left join lateral (
        select coalesce((select sum(round(p.sale_price, 2) * i.quantidade)
                           from public.comanda_itens i join public.products p on p.id = i.product_id
                          where i.comanda_id = c.id and i.product_sale_id is null), 0) as valor,
               -- D2 da 18ª: a venda de produto estornada não é "já pago" nem entra no valor da comanda paga.
               coalesce((select sum(ps.preco_tabela) from public.product_sales ps
                          where ps.id in (select i.product_sale_id from public.comanda_itens i where i.comanda_id = c.id)
                            and ps.estornada_em is null), 0) as vendidos,
               coalesce((select sum(t.amount) from public.financial_transactions t
                          where t.product_sale_id in (select i.product_sale_id from public.comanda_itens i where i.comanda_id = c.id)
                            and t.type::text = 'INCOME' and t.estorno_de is null and t.is_paid
                            and coalesce(t.notes, '') <> 'Estornada'), 0) as recebido,
               (select count(*)::integer from public.comanda_itens i where i.comanda_id = c.id) as produtos,
               -- 2026-11-16: os produtos recebidos no crediário ou a receber, com a comanda.
               coalesce(ab.em_aberto, 0) as em_aberto, coalesce(ab.parcelas, 0) as parcelas, ab.proxima,
               coalesce(ab.crediario, false) as crediario, coalesce(ab.a_receber, false) as a_receber
          from (select sum(t.amount) filter (where not t.is_paid and t.amount > 0) as em_aberto,
                       (count(*) filter (where not t.is_paid and t.amount > 0 and t.parcela_grupo is not null))::integer as parcelas,
                       min(t.due_date) filter (where not t.is_paid and t.amount > 0) as proxima,
                       bool_or(t.parcela_grupo is not null) as crediario,
                       bool_or(not t.is_paid and t.amount > 0) as a_receber
                  from public.financial_transactions t
                 where t.product_sale_id in (select i.product_sale_id from public.comanda_itens i where i.comanda_id = c.id)
                   and t.type::text = 'INCOME' and t.estorno_de is null
                   and coalesce(t.notes, '') <> 'Estornada') ab
         where c.origem = 'ATENDIMENTO'
      ) it on true
      left join lateral (
        -- D1 da 19ª: o estornado que ganhou o lançamento reaberto (estornar_e_reabrir) não conta no valor:
        -- o reaberto é ele de novo. O estornado sem reaberto (a venda cancelada) segue no valor.
        select sum(coalesce(t.valor_antes_do_estorno, t.amount)) filter (where not sb.substituida) as valor,
               coalesce(sum(t.amount) filter (where t.is_paid and coalesce(t.notes, '') <> 'Estornada'), 0) as recebido,
               case
                 when bool_or(t.parcela_grupo is not null) then 'CREDIARIO'
                 else coalesce(
                   (array_agg(t.payment_method::text order by t.parcela_numero nulls first, t.created_at) filter (where not sb.substituida))[1],
                   case when bool_or(not t.is_paid and t.amount > 0 and coalesce(t.notes, '') <> 'Estornada') then 'A_RECEBER' end)
               end as forma,
               bool_and(coalesce(t.notes, '') = 'Estornada') as estornada,
               min(t.created_at) filter (where coalesce(t.notes, '') <> 'Estornada') as primeiro,
               coalesce(sum(t.amount) filter (where not t.is_paid and t.amount > 0 and coalesce(t.notes, '') <> 'Estornada'), 0) as em_aberto,
               (count(*) filter (where not t.is_paid and t.amount > 0 and t.parcela_grupo is not null
                                   and coalesce(t.notes, '') <> 'Estornada'))::integer as parcelas,
               min(t.due_date) filter (where not t.is_paid and t.amount > 0 and coalesce(t.notes, '') <> 'Estornada') as proxima,
               (array_agg(t.id order by t.created_at desc) filter (where sb.substituida))[1] as substituida_id
          from public.financial_transactions t
          cross join lateral (
            -- O reaberto nasce na MESMA transação do estorno (o mesmo created_at), da mesma venda e parcela.
            select exists (
              select 1 from public.financial_transactions e
                join public.financial_transactions r on r.created_at = e.created_at
               where e.estorno_de = t.id and r.id <> t.id and r.type::text = 'INCOME' and r.estorno_de is null
                 and r.client_package_id is not distinct from t.client_package_id
                 and r.procedure_sale_id is not distinct from t.procedure_sale_id
                 and r.treatment_plan_id is not distinct from t.treatment_plan_id
                 and r.parcela_numero is not distinct from t.parcela_numero) as substituida
          ) sb
         where c.origem in ('VENDA', 'PLANO') and t.type::text = 'INCOME' and t.estorno_de is null
           and (t.client_package_id = c.client_package_id or t.procedure_sale_id = c.procedure_sale_id
                or t.product_sale_id = c.product_sale_id or t.credito_vendido_id = c.credito_vendido_id
                or t.treatment_plan_id = c.treatment_plan_id)
      ) v on true
     where c.tenant_id = p_tenant and c.branch_id = p_branch
  ), s as (
    select c.*,
           case c.origem
             when 'VENDA' then true
             when 'PLANO' then c.v_primeiro is not null
             else c.f_id is not null and round(c.f_coberto, 2) >= round(coalesce(c.price, 0), 2)
           end as e_paga,
           case c.origem
             when 'VENDA' then c.aberta_em
             when 'PLANO' then c.v_primeiro
             else c.paid_at
           end as e_paga_em
      from c
  )
  select s.id, s.numero, s.origem, s.aberta_em, s.cancelada_em, s.cancelada_motivo,
         s.client_id, cl.name, s.appointment_id,
         case when s.origem in ('VENDA', 'PLANO') then s.v_item else pr.name end,
         case when s.origem in ('VENDA', 'PLANO') then s.v_quem else u.name end,
         s.scheduled_at, s.a_status,
         round(case s.origem
                 when 'VENDA' then coalesce(s.v_valor, 0)
                 when 'PLANO' then coalesce(s.pl_valor, 0)
                 -- D1 da 16ª: a receber, só o que falta (o produto já vendido fica em ja_pago).
                 -- 2026-11-16: reaberta pelo estorno de UMA das formas, só o que falta do atendimento.
                 else case when s.e_paga then coalesce(s.price, 0) + coalesce(s.it_valor, 0) + coalesce(s.it_vendidos, 0)
                           else greatest(coalesce(s.price, 0) - coalesce(s.f_coberto, 0), 0) + coalesce(s.it_valor, 0) end end, 2),
         s.e_paga,
         s.e_paga_em,
         round(case when s.origem in ('VENDA', 'PLANO') then s.v_recebido
                    else s.amount + coalesce(s.it_recebido, 0) end, 2),
         case when s.origem in ('VENDA', 'PLANO') then s.v_forma
              when s.e_paga and (s.f_crediario or coalesce(s.it_crediario, false)) then 'CREDIARIO'
              when s.e_paga and (s.f_a_receber or coalesce(s.it_a_receber, false)) then 'A_RECEBER'
              else s.f_forma end,
         s.f_id,
         s.origem in ('VENDA', 'PLANO') and s.v_valor is not null and coalesce(s.v_estornada, false),
         s.treatment_plan_id,
         round(case when s.origem in ('VENDA', 'PLANO') then coalesce(s.v_em_aberto, 0)
                    when s.e_paga then coalesce(s.f_em_aberto, 0) + coalesce(s.it_em_aberto, 0) else 0 end, 2),
         case when s.origem in ('VENDA', 'PLANO') then coalesce(s.v_parcelas, 0)
              when s.e_paga then coalesce(s.f_parcelas, 0) + coalesce(s.it_parcelas, 0) else 0 end,
         case when s.origem in ('VENDA', 'PLANO') then s.v_proxima
              when s.e_paga then least(s.f_proxima, s.it_proxima) end,
         coalesce(s.it_produtos, 0),
         -- 2026-11-16: e o que já cobre o atendimento (as formas que ficaram depois do estorno de uma).
         round(case when s.origem = 'ATENDIMENTO' and not s.e_paga then coalesce(s.it_vendidos, 0) + coalesce(s.f_coberto, 0) else 0 end, 2),
         -- D3 da 17ª: as formas dos lançamentos vivos e pagos da comanda paga (o atendimento e os produtos).
         -- A1 da 19ª: com a bandeira; e as da venda paga à vista (D1 da 19ª: a forma de agora, não a estornada).
         coalesce((select jsonb_agg(jsonb_build_object('forma', x.forma, 'vezes', x.vezes, 'bandeira', x.bandeira, 'valor', x.valor) order by x.valor desc, x.forma)
                     from (select t.payment_method::text as forma, coalesce(t.cartao_vezes, 1)::integer as vezes,
                                  t.cartao_bandeira::text as bandeira, round(sum(t.amount), 2) as valor
                             from public.financial_transactions t
                            where t.id = any (coalesce(pg.ids, vp.ids)) and t.payment_method is not null
                            group by 1, 2, 3 having sum(t.amount) <> 0) x), '[]'::jsonb),
         -- A1 da 17ª: o desconto comercial e o da fidelidade (voucher ou pontos) desses lançamentos.
         round(coalesce(pg.desconto, 0), 2),
         round(coalesce(pg.fidelidade, 0), 2),
         (select v.name from public.loyalty_vouchers v where v.used_transaction_id = any (pg.ids) order by v.name limit 1),
         -- A2 da 17ª: a comanda do atendimento reaberta diz o pagamento estornado mais recente.
         case when s.origem = 'ATENDIMENTO' and not s.e_paga and s.appointment_id is not null then (
           select jsonb_build_object(
                    'quando', e.created_at, 'valor', coalesce(o.valor_antes_do_estorno, o.amount),
                    'forma', o.payment_method::text, 'vezes', coalesce(o.cartao_vezes, 1),
                    'desconto', coalesce(o.sale_discount, 0), 'fidelidade', coalesce(o.loyalty_discount, 0),
                    'voucher', (select v.name from public.loyalty_vouchers v where v.used_transaction_id = o.id limit 1))
             from public.financial_transactions o
             join public.financial_transactions e on e.estorno_de = o.id
            where o.appointment_id = s.appointment_id and o.type::text = 'INCOME' and o.notes = 'Estornada'
            order by e.created_at desc
            limit 1)
         -- D1 da 19ª: a venda e o plano dizem o pagamento estornado que ganhou o reaberto — a receber ou recebido de novo.
         when s.origem in ('VENDA', 'PLANO') and s.v_substituida is not null then (
           select jsonb_build_object(
                    'quando', e.created_at, 'valor', coalesce(o.valor_antes_do_estorno, o.amount),
                    'forma', o.payment_method::text, 'vezes', coalesce(o.cartao_vezes, 1),
                    'desconto', coalesce(o.sale_discount, 0), 'fidelidade', coalesce(o.loyalty_discount, 0),
                    'voucher', (select v.name from public.loyalty_vouchers v where v.used_transaction_id = o.id limit 1))
             from public.financial_transactions o
             join public.financial_transactions e on e.estorno_de = o.id
            where o.id = s.v_substituida
            order by e.created_at desc
            limit 1)
         end
    from s
    left join lateral (
      -- Os lançamentos vivos e pagos da comanda do atendimento paga: o do atendimento e os dos produtos dela.
      select array_agg(x.id) as ids, sum(x.desconto) as desconto, sum(x.fidelidade) as fidelidade
        from (
          select t.id, coalesce(t.sale_discount, 0) as desconto, coalesce(t.loyalty_discount, 0) as fidelidade
            from public.financial_transactions t
           where t.appointment_id = s.appointment_id and t.type::text = 'INCOME' and t.estorno_de is null
             and coalesce(t.notes, '') <> 'Estornada' and coalesce(t.category, '') <> 'Estorno'
             and (t.is_paid or t.notes is not null)
          union all
          select t.id, coalesce(t.sale_discount, 0), coalesce(t.loyalty_discount, 0)
            from public.comanda_itens i
            join public.financial_transactions t on t.product_sale_id = i.product_sale_id
           where i.comanda_id = s.id and t.type::text = 'INCOME' and t.estorno_de is null and t.is_paid
             and coalesce(t.notes, '') <> 'Estornada'
        ) x
       where s.origem = 'ATENDIMENTO' and s.e_paga
    ) pg on true
    left join lateral (
      -- D1/A1 da 19ª: os lançamentos vivos e pagos da venda paga à vista (no crediário e no a receber, a forma é a da venda).
      select array_agg(t.id) as ids
        from public.financial_transactions t
       where s.origem = 'VENDA' and coalesce(s.v_forma, '') not in ('CREDIARIO', 'A_RECEBER')
         and t.type::text = 'INCOME' and t.estorno_de is null and t.is_paid and coalesce(t.notes, '') <> 'Estornada'
         and (t.client_package_id = s.client_package_id or t.procedure_sale_id = s.procedure_sale_id
              or t.product_sale_id = s.product_sale_id or t.credito_vendido_id = s.credito_vendido_id)
    ) vp on true
    left join public.clients cl on cl.id = s.client_id
    left join public.procedures pr on pr.id = s.procedure_id
    left join public.users u on u.id = s.professional_id
   where case p_situacao
           when 'ABERTAS' then s.cancelada_em is null and not s.e_paga
           when 'PAGAS'   then s.e_paga and s.e_paga_em between p_de and p_ate
           else (s.cancelada_em is null and not s.e_paga)
             or (s.e_paga and s.e_paga_em between p_de and p_ate)
             or (s.cancelada_em between p_de and p_ate)
         end
$function$;

-- ---------------------------------------------------------------------------
-- As vendas: o atendimento pago em várias formas vale o preço menos o desconto
-- do pagamento (a soma das formas). O resto do corpo é o de 20261115700003.
-- ---------------------------------------------------------------------------
create or replace function public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(id uuid, tipo text, data timestamp with time zone, descricao text, quantidade integer, cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric, comanda integer)
 language sql
 stable
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  )
  select a.id, 'PROCEDIMENTO', a.aconteceu_em, pr.name, 1,
         a.client_id, c.name, u.name, a.branch_id,
         a.price - coalesce(t.sale_discount, 0), k.numero
    from public.appointments a
    join scope s on s.id = a.branch_id
    join public.procedures pr on pr.id = a.procedure_id
    left join public.clients c on c.id = a.client_id
    left join public.users u on u.id = a.professional_id
    left join public.comandas k on k.appointment_id = a.id
    left join lateral (
      -- 2026-11-16: o desconto do pagamento (as formas dele nascem juntas), não o de uma delas.
      select sum(f.sale_discount) as sale_discount from public.financial_transactions f
       where f.appointment_id = a.id and f.type::text = 'INCOME' and f.estorno_de is null
         and f.created_at = (select g.created_at from public.financial_transactions g
                              where g.appointment_id = a.id and g.type::text = 'INCOME' and g.estorno_de is null
                              order by (coalesce(g.notes, '') = 'Estornada'), g.created_at desc, g.id
                              limit 1)
    ) t on true
   where a.status = 'COMPLETED'
     and a.aconteceu_em between p_from and p_to
     and a.price > 0
     and a.treatment_plan_id is null
     and not exists (select 1 from public.package_sessions x where x.appointment_id = a.id)
     and not exists (select 1 from public.procedure_sale_units x where x.appointment_id = a.id)
     and (p_professional_id is null or a.professional_id = p_professional_id)

  union all
  select cp.id, 'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,
         cp.client_id, c.name, u.name, cp.branch_id, cp.price - coalesce(cp.valor_cancelado, 0), k.numero
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
    left join public.comandas k on k.client_package_id = cp.id
   where cp.purchased_at between p_from and p_to
     and not cp.de_fora
     and (cp.cancelado_em is null or coalesce(cp.price, 0) - coalesce(cp.valor_cancelado, 0) > 0)
     and (p_professional_id is null or cp.sold_by = p_professional_id)

  union all
  select v.id, 'PRE_PAGO', v.sold_at, pr.name, v.quantity,
         v.client_id, c.name, u.name, v.branch_id, v.price - coalesce(x.cancelado, 0), k.numero
    from public.procedure_sales v
    join scope s on s.id = v.branch_id
    join public.procedures pr on pr.id = v.procedure_id
    left join public.clients c on c.id = v.client_id
    left join public.users u on u.id = v.sold_by
    left join public.comandas k on k.procedure_sale_id = v.id
    left join lateral (
      select sum(un.preco) cancelado from public.procedure_sale_units un
       where un.sale_id = v.id and un.status = 'CANCELADA'
    ) x on true
   where v.tenant_id = p_tenant
     and v.sold_at between p_from and p_to
     and (coalesce(x.cancelado, 0) = 0 or v.price - x.cancelado > 0)
     and (p_professional_id is null or v.sold_by = p_professional_id)

  union all
  select tp.id, 'PLANO', rec.em, coalesce(nullif(btrim(tp.name), ''), 'Plano de tratamento'),
         (select count(*)::integer from public.treatment_plan_sessions x where x.plan_id = tp.id),
         tp.client_id, c.name, u.name, tp.branch_id,
         soma.valor - coalesce(tp.valor_cancelado, 0), k.numero
    from public.treatment_plans tp
    join scope s on s.id = tp.branch_id
    left join public.clients c on c.id = tp.client_id
    left join public.users u on u.id = coalesce(tp.vendido_por, tp.professional_id)
    left join public.comandas k on k.treatment_plan_id = tp.id
    cross join lateral (
      select coalesce(sum(x.price), 0) valor
        from public.treatment_plan_session_procedures x
        join public.treatment_plan_sessions ss on ss.id = x.session_id
       where ss.plan_id = tp.id
    ) soma
    cross join lateral (
      select min(f.created_at) em
        from public.financial_transactions f
       where f.treatment_plan_id = tp.id and f.type::text = 'INCOME' and f.estorno_de is null
    ) rec
   where (tp.status in ('ACCEPTED', 'COMPLETED')
          or (tp.cancelado_em is not null and soma.valor - coalesce(tp.valor_cancelado, 0) > 0))
     and rec.em between p_from and p_to
     and (p_professional_id is null or coalesce(tp.vendido_por, tp.professional_id) = p_professional_id)

  union all
  select ps.id, 'PRODUTO', ps.sold_at, coalesce(ps.descricao, p.name), ps.quantity - coalesce(ps.unidades_devolvidas, 0),
         ps.client_id, c.name, u.name, ps.branch_id, ps.price - coalesce(ps.valor_devolvido, 0),
         -- A venda avulsa tem a comanda dela; o produto vendido dentro do
         -- atendimento é um item da comanda do atendimento.
         coalesce(k.numero, (select k2.numero from public.comanda_itens i
                               join public.comandas k2 on k2.id = i.comanda_id
                              where i.product_sale_id = ps.id
                              order by k2.numero limit 1))
    from public.product_sales ps
    join scope s on s.id = ps.branch_id
    join public.products p on p.id = ps.product_id
    left join public.clients c on c.id = ps.client_id
    left join public.users u on u.id = ps.sold_by
    left join public.comandas k on k.product_sale_id = ps.id
   where ps.tenant_id = p_tenant
     and ps.estornada_em is null
     and ps.sold_at between p_from and p_to
     and (p_professional_id is null or ps.sold_by = p_professional_id)

  union all
  -- RL1: o crédito na clínica vendido. Fica FORA do total geral (o resumo).
  select cv.id, 'CREDITO', cv.created_at, 'Crédito na clínica', 1,
         cv.client_id, c.name, null::text, cv.branch_id,
         cv.valor - coalesce(cv.valor_devolvido, 0), k.numero
    from public.creditos_vendidos cv
    join scope s on s.id = cv.branch_id
    left join public.clients c on c.id = cv.client_id
    left join public.comandas k on k.credito_vendido_id = cv.id
   where cv.tenant_id = p_tenant
     and cv.created_at between p_from and p_to
     and (cv.estornado_em is null or cv.valor - coalesce(cv.valor_devolvido, 0) > 0)
     and p_professional_id is null
$function$;

revoke execute on function public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz) to service_role;
revoke execute on function public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
