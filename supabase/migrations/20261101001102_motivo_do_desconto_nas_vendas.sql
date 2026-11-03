-- fin-01 da revisão das decisões (2026-11-02): o motivo do desconto (texto
-- livre, opcional) existe em toda venda e aparece na lista do Financeiro.
--
-- As três vendas que gravam por função passam a ler `desconto_motivo` do
-- lançamento que o app montou (ele vem só no PRIMEIRO lançamento da venda).
-- O resto de cada corpo é o da produção em 2026-11-03, sem outra mudança.

CREATE OR REPLACE FUNCTION public.pacote_vender(p_tenant uuid, p_cliente uuid, p_pacote uuid, p_unidade uuid, p_ator uuid, p_lancamentos jsonb, p_sessoes jsonb DEFAULT NULL::jsonb, p_desconto numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_cfg      public.commission_configs%rowtype;
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
     price, preco_tabela, desconto, sold_by,
     comissao_venda_tipo, comissao_venda_valor, comissao_execucao, comissao_execucao_valor)
  values (
    p_cliente, p_pacote, p_unidade, v_agora,
    case when v_pac.validity_days is null then null else v_agora + make_interval(days => v_pac.validity_days) end,
    v_pac.total_sessions, 0, v_vendido, round(v_pac.price, 2), v_desconto, p_ator,
    v_pac.comissao_venda_tipo, v_pac.comissao_venda_valor, v_pac.comissao_execucao, v_pac.comissao_execucao_valor
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

  -- A comissão de VENDA, para quem vendeu: a linha nasce ANTES do dinheiro — o
  -- gatilho do lançamento já a acerta (à vista, na hora; a receber, ao entrar).
  if p_ator is not null and v_pac.comissao_venda_tipo is not null and coalesce(v_pac.comissao_venda_valor, 0) > 0 then
    select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, client_package_id)
    values (p_tenant, p_unidade, null, 0, null, p_ator, 'PACOTE_VENDA',
            v_pac.comissao_venda_tipo, v_pac.comissao_venda_valor, 'PAGAMENTO', false, coalesce(v_cfg.desconta_taxa, false),
            'PRECO', v_vendido, 0, v_cp);
  end if;

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb))
  loop
    insert into public.financial_transactions
      (branch_id, client_id, client_package_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes,
       desconto_motivo)
    values (
      p_unidade, p_cliente, v_cp, 'INCOME', 'Serviços', 'Pacote — ' || v_pac.name || coalesce(' — ' || nullif(v_l ->> 'sufixo', ''), ''),
      round((v_l ->> 'amount')::numeric, 2),
      nullif(v_l ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_l ->> 'is_paid')::boolean, false),
      case when coalesce((v_l ->> 'is_paid')::boolean, false) then v_agora else null end,
      nullif(v_l ->> 'due_date', '')::timestamptz,
      nullif(v_l ->> 'notes', ''),
      coalesce(p_ator::text, 'sistema'),
      nullif(v_l ->> 'parcela_numero', '')::int,
      nullif(v_l ->> 'parcela_total', '')::int,
      nullif(v_l ->> 'parcela_grupo', '')::uuid,
      nullif(v_l ->> 'cartao_vezes', '')::smallint,
      left(nullif(btrim(coalesce(v_l ->> 'desconto_motivo', '')), ''), 300)
    ) returning id into v_tx;

    if jsonb_typeof(v_l -> 'parcelas') = 'array' then
      insert into public.installments (transaction_id, number, total, amount, due_date, is_paid)
      select v_tx, (p ->> 'number')::int, (p ->> 'total')::int, round((p ->> 'amount')::numeric, 2),
             (p ->> 'due_date')::timestamptz, false
        from jsonb_array_elements(v_l -> 'parcelas') p;
    end if;
  end loop;

  return v_cp;
end $function$;

CREATE OR REPLACE FUNCTION public.procedimento_vender(p_tenant uuid, p_cliente uuid, p_procedimento uuid, p_unidade uuid, p_ator uuid, p_quantidade integer, p_desconto numeric, p_validade_dias integer, p_lancamentos jsonb, p_unidades jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_proc     public.procedures%rowtype;
  v_venda    uuid;
  v_tabela   numeric;
  v_desconto numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido  numeric;
  v_l        jsonb;
  v_tx       uuid;
  v_agora    timestamptz := now();
begin
  select * into v_proc from public.procedures p where p.id = p_procedimento and p.tenant_id = p_tenant;
  if not found then
    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
  if not coalesce(v_proc.is_active, true) then
    raise exception 'Este procedimento está desativado.' using errcode = 'P0001';
  end if;
  if v_proc.branch_id is not null and v_proc.branch_id <> p_unidade then
    raise exception 'Este procedimento é de outra unidade.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant) then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then
    raise exception 'Quantidade inválida (de 1 a 100).' using errcode = 'P0001';
  end if;
  if p_validade_dias is not null and (p_validade_dias < 1 or p_validade_dias > 3650) then
    raise exception 'Validade inválida.' using errcode = 'P0001';
  end if;

  v_tabela := round(coalesce(v_proc.price, 0), 2) * p_quantidade;
  if v_desconto < 0 or v_desconto > v_tabela then
    raise exception 'O desconto não pode ser maior que o valor da venda.' using errcode = 'P0001';
  end if;
  v_vendido := v_tabela - v_desconto;

  if (select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l) <> v_vendido then
    raise exception 'O pagamento não fecha com o valor da venda.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_unidades) <> 'array' or jsonb_array_length(p_unidades) <> p_quantidade
     or exists (select 1 from jsonb_array_elements(p_unidades) u where round((u ->> 'preco')::numeric, 2) < 0)
     or (select coalesce(sum(round((u ->> 'preco')::numeric, 2)), 0) from jsonb_array_elements(p_unidades) u) <> v_vendido then
    raise exception 'O rateio das unidades não fecha com o valor da venda.' using errcode = 'P0001';
  end if;

  insert into public.procedure_sales
    (tenant_id, branch_id, client_id, procedure_id, quantity, preco_unitario_tabela, preco_tabela,
     desconto, price, expires_at, sold_by, sold_at)
  values (
    p_tenant, p_unidade, p_cliente, p_procedimento, p_quantidade, round(coalesce(v_proc.price, 0), 2), v_tabela,
    v_desconto, v_vendido,
    case when p_validade_dias is null then null else v_agora + make_interval(days => p_validade_dias) end,
    p_ator, v_agora
  ) returning id into v_venda;

  insert into public.procedure_sale_units (sale_id, numero, preco)
  select v_venda, n::int, round((u ->> 'preco')::numeric, 2)
    from jsonb_array_elements(p_unidades) with ordinality as t(u, n);

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb))
  loop
    insert into public.financial_transactions
      (branch_id, client_id, procedure_sale_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes,
       desconto_motivo)
    values (
      p_unidade, p_cliente, v_venda, 'INCOME', 'Serviços',
      'Procedimento pré-pago — ' || p_quantidade || '× ' || v_proc.name || coalesce(' — ' || nullif(v_l ->> 'sufixo', ''), ''),
      round((v_l ->> 'amount')::numeric, 2),
      nullif(v_l ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_l ->> 'is_paid')::boolean, false),
      case when coalesce((v_l ->> 'is_paid')::boolean, false) then v_agora else null end,
      nullif(v_l ->> 'due_date', '')::timestamptz,
      nullif(v_l ->> 'notes', ''),
      coalesce(p_ator::text, 'sistema'),
      nullif(v_l ->> 'parcela_numero', '')::int,
      nullif(v_l ->> 'parcela_total', '')::int,
      nullif(v_l ->> 'parcela_grupo', '')::uuid,
      nullif(v_l ->> 'cartao_vezes', '')::smallint,
      left(nullif(btrim(coalesce(v_l ->> 'desconto_motivo', '')), ''), 300)
    ) returning id into v_tx;

    if jsonb_typeof(v_l -> 'parcelas') = 'array' then
      insert into public.installments (transaction_id, number, total, amount, due_date, is_paid)
      select v_tx, (p ->> 'number')::int, (p ->> 'total')::int, round((p ->> 'amount')::numeric, 2),
             (p ->> 'due_date')::timestamptz, false
        from jsonb_array_elements(v_l -> 'parcelas') p;
    end if;
  end loop;

  return v_venda;
end $function$;

CREATE OR REPLACE FUNCTION public.produto_vender(p_tenant uuid, p_cliente uuid, p_produto uuid, p_unidade uuid, p_ator uuid, p_quantidade integer, p_desconto numeric, p_lancamentos jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p          public.products%rowtype;
  v_cliente    text;
  v_upp        numeric;
  v_fator      numeric;
  v_saldo      numeric;
  v_rend       numeric;
  v_disponivel numeric;
  v_unit       numeric;
  v_tabela     numeric;
  v_desconto   numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido    numeric;
  v_falta      numeric;
  v_tira       numeric;
  v_soma       numeric := 0;
  v_peso       numeric := 0;
  v_custo_un   numeric;
  v_l          record;
  v_novo_rend  numeric;
  v_novas      numeric;
  v_venda      uuid;
  v_mov        uuid;
  v_cfg        public.commission_configs%rowtype;
  v_agora      timestamptz := now();
begin
  select * into v_p from public.products p where p.id = p_produto and p.tenant_id = p_tenant;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not coalesce(v_p.is_active, true) then
    raise exception 'Este produto está desativado.' using errcode = 'P0001';
  end if;
  if v_p.uso not in ('REVENDA', 'AMBOS') or v_p.sale_price is null or v_p.sale_price <= 0 then
    raise exception 'Este produto não é de revenda: marque o uso e o preço de venda no cadastro.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select c.name into v_cliente from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Cliente não encontrada: a venda de produto é para uma cliente cadastrada.' using errcode = 'no_data_found';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then
    raise exception 'Quantidade inválida (de 1 a 100).' using errcode = 'P0001';
  end if;

  v_unit   := round(v_p.sale_price, 2);
  v_tabela := v_unit * p_quantidade;
  if v_desconto < 0 or v_desconto > v_tabela then
    raise exception 'O desconto não pode ser maior que o valor da venda.' using errcode = 'P0001';
  end if;
  v_vendido := v_tabela - v_desconto;
  if (select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l) <> v_vendido then
    raise exception 'O pagamento não fecha com o valor da venda.' using errcode = 'P0001';
  end if;

  v_upp   := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
  v_fator := public.fator_de_consumo(v_p);
  select s.current_stock, s.current_rendimento into v_saldo, v_rend
    from public.branch_product_stock s
   where s.product_id = p_produto and s.branch_id = p_unidade
   for update;
  if v_upp is not null then
    v_rend       := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
    v_disponivel := floor(round(greatest(v_rend, 0) / v_upp, 6));
  else
    v_disponivel := floor(greatest(coalesce(v_saldo, 0), 0));
  end if;
  if p_quantidade > v_disponivel then
    raise exception 'Estoque insuficiente: há % % de % nesta unidade.',
      trim_scale(v_disponivel), v_p.unit, v_p.name using errcode = 'P0001';
  end if;

  v_falta := p_quantidade;
  for v_l in
    select b.id, b.quantity,
           (select m.unit_cost from public.stock_movement_batches smb
              join public.stock_movements m on m.id = smb.movement_id
             where smb.batch_id = b.id and m.type = 'PURCHASE' and m.unit_cost is not null limit 1) as custo
      from public.product_batches b
     where b.product_id = p_produto and b.branch_id = p_unidade and b.quantity > 0
     order by coalesce(b.expires_at < current_date, false), b.expires_at nulls last, b.received_at
  loop
    exit when v_falta <= 0;
    v_tira := least(v_l.quantity, v_falta);
    if v_l.custo is not null then
      v_soma := v_soma + v_tira * v_l.custo;
      v_peso := v_peso + v_tira;
    end if;
    v_falta := v_falta - v_tira;
  end loop;
  v_custo_un := case when v_peso > 0 then v_soma / v_peso else public.custo_de_consumo(v_p) end;

  insert into public.product_sales
    (tenant_id, branch_id, client_id, product_id, quantity, preco_unitario, preco_tabela, desconto, price,
     custo, sold_by, sold_at)
  values (p_tenant, p_unidade, p_cliente, p_produto, p_quantidade, v_unit, v_tabela, v_desconto, v_vendido,
          round(coalesce(v_custo_un, 0) * p_quantidade * v_fator, 2), p_ator, v_agora)
  returning id into v_venda;

  if v_upp is not null then
    v_novo_rend := v_rend - p_quantidade * v_upp;
    v_novas     := ceil(round(v_novo_rend / v_upp, 6));
  else
    v_novas     := coalesce(v_saldo, 0) - p_quantidade;
    v_novo_rend := null;
  end if;

  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference)
  values (p_unidade, p_produto, 'SALE', -(p_quantidade * v_fator), coalesce(v_novo_rend, v_novas), v_custo_un,
          'Venda — ' || v_cliente, coalesce(p_ator::text, 'sistema'), 'venda:' || v_venda)
  returning id into v_mov;

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  update public.product_sales set stock_movement_id = v_mov where id = v_venda;

  select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
  if p_ator is not null and coalesce(v_cfg.produto_pct, 0) > 0 then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, product_sale_id)
    values (p_tenant, p_unidade, null, 0, null, p_ator, 'PRODUTO',
            'PERCENTAGE', v_cfg.produto_pct, 'PAGAMENTO', false, coalesce(v_cfg.desconta_taxa, false), 'PRECO', v_vendido, 0, v_venda);
  end if;

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) as x(j)
  loop
    insert into public.financial_transactions
      (branch_id, client_id, product_sale_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes,
       desconto_motivo)
    values (
      p_unidade, p_cliente, v_venda, 'INCOME', 'Venda de produto',
      'Venda de produto — ' || p_quantidade || '× ' || v_p.name || coalesce(' — ' || nullif(v_l.j ->> 'sufixo', ''), ''),
      round((v_l.j ->> 'amount')::numeric, 2),
      nullif(v_l.j ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_l.j ->> 'is_paid')::boolean, false),
      case when coalesce((v_l.j ->> 'is_paid')::boolean, false) then v_agora else null end,
      nullif(v_l.j ->> 'due_date', '')::timestamptz,
      nullif(v_l.j ->> 'notes', ''),
      coalesce(p_ator::text, 'sistema'),
      nullif(v_l.j ->> 'parcela_numero', '')::int,
      nullif(v_l.j ->> 'parcela_total', '')::int,
      nullif(v_l.j ->> 'parcela_grupo', '')::uuid,
      nullif(v_l.j ->> 'cartao_vezes', '')::smallint,
      left(nullif(btrim(coalesce(v_l.j ->> 'desconto_motivo', '')), ''), 300)
    );
  end loop;

  return v_venda;
end;
$function$;

notify pgrst, 'reload schema';
