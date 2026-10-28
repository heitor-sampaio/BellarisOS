-- O estorno REABRE a cobrança do atendimento (D6 da simulação de 2026-10-28).
--
-- Estornado o pagamento de um atendimento avulso, ele continuava "pago": a
-- original fica marcada `notes = 'Estornada'` (nunca apagada) e ainda tinha
-- `is_paid`, e tanto `atendimentos_a_receber` quanto a guarda de
-- `confirmar_pagamento_do_atendimento` liam "existe INCOME pago". E nem dava
-- para lançar o recebimento novo: `financial_transactions.appointment_id` era
-- UNIQUE, e a estornada segurava o lugar.
--
-- Decisão do Heitor: só o ESTORNADO reabre. O estornado sai da unicidade (o
-- índice passa a valer só para o lançamento vivo), sai do "já pago", e o
-- recebimento novo nasce como qualquer outro — com cliente, pontos (o gatilho
-- de fidelidade) e comissão (o gatilho do pagamento). Nada duplica: o estorno
-- já devolveu a comissão (ESTORNO no extrato) e os pontos (ESTORNO_GANHO), e a
-- comissão AVULSO passa a ler o lançamento VIVO do atendimento.
--
-- Corpos partem do que está na produção em 2026-10-28.

-- 1. A unicidade vale para o lançamento vivo do atendimento.
alter table public.financial_transactions drop constraint if exists financial_transactions_appointment_id_key;
drop index if exists public.financial_transactions_appointment_id_key;
create unique index financial_transactions_appointment_id_key
  on public.financial_transactions (appointment_id)
  where coalesce(notes, '') <> 'Estornada';

-- 2. A receber: o pago ESTORNADO não conta como pago.
create or replace function public.atendimentos_a_receber(p_tenant uuid, p_unidade uuid default null::uuid, p_cliente uuid default null::uuid, p_agendamento uuid default null::uuid, p_profissional uuid default null::uuid)
 returns table(appointment_id uuid, branch_id uuid, branch_slug text, client_id uuid, client_name text, procedure_id uuid, procedure_name text, professional_name text, price numeric, scheduled_at timestamp with time zone, completed_at timestamp with time zone, total_n bigint, total_valor numeric)
 language sql
 stable
 set search_path to ''
as $function$
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
                      where f.appointment_id = a.id and f.type = 'INCOME' and f.is_paid
                        and coalesce(f.notes, '') <> 'Estornada')
   order by a.completed_at, a.id
$function$;

-- 3. Receber: o "já pago" e a conta a receber que se quita são o lançamento VIVO.
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

  -- O lançamento VIVO do atendimento (D6, 2026-10-28): o estornado fica no
  -- histórico e não segura o recebimento novo.
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

-- 4. A comissão do avulso lê o lançamento VIVO; sem ele, o último estornado
--    (que zera a comissão no modo "no atendimento", como antes).
create or replace function private.comissao_alvo(p_linha uuid)
 returns numeric
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
  v_metodo    text;
  v_vezes     int;
  v_total     numeric;
  v_recebido  numeric;
  v_dvenda    numeric := 0;
begin
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return 0;
  end if;

  if v_l.origem = 'AVULSO' then
    select f.is_paid and coalesce(f.notes, '') <> 'Estornada',
           coalesce(f.notes, '') = 'Estornada',
           coalesce(f.loyalty_discount, 0),
           f.payment_method::text,
           coalesce(f.sale_discount, 0),
           f.cartao_vezes
      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME'
     order by (coalesce(f.notes, '') = 'Estornada'), f.created_at desc, f.id
     limit 1;
    v_pago      := coalesce(v_pago, false);
    v_estornado := coalesce(v_estornado, false);
    if v_pago then
      v_taxa := private.comissao_taxa_pct(v_l.tenant_id, v_metodo, coalesce(v_vezes, 1));
    else
      v_desconto := 0;
      v_dvenda   := 0;
    end if;
    v_dvenda := coalesce(v_dvenda, 0);
    v_fracao := case
      when v_l.modo = 'PAGAMENTO' then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    if not (v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO') then
      v_desconto := 0;
    end if;

  elsif v_l.origem = 'PLANO' or (v_l.origem = 'PACOTE' and v_l.client_package_id is not null)
        or (v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null) then
    if v_l.origem = 'PLANO' then
      select coalesce(sum(p.price), 0) into v_total
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
       where s.plan_id = v_l.treatment_plan_id;
    elsif v_l.origem = 'PACOTE' then
      select cp.price into v_total from public.client_packages cp where cp.id = v_l.client_package_id;
    else
      select ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                   where u.sale_id = ps.id and u.status = 'CANCELADA'), 0)
        into v_total
        from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    end if;
    select coalesce(sum(f.amount), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1)))
             / sum(f.amount)
           else 0 end
      into v_recebido, v_taxa
      from public.financial_transactions f
     where ((v_l.origem = 'PLANO' and f.treatment_plan_id = v_l.treatment_plan_id)
         or (v_l.origem = 'PACOTE' and f.client_package_id = v_l.client_package_id)
         or (v_l.origem = 'PRE_PAGO' and f.procedure_sale_id = v_l.procedure_sale_id))
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    if v_l.modo = 'PAGAMENTO' and v_total is not null then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    end if;

  else
    v_fracao := 1;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    v_valor := case when v_l.preco > 0
      then round(v_l.regra_valor * (v_l.preco - least(v_desconto, v_l.preco)) / v_l.preco, 2)
      else v_l.regra_valor end;
  else
    v_base := v_l.preco - least(v_desconto + v_dvenda, v_l.preco);
    if v_l.desconta_taxa then
      v_base := v_base - round(v_base * v_taxa / 100, 2);
    end if;
    if v_l.desconta_insumos then
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_valor := round(greatest(v_base, 0) * v_l.regra_valor / 100, 2);
  end if;

  return round(v_valor * v_fracao, 2);
end $function$;

-- 5. O total a receber da cliente conta o concluído reaberto (o estornado não
--    é "lançamento em aberto", e não pode tirá-lo da segunda parcela da soma).
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
                          where f.appointment_id = r.appointment_id
                            and coalesce(f.notes, '') <> 'Estornada')
    ), 0),
    case when p_profissional is null then coalesce((
      select round(sum(c.amount), 2) from public.internal_credits c where c.client_id = p_client
    ), 0) end
$function$;

-- 6. A venda avulsa continua UMA com dois lançamentos (o estornado e o novo):
--    vale o desconto comercial do lançamento vivo; sem ele, o do estornado.
create or replace function public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(id uuid, tipo text, data timestamp with time zone, descricao text, quantidade integer, cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric)
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
         a.price - coalesce(t.sale_discount, 0)
    from public.appointments a
    join scope s on s.id = a.branch_id
    join public.procedures pr on pr.id = a.procedure_id
    left join public.clients c on c.id = a.client_id
    left join public.users u on u.id = a.professional_id
    left join lateral (
      select f.sale_discount from public.financial_transactions f
       where f.appointment_id = a.id
       order by (coalesce(f.notes, '') = 'Estornada'), f.created_at desc, f.id
       limit 1
    ) t on true
   where a.status = 'COMPLETED'
     and a.aconteceu_em between p_from and p_to
     and a.price > 0
     and a.treatment_plan_id is null
     and not exists (select 1 from public.package_sessions x where x.appointment_id = a.id)
     and not exists (select 1 from public.procedure_sale_units x where x.appointment_id = a.id)

  union all
  select cp.id, 'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,
         cp.client_id, c.name, u.name, cp.branch_id, cp.price
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
   where cp.purchased_at between p_from and p_to

  union all
  select v.id, 'PRE_PAGO', v.sold_at, pr.name, v.quantity,
         v.client_id, c.name, u.name, v.branch_id, v.price
    from public.procedure_sales v
    join scope s on s.id = v.branch_id
    join public.procedures pr on pr.id = v.procedure_id
    left join public.clients c on c.id = v.client_id
    left join public.users u on u.id = v.sold_by
   where v.tenant_id = p_tenant
     and v.sold_at between p_from and p_to

  union all
  select tp.id, 'PLANO', tp.aceito_em, coalesce(nullif(btrim(tp.name), ''), 'Plano de tratamento'),
         (select count(*)::integer from public.treatment_plan_sessions x where x.plan_id = tp.id),
         tp.client_id, c.name, u.name, tp.branch_id,
         coalesce((select sum(x.price)
                     from public.treatment_plan_session_procedures x
                     join public.treatment_plan_sessions ss on ss.id = x.session_id
                    where ss.plan_id = tp.id), 0)
    from public.treatment_plans tp
    join scope s on s.id = tp.branch_id
    left join public.clients c on c.id = tp.client_id
    left join public.users u on u.id = tp.professional_id
   where tp.status in ('ACCEPTED', 'COMPLETED')
     and tp.aceito_em between p_from and p_to
$function$;

notify pgrst, 'reload schema';
