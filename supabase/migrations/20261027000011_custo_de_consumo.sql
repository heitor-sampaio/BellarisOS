-- O custo do insumo é o da UNIDADE DE CONSUMO, e todo movimento de estoque
-- está nela (D1, D2, D3 e A39 da simulação de 2026-10-27; decisões do Heitor).
--
-- O que a simulação viu: 5 ml de ácido (frasco de 100 ml a R$ 90) gravados a
-- R$ 90 o ml — R$ 450 de consumo, giro de 18,8%, e a comissão com "descontar
-- insumos" descontaria R$ 450. A conclusão mandava o custo do FRASCO com a
-- quantidade em ml, e todo leitor fazia `coalesce(m.unit_cost, p.cost_price)`,
-- o preço da embalagem. A compra gravava 5 (frascos) e o consumo −5 com saldo
-- 495 (ml): o histórico do mesmo produto em duas unidades. A margem dos
-- relatórios (por faixa etária) ainda multiplicava pelo preço da embalagem
-- (−150%), e o valor em estoque contava frascos inteiros (R$ 450, e não
-- 495 ml × R$ 0,90).
--
-- A regra, UMA (estas funções), e quem a usa:
--   tem_unidade_de_consumo(p)  o produto conta em consumo (rende N por embalagem)
--   fator_de_consumo(p)        quanto a embalagem rende (sem unidade de consumo, 1)
--   custo_de_consumo(p)        cost_price ÷ fator — o custo de UMA unidade de consumo
--   saldo_de_consumo(s, p)     o saldo da unidade em consumo
--   valor_do_saldo(s, p)       saldo em consumo × custo de consumo
--   custo_do_movimento(m, p)   |quantidade| × (o custo do movimento, senão o de consumo)
--   metrics_custo_dos_procedimentos  insumos (ao custo de consumo) + mão de obra + outros
--
-- `products.cost_price` continua sendo o preço da EMBALAGEM (o cadastro e a
-- entrada falam de frascos). O saldo da unidade continua nas duas contas
-- (`current_stock` em embalagens, `current_rendimento` em consumo); o
-- MOVIMENTO — quantidade, saldo depois e custo unitário — passa a ser só em
-- consumo. O lote segue em embalagens: o gatilho converte.

-- ─── 1. A regra ─────────────────────────────────────────────────────────────

create or replace function public.tem_unidade_de_consumo(p public.products)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(p.units_per_package, 0) > 0 and nullif(btrim(p.consumption_unit), '') is not null
$$;

create or replace function public.fator_de_consumo(p public.products)
returns numeric language sql immutable set search_path = ''
as $$
  select case when public.tem_unidade_de_consumo(p) then p.units_per_package else 1 end
$$;

create or replace function public.custo_de_consumo(p public.products)
returns numeric language sql immutable set search_path = ''
as $$
  select p.cost_price / public.fator_de_consumo(p)
$$;

create or replace function public.saldo_de_consumo(s public.branch_product_stock, p public.products)
returns numeric language sql immutable set search_path = ''
as $$
  select case when public.tem_unidade_de_consumo(p)
              then coalesce(s.current_rendimento, s.current_stock * p.units_per_package)
              else s.current_stock end
$$;

create or replace function public.valor_do_saldo(s public.branch_product_stock, p public.products)
returns numeric language sql immutable set search_path = ''
as $$
  select coalesce(public.saldo_de_consumo(s, p) * public.custo_de_consumo(p), 0)
$$;

create or replace function public.custo_do_movimento(m public.stock_movements, p public.products)
returns numeric language sql immutable set search_path = ''
as $$
  select abs(m.quantity) * coalesce(m.unit_cost, public.custo_de_consumo(p), 0)
$$;

-- O custo de cada procedimento da rede: insumos ao custo de consumo (o do
-- cadastro do insumo; zerado, o custo gravado na receita do procedimento),
-- mais mão de obra e outros. A margem do dashboard e a dos relatórios saem
-- daqui — eram duas contas, e a dos relatórios usava a embalagem.
create or replace function public.metrics_custo_dos_procedimentos(p_tenant uuid)
returns table (procedure_id uuid, custo numeric, com_insumos boolean)
language sql stable set search_path = ''
as $$
  select pr.id,
         round(coalesce(pr.labor_cost, 0) + coalesce(pr.other_costs, 0) + coalesce(i.insumos, 0), 2),
         i.procedure_id is not null
    from public.procedures pr
    left join (
      select pp.procedure_id,
             sum(coalesce(pp.quantity, 0) * coalesce(nullif(public.custo_de_consumo(p), 0), pp.unit_cost, 0)) insumos
        from public.procedure_products pp
        left join public.products p on p.id = pp.product_id
       group by pp.procedure_id
    ) i on i.procedure_id = pr.id
   where pr.tenant_id = p_tenant
$$;

revoke all on function public.tem_unidade_de_consumo(public.products) from public, anon, authenticated;
revoke all on function public.fator_de_consumo(public.products) from public, anon, authenticated;
revoke all on function public.custo_de_consumo(public.products) from public, anon, authenticated;
revoke all on function public.saldo_de_consumo(public.branch_product_stock, public.products) from public, anon, authenticated;
revoke all on function public.valor_do_saldo(public.branch_product_stock, public.products) from public, anon, authenticated;
revoke all on function public.custo_do_movimento(public.stock_movements, public.products) from public, anon, authenticated;
revoke all on function public.metrics_custo_dos_procedimentos(uuid) from public, anon, authenticated;
grant execute on function public.tem_unidade_de_consumo(public.products) to service_role;
grant execute on function public.fator_de_consumo(public.products) to service_role;
grant execute on function public.custo_de_consumo(public.products) to service_role;
grant execute on function public.saldo_de_consumo(public.branch_product_stock, public.products) to service_role;
grant execute on function public.valor_do_saldo(public.branch_product_stock, public.products) to service_role;
grant execute on function public.custo_do_movimento(public.stock_movements, public.products) to service_role;
grant execute on function public.metrics_custo_dos_procedimentos(uuid) to service_role;

-- ─── 2. Os movimentos, em consumo ───────────────────────────────────────────

create or replace function public.estoque_entrada(p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text, p_lote text, p_validade timestamp with time zone, p_autor text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_saldo        numeric;
  v_minimo       numeric;
  v_rendimento   numeric;
  v_upp          numeric;
  v_fator        numeric;
  v_novo_saldo   numeric;
  v_novo_rend    numeric;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = 'P0001';
  end if;

  -- A entrada é em EMBALAGENS (5 frascos, a R$ 90 o frasco); o movimento, em
  -- consumo (500 ml, a R$ 0,90 o ml).
  select case when public.tem_unidade_de_consumo(p) then p.units_per_package end, public.fator_de_consumo(p)
    into v_upp, v_fator from public.products p where p.id = p_produto;
  v_fator := coalesce(v_fator, 1);

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_unidade, 0, 0)
  on conflict (product_id, branch_id) do nothing;

  select current_stock, min_stock, current_rendimento into v_saldo, v_minimo, v_rendimento
  from public.branch_product_stock
  where product_id = p_produto and branch_id = p_unidade
  for update;

  v_novo_saldo := coalesce(v_saldo, 0) + p_quantidade;
  v_rendimento := coalesce(v_rendimento, case when v_upp is not null then coalesce(v_saldo, 0) * v_upp end);
  v_novo_rend  := case when v_upp is not null and v_rendimento is not null then v_rendimento + p_quantidade * v_upp end;

  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by)
  values (p_unidade, p_produto, 'PURCHASE', p_quantidade * v_fator, coalesce(v_novo_rend, v_novo_saldo),
          p_custo / v_fator, p_observacao, p_autor);

  update public.branch_product_stock
     set current_stock = v_novo_saldo, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  if p_lote is not null and p_lote <> '' then
    insert into public.product_batches (product_id, branch_id, batch_number, expires_at, quantity)
    values (p_produto, p_unidade, p_lote, p_validade, p_quantidade);
  end if;

  if p_custo is not null and p_custo > 0 then
    update public.products set cost_price = p_custo, updated_at = now() where id = p_produto;
  end if;

  return v_novo_saldo;
end;
$function$;

create or replace function public.estoque_ajuste(p_produto uuid, p_unidade uuid, p_novo_saldo numeric, p_motivo text, p_autor text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_saldo      numeric;
  v_rendimento numeric;
  v_upp        numeric;
  v_consumido  numeric;
  v_novo_rend  numeric;
  v_rend_antes numeric;
begin
  if p_novo_saldo is null or p_novo_saldo < 0 then
    raise exception 'Novo estoque não pode ser negativo.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Motivo do ajuste é obrigatório.' using errcode = 'P0001';
  end if;

  select case when public.tem_unidade_de_consumo(p) then p.units_per_package end
    into v_upp from public.products p where p.id = p_produto;

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_unidade, 0, 0)
  on conflict (product_id, branch_id) do nothing;

  select current_stock, current_rendimento into v_saldo, v_rendimento
  from public.branch_product_stock
  where product_id = p_produto and branch_id = p_unidade
  for update;

  if v_upp is not null then
    v_rend_antes := coalesce(v_rendimento, coalesce(v_saldo, 0) * v_upp);
    v_consumido  := greatest(0, coalesce(v_saldo, 0) * v_upp - v_rend_antes);
    v_novo_rend  := greatest(0, p_novo_saldo * v_upp - v_consumido);
  end if;

  -- O ajuste é em embalagens (a contagem da prateleira); o movimento, em
  -- consumo: o que o saldo em consumo andou.
  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, notes, created_by)
  values (p_unidade, p_produto, 'MANUAL_ADJUSTMENT',
          case when v_upp is not null then v_novo_rend - v_rend_antes else p_novo_saldo - coalesce(v_saldo, 0) end,
          coalesce(v_novo_rend, p_novo_saldo), trim(p_motivo), p_autor);

  update public.branch_product_stock
     set current_stock = p_novo_saldo, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  return coalesce(v_saldo, 0);
end;
$function$;

create or replace function public.estoque_transferir(p_produto uuid, p_origem uuid, p_destino uuid, p_quantidade numeric, p_observacao text, p_autor text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_upp       numeric;
  v_de        numeric;
  v_de_rend   numeric;
  v_para      numeric;
  v_para_rend numeric;
  v_ref       text;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = 'P0001';
  end if;
  if p_origem = p_destino then
    raise exception 'Origem e destino devem ser filiais diferentes.' using errcode = 'P0001';
  end if;

  select case when public.tem_unidade_de_consumo(p) then p.units_per_package end
    into v_upp from public.products p where p.id = p_produto;

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_origem, 0, 0), (p_produto, p_destino, 0, 0)
  on conflict (product_id, branch_id) do nothing;
  perform 1 from public.branch_product_stock
   where product_id = p_produto and branch_id in (p_origem, p_destino)
   order by branch_id
     for update;

  select current_stock, current_rendimento into v_de, v_de_rend
    from public.branch_product_stock where product_id = p_produto and branch_id = p_origem;
  select current_stock, current_rendimento into v_para, v_para_rend
    from public.branch_product_stock where product_id = p_produto and branch_id = p_destino;
  v_de := coalesce(v_de, 0);
  v_para := coalesce(v_para, 0);

  if p_quantidade > v_de then
    raise exception 'Estoque insuficiente na filial de origem. Disponível: %', trim(to_char(v_de, 'FM999999990.###')) using errcode = 'P0001';
  end if;

  -- O saldo em consumo depois, dos dois lados (nulo quando o produto conta em embalagens).
  if v_upp is not null then
    v_de_rend   := greatest(0, coalesce(v_de_rend, v_de * v_upp) - p_quantidade * v_upp);
    v_para_rend := coalesce(v_para_rend, v_para * v_upp) + p_quantidade * v_upp;
  else
    v_de_rend := null; v_para_rend := null;
  end if;

  v_ref := 'TRANSFER-' || gen_random_uuid();
  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, notes, reference, created_by)
  values
    (p_origem,  p_produto, 'TRANSFER_OUT', -p_quantidade * coalesce(v_upp, 1), coalesce(v_de_rend, v_de - p_quantidade),
     case when p_observacao is null or p_observacao = '' then 'Transferência para filial destino.' else 'Transferência → destino. ' || p_observacao end,
     v_ref, p_autor),
    (p_destino, p_produto, 'TRANSFER_IN',   p_quantidade * coalesce(v_upp, 1), coalesce(v_para_rend, v_para + p_quantidade),
     case when p_observacao is null or p_observacao = '' then 'Transferência da filial de origem.' else 'Transferência ← origem. ' || p_observacao end,
     v_ref, p_autor);

  update public.branch_product_stock
     set current_stock = v_de - p_quantidade, current_rendimento = v_de_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_origem;
  update public.branch_product_stock
     set current_stock = v_para + p_quantidade, current_rendimento = v_para_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_destino;

  return jsonb_build_object('origem', v_de - p_quantidade, 'destino', v_para + p_quantidade);
end $function$;

-- O lote é em EMBALAGENS; toda saída vem em consumo e é convertida.
create or replace function public.on_stock_movement_lotes()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pedido  numeric;
  v_fator   numeric;
  v_lote    record;
  v_tira    numeric;
  v_novo    uuid;
begin
  if new.type = 'TRANSFER_IN' then
    for v_lote in
      select b.batch_number, b.expires_at, smb.quantity as v_qtd
      from public.stock_movements o
      join public.stock_movement_batches smb on smb.movement_id = o.id
      join public.product_batches b on b.id = smb.batch_id
      where o.type = 'TRANSFER_OUT'
        and o.reference = new.reference
        and o.product_id = new.product_id
    loop
      insert into public.product_batches (product_id, branch_id, batch_number, expires_at, quantity)
      values (new.product_id, new.branch_id, v_lote.batch_number, v_lote.expires_at, v_lote.v_qtd)
      returning id into v_novo;
      insert into public.stock_movement_batches (movement_id, batch_id, quantity)
      values (new.id, v_novo, v_lote.v_qtd);
    end loop;
    return new;
  end if;

  if new.quantity >= 0 then return new; end if;

  select public.fator_de_consumo(p) into v_fator from public.products p where p.id = new.product_id;
  v_pedido := -new.quantity / coalesce(v_fator, 1);

  for v_lote in
    select b.id as v_id, b.quantity as v_qtd
    from public.product_batches b
    where b.product_id = new.product_id
      and b.branch_id = new.branch_id
      and b.quantity > 0
    order by coalesce(b.expires_at < current_date, false),
             b.expires_at nulls last,
             b.received_at
    for update
  loop
    exit when v_pedido <= 0;
    v_tira := least(v_lote.v_qtd, v_pedido);
    update public.product_batches set quantity = quantity - v_tira where id = v_lote.v_id;
    insert into public.stock_movement_batches (movement_id, batch_id, quantity)
    values (new.id, v_lote.v_id, v_tira);
    v_pedido := v_pedido - v_tira;
  end loop;

  return new;
end
$function$;

-- O evento diz a unidade em que o movimento está.
create or replace function public.on_stock_movement()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tenant  uuid;
  v_produto text;
  v_unidade text;
begin
  select b.tenant_id into v_tenant
  from public.branches b where b.id = new.branch_id;
  if v_tenant is null then return new; end if;

  select p.name, case when public.tem_unidade_de_consumo(p) then p.consumption_unit else p.unit end
    into v_produto, v_unidade
  from public.products p where p.id = new.product_id;

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
  values (
    v_tenant, new.branch_id, 'estoque.movimentado', 'estoque', new.product_id,
    jsonb_build_object(
      'produtoId', new.product_id, 'produtoNome', v_produto, 'unidade', v_unidade,
      'tipo', new.type::text, 'quantidade', new.quantity,
      'saldoApos', new.balance_after, 'observacao', new.notes
    ),
    'sistema', 'banco', 'estoque.movimentado:' || new.id, coalesce(new.created_at, now())
  )
  on conflict (tenant_id, chave) where chave is not null do nothing;

  return new;
end
$function$;

-- A entrega do produto de um voucher: o custo do movimento é o de consumo,
-- lido aqui (o app mandava o da embalagem).
create or replace function public.entregar_voucher_produto(p_tenant uuid, p_voucher uuid, p_unidade uuid, p_ator text, p_dados jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

-- A conclusão: o custo do insumo é o de consumo, lido AQUI (o app mandava o
-- preço da embalagem), e o insumo da comissão é a conta de custo_do_movimento.
create or replace function public.concluir_atendimento(p_agendamento uuid, p_tenant uuid, p_ator uuid, p_ator_nome text, p_dados jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_status     text;
  v_unidade    uuid;
  v_cliente    uuid;
  v_prof       uuid;
  v_rede       uuid;
  v_prontuario uuid;
  v_insumo     jsonb;
  v_sessao     uuid;
  v_pacote     uuid;
  v_unidade_pp uuid;
  v_venda_pp   uuid;
  v_linhas     jsonb := p_dados -> 'comissoes';
  v_linha      jsonb;
  v_cfg        public.commission_configs%rowtype;
  v_custo      numeric;
  v_soma_preco numeric;
  v_id         uuid;
  v_ids        uuid[] := '{}';
  v_item       int := 0;
begin
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

  for v_insumo in select * from jsonb_array_elements(coalesce(p_dados -> 'insumos', '[]'::jsonb))
  loop
    -- O saldo é o que o app leu ao calcular? (PT409 se não: ele relê e tenta de novo.)
    perform private.estoque_conferir_lido((v_insumo ->> 'produto')::uuid, v_unidade, v_insumo);
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
      (select public.custo_de_consumo(p) from public.products p where p.id = (v_insumo ->> 'produto')::uuid)
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

  select id, client_package_id into v_sessao, v_pacote
  from public.package_sessions
  where appointment_id = p_agendamento
  for update;
  if v_sessao is not null then
    update public.package_sessions set status = 'USED', used_at = now() where id = v_sessao;
    update public.client_packages set used_sessions = used_sessions + 1 where id = v_pacote;
  end if;

  -- Procedimento pré-pago: a unidade ligada a este agendamento é usada.
  select u.id, u.sale_id into v_unidade_pp, v_venda_pp
    from public.procedure_sale_units u
   where u.appointment_id = p_agendamento and u.status = 'DISPONIVEL'
     for update;
  if v_unidade_pp is not null then
    update public.procedure_sale_units set status = 'USADA', used_at = now() where id = v_unidade_pp;
  end if;

  if v_linhas is not null and jsonb_typeof(v_linhas) = 'array' and jsonb_array_length(v_linhas) > 0 then
    select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
    if not found then
      v_cfg.modo := 'ATENDIMENTO'; v_cfg.desconta_insumos := false; v_cfg.desconta_taxa := false;
      v_cfg.base_com_pontos := 'PRECO';
    end if;
    select coalesce(sum(public.custo_do_movimento(m, p)), 0) into v_custo
      from public.stock_movements m
      left join public.products p on p.id = m.product_id
     where m.appointment_id = p_agendamento and m.type = 'PROCEDURE_USAGE';
    select coalesce(sum((l ->> 'preco')::numeric), 0) into v_soma_preco from jsonb_array_elements(v_linhas) l;

    for v_linha in select * from jsonb_array_elements(v_linhas)
    loop
      insert into public.commission_lines
        (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
         client_package_id, procedure_sale_id, regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos,
         preco, custo_insumos)
      values (
        p_tenant, v_unidade, p_agendamento, v_item,
        nullif(v_linha ->> 'procedure_id', '')::uuid, v_prof,
        v_linha ->> 'origem', nullif(v_linha ->> 'treatment_plan_id', '')::uuid,
        case when v_linha ->> 'origem' = 'PACOTE' then v_pacote else null end,
        -- A venda do pré-pago: a da unidade deste agendamento, lida aqui.
        case when v_linha ->> 'origem' = 'PRE_PAGO' then v_venda_pp else null end,
        (v_linha ->> 'regra_tipo')::public."CommissionType", (v_linha ->> 'regra_valor')::numeric,
        v_cfg.modo, v_cfg.desconta_insumos, v_cfg.desconta_taxa, v_cfg.base_com_pontos,
        round((v_linha ->> 'preco')::numeric, 2),
        case when v_soma_preco > 0 then round(v_custo * (v_linha ->> 'preco')::numeric / v_soma_preco, 2)
             else round(v_custo / jsonb_array_length(v_linhas), 2) end
      )
      on conflict (appointment_id, item) do nothing
      returning id into v_id;
      if v_id is not null then
        v_ids := v_ids || v_id;
        perform private.comissao_acertar_linha(v_id, 'Atendimento concluído', null);
      end if;
      v_item := v_item + 1;
      v_id := null;
    end loop;
  end if;

  if p_ator is not null then
    insert into public.appointment_history
      (appointment_id, changed_by_id, changed_by_name, action, description)
    values (p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'COMPLETED', 'Atendimento concluído pelo profissional');
  end if;

  return jsonb_build_object(
    'comissao_criada', coalesce(array_length(v_ids, 1), 0) > 0,
    'pacote', v_pacote,
    'comissoes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'linha', cl.id, 'procedure_id', cl.procedure_id,
               'liberado', (select coalesce(sum(c.amount), 0) from public.commissions c where c.line_id = cl.id)
             ) order by cl.item), '[]'::jsonb)
        from public.commission_lines cl where cl.id = any (v_ids)
    )
  );
end
$function$;

-- ─── 3. Os indicadores ──────────────────────────────────────────────────────

create or replace function public.metrics_giro_estoque(p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 returns numeric
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(sum(public.custo_do_movimento(m, p)), 0)
  from public.stock_movements m
  left join public.products p on p.id = m.product_id
  where m.branch_id = any (p_branch_ids)
    and m.type = 'PROCEDURE_USAGE'
    and m.created_at between p_from and p_to;
$function$;

create or replace function public.metrics_valor_em_estoque(p_branch_ids uuid[])
 returns numeric
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(sum(public.valor_do_saldo(s, pr)), 0)
  from public.branch_product_stock s
  join public.products pr on pr.id = s.product_id
  where s.branch_id = any (p_branch_ids);
$function$;

-- O valor de cada produto em cada unidade — a coluna "Valor" da tela de
-- estoque, que multiplicava as embalagens pelo preço da embalagem na tela.
create or replace function public.metrics_valor_em_estoque_por_produto(p_branch_ids uuid[])
 returns table (product_id uuid, branch_id uuid, valor numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select s.product_id, s.branch_id, public.valor_do_saldo(s, pr)
  from public.branch_product_stock s
  join public.products pr on pr.id = s.product_id
  where s.branch_id = any (p_branch_ids);
$function$;
revoke all on function public.metrics_valor_em_estoque_por_produto(uuid[]) from public, anon, authenticated;
grant execute on function public.metrics_valor_em_estoque_por_produto(uuid[]) to service_role;

create or replace function public.metrics_margem_procedimentos(p_tenant uuid, p_limit integer default 5)
 returns table(procedure_id uuid, procedure_name text, price numeric, cost numeric, margin_pct numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with custos as (
    select pr.id, pr.name, round(coalesce(pr.price, 0), 2) as price, c.custo as cost
      from public.procedures pr
      join public.metrics_custo_dos_procedimentos(p_tenant) c on c.procedure_id = pr.id
     where pr.tenant_id = p_tenant and coalesce(pr.is_active, true) and coalesce(pr.price, 0) > 0
  )
  select id, name, price, cost, round((price - cost) / price * 100, 2)
    from custos
   order by (price - cost) / price desc, name
   limit greatest(1, least(coalesce(p_limit, 5), 100))
$function$;

create or replace function public.metrics_relatorio(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_prev_from timestamp with time zone, p_prev_to timestamp with time zone, p_aba text, p_granularidade text default 'day'::text)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  unidades uuid[];
  r jsonb := '{}'::jsonb;
begin
  select array_agg(b.id) into unidades
  from public.branches b
  where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids));
  unidades := coalesce(unidades, '{}');

  -- Dinheiro por unidade — visão geral e financeiro (atual e anterior).
  if p_aba in ('overview', 'financeiro') then
    r := r || jsonb_build_object(
      'receita_por_unidade', coalesce((
        select jsonb_agg(jsonb_build_object('branch_id', u.id, 'atual', coalesce(a.v, 0), 'anterior', coalesce(p.v, 0)))
        from unnest(unidades) as u(id)
        left join (select branch_id, sum(amount) v from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to) group by branch_id) a on a.branch_id = u.id
        left join (select branch_id, sum(amount) v from public.metrics_receitas_pagas(p_tenant, unidades, p_prev_from, p_prev_to) group by branch_id) p on p.branch_id = u.id
      ), '[]'::jsonb),
      'receita_por_forma', coalesce((
        select jsonb_agg(jsonb_build_object('forma', forma, 'valor', v))
        from (select payment_method forma, sum(amount) v
              from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to)
              where payment_method is not null group by payment_method) x
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'financeiro' then
    r := r || jsonb_build_object(
      'receita_por_categoria', coalesce((
        select jsonb_agg(jsonb_build_object('categoria', categoria, 'valor', v))
        from (select category categoria, sum(amount) v
              from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to)
              where category is not null group by category) x
      ), '[]'::jsonb)
    );
  end if;

  -- Consumo de insumos — a MESMA conta de metrics_giro_estoque (custo do
  -- movimento; sem ele, o de consumo do cadastro). Indicador gerencial: o
  -- gráfico de evolução não o soma à despesa (a compra já é despesa).
  if p_aba in ('overview', 'financeiro', 'estoque') then
    r := r || jsonb_build_object(
      'consumo_total', public.metrics_giro_estoque(unidades, p_from, p_to),
      'consumo_por_fatia', coalesce((
        select jsonb_agg(jsonb_build_object('chave', chave, 'valor', v))
        from (
          select case when p_granularidade = 'hour'
                   then extract(hour from m.created_at at time zone 'America/Sao_Paulo')::int::text
                   else to_char(m.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') end as chave,
                 sum(public.custo_do_movimento(m, pr)) v
          from public.stock_movements m
          left join public.products pr on pr.id = m.product_id
          where m.branch_id = any (unidades) and m.type = 'PROCEDURE_USAGE'
            and m.created_at between p_from and p_to
          group by 1
        ) x
      ), '[]'::jsonb)
    );
  end if;

  -- Atendimentos concluídos por procedimento e por profissional (receita =
  -- preço do atendimento, a serviceRevenue de metrics_core).
  if p_aba in ('overview', 'procedimentos', 'profissionais') then
    r := r || jsonb_build_object(
      'por_procedimento', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'categoria', categoria, 'receita', receita, 'execucoes', n))
        from (select pr.name nome, coalesce(pr.category, '—') categoria, sum(coalesce(a.price, 0)) receita, count(*) n
              from public.appointments a join public.procedures pr on pr.id = a.procedure_id
              where a.branch_id = any (unidades) and a.status = 'COMPLETED'
                and a.aconteceu_em between p_from and p_to
              group by pr.name, pr.category) x
      ), '[]'::jsonb),
      'por_profissional', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'receita', receita, 'atendimentos', n))
        from (select u.name nome, sum(coalesce(a.price, 0)) receita, count(*) n
              from public.appointments a join public.users u on u.id = a.professional_id
              where a.branch_id = any (unidades) and a.status = 'COMPLETED'
                and a.aconteceu_em between p_from and p_to
              group by u.name) x
      ), '[]'::jsonb)
    );
  end if;

  -- Agendamentos de qualquer status.
  if p_aba in ('overview', 'agenda') then
    r := r || jsonb_build_object(
      'agendamentos_por_status', coalesce((
        select jsonb_agg(jsonb_build_object('status', status, 'n', n))
        from (select a.status::text status, count(*) n from public.appointments a
              where a.branch_id = any (unidades) and a.aconteceu_em between p_from and p_to
              group by a.status) x
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'agenda' then
    r := r || jsonb_build_object(
      -- 0 = domingo, no fuso da clínica (weekdayTZ).
      'por_dia_da_semana', coalesce((
        select jsonb_agg(jsonb_build_object('dia', dia, 'n', n))
        from (select extract(dow from a.aconteceu_em at time zone 'America/Sao_Paulo')::int dia, count(*) n
              from public.appointments a
              where a.branch_id = any (unidades) and a.aconteceu_em between p_from and p_to
              group by 1) x
      ), '[]'::jsonb),
      'por_origem', coalesce((
        select jsonb_agg(jsonb_build_object('origem', origem, 'n', n))
        from (select a.source::text origem, count(*) n from public.appointments a
              where a.branch_id = any (unidades) and a.aconteceu_em between p_from and p_to
                and a.source is not null
              group by a.source) x
      ), '[]'::jsonb),
      'agenda_por_unidade', coalesce((
        select jsonb_agg(jsonb_build_object('branch_id', u.id, 'total', coalesce(x.total, 0),
                 'concluidos', coalesce(x.concluidos, 0), 'cancelados', coalesce(x.cancelados, 0),
                 'faltas', coalesce(x.faltas, 0)))
        from unnest(unidades) as u(id)
        left join (
          select a.branch_id, count(*) total,
                 count(*) filter (where a.status = 'COMPLETED') concluidos,
                 count(*) filter (where a.status = 'CANCELLED') cancelados,
                 count(*) filter (where a.status = 'NO_SHOW') faltas
          from public.appointments a
          where a.branch_id = any (unidades) and a.aconteceu_em between p_from and p_to
          group by a.branch_id
        ) x on x.branch_id = u.id
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'clientes' then
    r := r || (
      with ativos as (
        select c.id, c.name, c.gender, c.city, c.birth_date
        from public.clients c where c.tenant_id = p_tenant and c.is_active
      ),
      gasto as (
        select client_id, sum(amount) total
        from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to)
        where client_id is not null group by client_id
      ),
      atend as (
        select a.client_id, count(*) n from public.appointments a
        where a.branch_id = any (unidades) and a.status = 'COMPLETED'
          and a.aconteceu_em between p_from and p_to and a.client_id is not null
        group by a.client_id
      )
      select jsonb_build_object(
        'total_ativos', (select count(*) from ativos),
        'por_faixa', coalesce((select jsonb_agg(jsonb_build_object('faixa', f, 'n', n))
                               from (select public.metrics_faixa_etaria(birth_date) f, count(*) n
                                     from ativos where birth_date is not null group by 1) x), '[]'::jsonb),
        'por_genero', coalesce((select jsonb_agg(jsonb_build_object('genero', gender, 'n', n))
                                from (select gender, count(*) n from ativos where gender is not null group by gender) x), '[]'::jsonb),
        'cidades', coalesce((select jsonb_agg(jsonb_build_object('cidade', city, 'n', n) order by n desc, city)
                             from (select city, count(*) n from ativos where city is not null and city <> ''
                                   group by city order by n desc, city limit 10) x), '[]'::jsonb),
        'gasto_medio', coalesce((select avg(total) from gasto), 0),
        'top_clientes', coalesce((
          select jsonb_agg(jsonb_build_object('nome', coalesce(c.name, left(g.client_id::text, 8)),
                   'total', g.total, 'atendimentos', coalesce(at.n, 0)) order by g.total desc)
          from (select * from gasto order by total desc limit 10) g
          left join public.clients c on c.id = g.client_id
          left join atend at on at.client_id = g.client_id
        ), '[]'::jsonb)
      )
    );
  end if;

  if p_aba = 'procedimentos' then
    r := r || (
      -- Custo = insumos (ao custo de CONSUMO) + mão de obra + outros — a MESMA
      -- conta da margem do dashboard (metrics_custo_dos_procedimentos). Só
      -- existe para procedimento com insumo cadastrado (como a tela sempre
      -- considerou), e margem só com custo > 0.
      with custo as (
        select c.procedure_id, c.custo
          from public.metrics_custo_dos_procedimentos(p_tenant) c
         where c.com_insumos
      ),
      feitos as (
        select pr.name nome, public.metrics_faixa_etaria(c.birth_date) faixa,
               coalesce(a.price, 0) preco, cu.custo
        from public.appointments a
        join public.procedures pr on pr.id = a.procedure_id
        left join public.clients c on c.id = a.client_id
        left join custo cu on cu.procedure_id = a.procedure_id
        where a.branch_id = any (unidades) and a.status = 'COMPLETED'
          and a.aconteceu_em between p_from and p_to
      ),
      volume as (
        select coalesce(faixa, 'Não informado') faixa, nome, count(*) n,
               row_number() over (partition by coalesce(faixa, 'Não informado') order by count(*) desc, nome) pos
        from feitos group by 1, 2
      ),
      margem as (
        select coalesce(faixa, 'Não informado') faixa, nome,
               avg(case when preco > 0 then (preco - custo) / preco * 100 else 0 end) m,
               row_number() over (partition by coalesce(faixa, 'Não informado')
                                  order by avg(case when preco > 0 then (preco - custo) / preco * 100 else 0 end) desc, nome) pos
        from feitos where custo > 0 group by 1, 2
      )
      select jsonb_build_object(
        'tem_custos', exists (select 1 from custo),
        'volume_por_faixa', coalesce((select jsonb_agg(jsonb_build_object('faixa', faixa, 'nome', nome, 'n', n) order by faixa, pos)
                                      from volume where pos <= 3), '[]'::jsonb),
        'margem_por_faixa', coalesce((select jsonb_agg(jsonb_build_object('faixa', faixa, 'nome', nome, 'margem', m) order by faixa, pos)
                                      from margem where pos <= 3), '[]'::jsonb)
      )
    );
  end if;

  if p_aba = 'profissionais' then
    r := r || jsonb_build_object(
      -- O período da comissão é o do LANÇAMENTO (released_at) — o mesmo
      -- recorte de metrics_core e do fechamento.
      'comissoes_por_profissional', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'aberta', aberta, 'paga', paga))
        from (select u.name nome,
                     coalesce(sum(c.amount) filter (where c.status = 'OPEN'), 0) aberta,
                     coalesce(sum(c.amount) filter (where c.status = 'PAID'), 0) paga
              from public.commissions c
              join public.users u on u.id = c.professional_id
              where c.branch_id = any (unidades) and c.released_at between p_from and p_to
              group by u.name) x
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'estoque' then
    r := r || (
      -- O valor é o saldo em consumo × o custo de consumo (valor_do_saldo), a
      -- conta de metrics_valor_em_estoque. Crítico e zerado seguem em embalagens.
      with saldo as (
        select s.branch_id, s.current_stock, s.min_stock,
               public.valor_do_saldo(s, pr) valor, pr.category, pr.is_active
        from public.branch_product_stock s
        join public.products pr on pr.id = s.product_id
        where s.branch_id = any (unidades)
      )
      select jsonb_build_object(
        'valor_em_estoque', coalesce((select sum(valor) from saldo), 0),
        'criticos', (select count(*) from saldo where current_stock > 0 and min_stock > 0 and current_stock <= min_stock),
        'zerados',  (select count(*) from saldo where current_stock = 0 and is_active is distinct from false),
        'valor_por_categoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', category, 'valor', v))
                                         from (select category, sum(valor) v from saldo
                                               where category is not null group by category) x), '[]'::jsonb),
        'estoque_por_unidade', coalesce((
          select jsonb_agg(jsonb_build_object('branch_id', u.id, 'itens', coalesce(x.itens, 0),
                   'zerados', coalesce(x.zerados, 0), 'criticos', coalesce(x.criticos, 0), 'valor', coalesce(x.valor, 0)))
          from unnest(unidades) as u(id)
          left join (
            select branch_id, count(*) itens,
                   count(*) filter (where current_stock = 0 and is_active is distinct from false) zerados,
                   count(*) filter (where current_stock > 0 and min_stock > 0 and current_stock <= min_stock) criticos,
                   sum(valor) valor
            from saldo group by branch_id
          ) x on x.branch_id = u.id
        ), '[]'::jsonb),
        'mais_consumidos', coalesce((
          select jsonb_agg(jsonb_build_object('nome', nome, 'valor', v) order by v desc)
          from (select pr.name nome, sum(public.custo_do_movimento(m, pr)) v
                from public.stock_movements m join public.products pr on pr.id = m.product_id
                where m.branch_id = any (unidades) and m.type = 'PROCEDURE_USAGE'
                  and m.created_at between p_from and p_to
                group by pr.name order by 2 desc limit 10) x
        ), '[]'::jsonb)
      )
    );
  end if;

  return r;
end;
$function$;

-- ─── 4. Os movimentos já gravados ───────────────────────────────────────────
--
-- Conferido antes (2026-10-27, produção inteira): só a rede [sim] Clínica
-- Aurora tinha movimento de produto com unidade de consumo — duas compras em
-- frascos (5 e 3, a R$ 90 e R$ 650 o frasco) e um consumo de 5 ml a R$ 90 o
-- ml —, e uma linha de comissão com R$ 450 de insumo (a rede não desconta
-- insumos: o valor da comissão não muda). As compras eram o primeiro
-- movimento do produto, então o saldo em ml é o saldo em frascos × 100.
--
-- Movimento que não é consumo estava em embalagens: quantidade e saldo × o
-- rendimento. Todo custo gravado era o da embalagem: ÷ o rendimento.
do $$
declare
  v_consumos uuid[];
  v_acertar  uuid[];
  v_linha    uuid;
begin
  -- Os atendimentos cujo consumo tinha o custo da embalagem: a linha de
  -- comissão deles retrata esse custo.
  select coalesce(array_agg(distinct m.appointment_id), '{}') into v_consumos
    from public.stock_movements m
    join public.products p on p.id = m.product_id
   where public.tem_unidade_de_consumo(p) and p.units_per_package <> 1
     and m.type = 'PROCEDURE_USAGE' and m.appointment_id is not null;

  update public.stock_movements m
     set quantity      = case when m.type <> 'PROCEDURE_USAGE' then m.quantity * p.units_per_package else m.quantity end,
         balance_after = case when m.type <> 'PROCEDURE_USAGE' then m.balance_after * p.units_per_package else m.balance_after end,
         unit_cost     = m.unit_cost / p.units_per_package
    from public.products p
   where p.id = m.product_id
     and public.tem_unidade_de_consumo(p) and p.units_per_package <> 1;

  -- A linha refeita com o custo novo, o mesmo rateio da conclusão; onde a
  -- rede desconta insumos, o extrato acerta a diferença.
  with mov as (
    select m.appointment_id, coalesce(sum(public.custo_do_movimento(m, p)), 0) custo
      from public.stock_movements m
      left join public.products p on p.id = m.product_id
     where m.type = 'PROCEDURE_USAGE' and m.appointment_id = any (v_consumos)
     group by m.appointment_id
  ),
  lin as (
    select cl.id, cl.appointment_id, cl.preco,
           sum(cl.preco) over (partition by cl.appointment_id) soma,
           count(*)      over (partition by cl.appointment_id) qtd
      from public.commission_lines cl
     where cl.appointment_id = any (v_consumos)
  ),
  novo as (
    select lin.id,
           case when lin.soma > 0 then round(mov.custo * lin.preco / lin.soma, 2)
                else round(mov.custo / lin.qtd, 2) end custo
      from lin join mov on mov.appointment_id = lin.appointment_id
  ),
  feito as (
    update public.commission_lines cl set custo_insumos = novo.custo
      from novo
     where cl.id = novo.id and cl.custo_insumos is distinct from novo.custo
    returning cl.id, cl.desconta_insumos
  )
  select coalesce(array_agg(id) filter (where desconta_insumos), '{}') into v_acertar from feito;

  foreach v_linha in array v_acertar loop
    perform private.comissao_acertar_linha(v_linha, 'Custo do insumo corrigido (unidade de consumo)', null);
  end loop;
end $$;

notify pgrst, 'reload schema';
