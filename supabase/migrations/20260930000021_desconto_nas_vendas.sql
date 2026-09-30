-- Desconto em todas as vendas (decisão do Heitor, 2026-09-30): pacote, checkout
-- do plano e o pagamento do atendimento na recepção. Sem teto, e fica
-- registrado quem deu. O app calcula o desconto em reais (lib/vendas/desconto.ts,
-- em centavos) e a função confere que a conta fecha — o valor do navegador não
-- entra.
--
-- Regra da comissão: o desconto COMERCIAL sempre reduz a base (a venda foi mais
-- barata). No pacote e no plano isso vem de graça — o preço vendido já é a base
-- das sessões e dos procedimentos. No avulso, é `sale_discount`. O desconto de
-- pontos segue `base_com_pontos`, como antes. Regra de valor fixo não muda com
-- o desconto comercial.

-- ─── 1. Pacote: preço de tabela, desconto e preço vendido ────────────────────
alter table public.client_packages
  add column if not exists preco_tabela numeric(12,2) check (preco_tabela >= 0),
  add column if not exists desconto     numeric(12,2) not null default 0 check (desconto >= 0);

comment on column public.client_packages.price is
  'Preço VENDIDO (retrato da venda, já com o desconto). É o total a receber e a base do rateio das sessões.';
comment on column public.client_packages.preco_tabela is
  'Preço do catálogo no momento da venda. Nulo nos pacotes de antes de 2026-09-30.';
comment on column public.client_packages.desconto is
  'Desconto da venda, em reais: price = preco_tabela - desconto. Quem deu é sold_by.';

drop function if exists public.pacote_vender(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb);

create or replace function public.pacote_vender(
  p_tenant uuid, p_cliente uuid, p_pacote uuid, p_unidade uuid, p_ator uuid, p_lancamentos jsonb,
  p_sessoes jsonb default null, p_desconto numeric default 0
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_pac      public.service_packages%rowtype;
  v_nome     text;
  v_cp       uuid;
  v_soma     numeric;
  v_l        jsonb;
  v_tx       uuid;
  v_agora    timestamptz := now();
  v_desconto numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido  numeric;
begin
  select * into v_pac from public.service_packages sp where sp.id = p_pacote and sp.tenant_id = p_tenant;
  if not found then
    raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
  end if;
  if not v_pac.is_active then
    raise exception 'Este pacote está desativado.' using errcode = 'P0001';
  end if;
  if v_pac.branch_id is not null and v_pac.branch_id <> p_unidade then
    raise exception 'Este pacote é de outra unidade.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select c.name into v_nome from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_desconto < 0 or v_desconto > round(v_pac.price, 2) then
    raise exception 'O desconto não pode ser maior que o preço do pacote.' using errcode = 'P0001';
  end if;
  v_vendido := round(v_pac.price, 2) - v_desconto;

  select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) into v_soma
    from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l;
  if v_soma <> v_vendido then
    raise exception 'O pagamento não fecha com o preço do pacote.' using errcode = 'P0001';
  end if;

  if p_sessoes is not null then
    if exists (
      select 1 from (
        select i.procedure_id, sum(i.quantity) quantity from public.service_package_items i where i.package_id = p_pacote group by 1
      ) itens
      full join (
        select (s ->> 'procedure_id')::uuid procedure_id, count(*) n from jsonb_array_elements(p_sessoes) s group by 1
      ) sess on sess.procedure_id = itens.procedure_id
       where coalesce(itens.quantity, 0) <> coalesce(sess.n, 0)
    ) then
      raise exception 'As sessões não batem com os procedimentos do pacote.' using errcode = 'P0001';
    end if;
    if (select coalesce(sum(round((s ->> 'preco')::numeric, 2)), 0) from jsonb_array_elements(p_sessoes) s) <> v_vendido then
      raise exception 'O rateio das sessões não fecha com o preço do pacote.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.client_packages
    (client_id, package_id, branch_id, purchased_at, expires_at, total_sessions, used_sessions,
     price, preco_tabela, desconto, sold_by)
  values (
    p_cliente, p_pacote, p_unidade, v_agora,
    case when v_pac.validity_days is null then null else v_agora + make_interval(days => v_pac.validity_days) end,
    v_pac.total_sessions, 0, v_vendido, round(v_pac.price, 2), v_desconto, p_ator
  ) returning id into v_cp;

  if p_sessoes is not null then
    insert into public.package_sessions (client_package_id, status, session_number, procedure_id, preco)
    select v_cp, 'AVAILABLE', n::int, (s ->> 'procedure_id')::uuid, round((s ->> 'preco')::numeric, 2)
      from jsonb_array_elements(p_sessoes) with ordinality as t(s, n);
  else
    insert into public.package_sessions (client_package_id, status, session_number, procedure_id)
    select v_cp, 'AVAILABLE', row_number() over (order by i.sort_order, g)::int, i.procedure_id
      from public.service_package_items i
      cross join lateral generate_series(1, i.quantity) g
     where i.package_id = p_pacote;
  end if;

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb))
  loop
    insert into public.financial_transactions
      (branch_id, client_id, client_package_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by)
    values (
      p_unidade, p_cliente, v_cp, 'INCOME', 'Serviços', 'Pacote — ' || v_pac.name,
      round((v_l ->> 'amount')::numeric, 2),
      nullif(v_l ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_l ->> 'is_paid')::boolean, false),
      case when coalesce((v_l ->> 'is_paid')::boolean, false) then v_agora else null end,
      nullif(v_l ->> 'due_date', '')::timestamptz,
      nullif(v_l ->> 'notes', ''),
      coalesce(p_ator::text, 'sistema')
    ) returning id into v_tx;

    if jsonb_typeof(v_l -> 'parcelas') = 'array' then
      insert into public.installments (transaction_id, number, total, amount, due_date, is_paid)
      select v_tx, (p ->> 'number')::int, (p ->> 'total')::int, round((p ->> 'amount')::numeric, 2),
             (p ->> 'due_date')::timestamptz, false
        from jsonb_array_elements(v_l -> 'parcelas') p;
    end if;
  end loop;

  return v_cp;
end $$;

revoke execute on function public.pacote_vender(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.pacote_vender(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, numeric) to service_role;

-- ─── 2. Plano: o desconto rateado nos procedimentos, no checkout ─────────────
-- O preço de cada procedimento do plano passa a ser o VENDIDO: o contrato, as
-- sessões (appointments.price), a comissão e a fidelidade leem dele, e nenhum
-- precisa saber de desconto. O de antes fica em `preco_tabela`.
alter table public.treatment_plan_session_procedures
  add column if not exists preco_tabela numeric(12,2) check (preco_tabela >= 0);
comment on column public.treatment_plan_session_procedures.preco_tabela is
  'Preço do procedimento no plano ANTES do desconto do checkout (nulo = plano não fechado). price é o vendido.';

alter table public.treatment_plans
  add column if not exists desconto     numeric(12,2) not null default 0 check (desconto >= 0),
  add column if not exists desconto_por uuid references public.users(id) on delete set null;
comment on column public.treatment_plans.desconto is
  'Desconto do checkout, em reais, já rateado nos procedimentos (price = vendido, preco_tabela = antes).';

-- p_precos: [{ id, preco }] — um por procedimento do plano, o rateio que o app
-- calculou. Parte SEMPRE do preço de antes (coalesce(preco_tabela, price)):
-- aplicar de novo, depois de um checkout que falhou no meio, dá o mesmo
-- resultado, e desconto 0 devolve os preços originais.
create or replace function public.plano_aplicar_desconto(
  p_plano uuid, p_tenant uuid, p_ator uuid, p_desconto numeric, p_precos jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status   text;
  v_rede     uuid;
  v_subtotal numeric;
  v_desconto numeric := round(coalesce(p_desconto, 0), 2);
begin
  select tp.status, b.tenant_id into v_status, v_rede
    from public.treatment_plans tp
    join public.branches b on b.id = tp.branch_id
   where tp.id = p_plano
     for update of tp;
  if not found or v_rede is distinct from p_tenant then
    raise exception 'Plano não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'PROPOSED' then
    raise exception 'O desconto só se aplica no fechamento do plano.' using errcode = 'P0001';
  end if;

  select coalesce(sum(round(coalesce(p.preco_tabela, p.price), 2)), 0) into v_subtotal
    from public.treatment_plan_session_procedures p
    join public.treatment_plan_sessions s on s.id = p.session_id
   where s.plan_id = p_plano;

  if v_desconto < 0 or v_desconto > v_subtotal then
    raise exception 'O desconto não pode ser maior que o valor do plano.' using errcode = 'P0001';
  end if;

  -- Um preço para cada procedimento do plano, e nenhum de fora.
  if exists (
    select 1
      from (select p.id from public.treatment_plan_session_procedures p
              join public.treatment_plan_sessions s on s.id = p.session_id
             where s.plan_id = p_plano) plano
      full join (select (x ->> 'id')::uuid id from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) x) enviado
        on enviado.id = plano.id
     where plano.id is null or enviado.id is null
  ) or (select count(*) from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)))
       <> (select count(distinct (x ->> 'id')) from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) x) then
    raise exception 'Os preços não batem com os procedimentos do plano.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_precos) x
      join public.treatment_plan_session_procedures p on p.id = (x ->> 'id')::uuid
     where round((x ->> 'preco')::numeric, 2) < 0
        or round((x ->> 'preco')::numeric, 2) > round(coalesce(p.preco_tabela, p.price), 2)
  ) then
    raise exception 'Um procedimento ficou acima do preço do plano.' using errcode = 'P0001';
  end if;
  if (select coalesce(sum(round((x ->> 'preco')::numeric, 2)), 0) from jsonb_array_elements(p_precos) x)
     <> v_subtotal - v_desconto then
    raise exception 'O rateio do desconto não fecha com o valor do plano.' using errcode = 'P0001';
  end if;

  update public.treatment_plan_session_procedures p
     set preco_tabela = coalesce(p.preco_tabela, p.price),
         price        = round((x ->> 'preco')::numeric, 2)
    from jsonb_array_elements(p_precos) x
   where p.id = (x ->> 'id')::uuid;

  update public.treatment_plans
     set desconto     = v_desconto,
         desconto_por = case when v_desconto > 0 then p_ator else null end,
         updated_at   = now()
   where id = p_plano;
end $$;

revoke execute on function public.plano_aplicar_desconto(uuid, uuid, uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.plano_aplicar_desconto(uuid, uuid, uuid, numeric, jsonb) to service_role;

-- ─── 3. Fidelidade do plano: o total é o dos procedimentos do plano ─────────
-- Lia `treatment_plan_items`, tabela que nenhum código escreve desde que o
-- plano passou a ser por sessão: no modo "por procedimento" o plano de hoje
-- dava ZERO ponto. Agora o total e os pontos vêm das sessões — o mesmo total
-- da comissão, e já com o desconto (o preço é o vendido).
do $$
declare
  v_def text := pg_get_functiondef('public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
$a$    select coalesce(sum(i.unit_price * i.sessions), 0)
      into v_total
      from public.treatment_plan_items i
     where i.plan_id = p_tx.treatment_plan_id;$a$,
$b$    select coalesce(sum(p.price), 0)
      into v_total
      from public.treatment_plan_sessions s
      join public.treatment_plan_session_procedures p on p.session_id = s.id
     where s.plan_id = p_tx.treatment_plan_id;$b$);
  v_novo := replace(v_novo,
$a$      select coalesce(sum(coalesce(pr.loyalty_points, 0) * i.sessions), 0)
        into v_plano_pts
        from public.treatment_plan_items i
        join public.procedures pr on pr.id = i.procedure_id
       where i.plan_id = p_tx.treatment_plan_id
         and i.service_package_id is null;$a$,
$b$      select coalesce(sum(coalesce(pr.loyalty_points, 0)), 0)
        into v_plano_pts
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
        join public.procedures pr on pr.id = p.procedure_id
       where s.plan_id = p_tx.treatment_plan_id;$b$);
  if v_novo = v_def or v_novo like '%treatment_plan_items%' then
    raise exception 'fidelidade_pontos_do_pagamento: o trecho esperado não bateu';
  end if;
  execute v_novo;
end $$;

-- ─── 4. Avulso: o desconto dado na recepção ──────────────────────────────────
alter table public.financial_transactions
  add column if not exists sale_discount numeric(12,2) not null default 0 check (sale_discount >= 0);
comment on column public.financial_transactions.sale_discount is
  'Desconto COMERCIAL dado no recebimento do atendimento, em reais. O bruto é amount + loyalty_discount + sale_discount. Quem deu é created_by.';

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
  -- O desconto comercial: depois do voucher, antes dos pontos.
  v_dvenda    numeric := round(coalesce((p_dados ->> 'desconto_venda')::numeric, 0), 2);
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

  if v_pontos < 0 or v_desconto < 0 or v_final < 0 or v_dv < 0 or v_dvenda < 0 then
    raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
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
           is_paid          = true,
           paid_at          = v_agora,
           updated_at       = v_agora
     where id = v_tx;
  else
    insert into public.financial_transactions (
      branch_id, appointment_id, client_id, type, category, description,
      amount, loyalty_discount, sale_discount, payment_method, is_paid, paid_at, created_by
    ) values (
      v_unidade, p_agendamento, v_cliente, 'INCOME', 'Serviços', 'Atendimento concluído',
      v_final, v_desconto + v_dv, v_dvenda, v_metodo::public."PaymentMethod", true, v_agora,
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
    v_descricao := 'Pagamento confirmado' || coalesce(' via ' || v_metodo, '');
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

revoke execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;

-- A comissão do avulso: o desconto comercial sai sempre da base percentual.
do $$
declare
  v_def text := pg_get_functiondef('private.comissao_alvo(uuid)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
$a$  v_recebido  numeric;
begin$a$,
$b$  v_recebido  numeric;
  -- Desconto COMERCIAL da recepção (sale_discount): a venda foi mais barata,
  -- então sai da base percentual sempre — diferente do de pontos, que segue
  -- `base_com_pontos`. Não mexe em regra de valor fixo.
  v_dvenda    numeric := 0;
begin$b$);
  v_novo := replace(v_novo,
$a$           coalesce(f.loyalty_discount, 0),
           f.payment_method::text
      into v_pago, v_estornado, v_desconto, v_metodo$a$,
$b$           coalesce(f.loyalty_discount, 0),
           f.payment_method::text,
           coalesce(f.sale_discount, 0)
      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda$b$);
  v_novo := replace(v_novo,
$a$    else
      v_desconto := 0;
    end if;
    v_fracao := case$a$,
$b$    else
      v_desconto := 0;
      v_dvenda   := 0;
    end if;
    v_dvenda := coalesce(v_dvenda, 0);
    v_fracao := case$b$);
  v_novo := replace(v_novo,
$a$    v_base := v_l.preco - least(v_desconto, v_l.preco);$a$,
$b$    v_base := v_l.preco - least(v_desconto + v_dvenda, v_l.preco);$b$);
  if v_novo = v_def or (length(v_novo) - length(replace(v_novo, 'v_dvenda', ''))) / length('v_dvenda') < 6 then
    raise exception 'comissao_alvo: o trecho esperado não bateu';
  end if;
  execute v_novo;
end $$;

drop trigger if exists trg_comissoes_do_pagamento on public.financial_transactions;
create trigger trg_comissoes_do_pagamento
  after insert or update of is_paid, notes, amount, payment_method, loyalty_discount, sale_discount
  on public.financial_transactions
  for each row execute function private.comissoes_do_pagamento();

notify pgrst, 'reload schema';
