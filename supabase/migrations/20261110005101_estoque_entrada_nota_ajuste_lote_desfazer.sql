-- Os atritos do Estoque da 10ª simulação (2026-11-10), da F51:
--
-- A37: a Entrada não tinha fornecedor nem nota estruturados (só Observações):
--      os dois papéis do Time B lançaram a compra à mão. O movimento de entrada
--      passa a guardar `fornecedor` e `nota_fiscal` — informação, como o
--      custo: a movimentação de estoque continua NUNCA gerando despesa (D13
--      revisto, o Heitor em 28/10). estoque_entrada ganha os dois (a de 8
--      argumentos fica, chamando a nova).
--
-- A38: (a) o ajuste a MENOS não escolhia o lote — desfazer duas entradas
--      erradas zerou o lote real AH-2026-0451 pelo FEFO. estoque_ajuste_com_lote
--      passa a aceitar o lote também no negativo: o movimento diz o lote em
--      `reference = 'lote:<id>'` e o gatilho do lote tira dele primeiro (como a
--      perda); sem lote, o FEFO de sempre.
--      (b) não havia como desfazer uma entrada lançada errada. "Desfazer
--      entrada" (estoque_desfazer_entrada) enquanto o lote dela não teve saída
--      nenhuma: um movimento de ENTRADA negativo (não é perda nem consumo: fica
--      fora de "Perdas no período" e do giro), que tira do lote dela; a
--      original fica marcada (`desfeita_em`, quem, o motivo e o movimento que a
--      desfez). Nada se apaga. A entrada sem lote só se desfaz quando o produto
--      não tem lote com saldo na unidade (senão o gatilho tiraria de um lote de
--      outra entrada). O último custo volta ao da entrada anterior quando era o
--      da desfeita.

alter table public.stock_movements
  add column if not exists fornecedor      text,
  add column if not exists nota_fiscal     text,
  add column if not exists desfeita_em     timestamp with time zone,
  add column if not exists desfeita_por    text,
  add column if not exists desfeita_motivo text,
  add column if not exists desfeita_pelo   uuid references public.stock_movements(id);

create index if not exists stock_movements_desfeita_pelo_idx
  on public.stock_movements (desfeita_pelo) where desfeita_pelo is not null;

-- 1. A entrada com o fornecedor e a nota (A37).
create or replace function public.estoque_entrada(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text,
  p_lote text, p_validade timestamp with time zone, p_autor text, p_fornecedor text, p_nota_fiscal text)
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
  v_mov          uuid;
  v_lote         uuid;
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

  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, fornecedor, nota_fiscal)
  values (p_unidade, p_produto, 'PURCHASE', p_quantidade * v_fator, coalesce(v_novo_rend, v_novo_saldo),
          p_custo / v_fator, p_observacao, p_autor,
          nullif(btrim(coalesce(p_fornecedor, '')), ''), nullif(btrim(coalesce(p_nota_fiscal, '')), ''))
  returning id into v_mov;

  update public.branch_product_stock
     set current_stock = v_novo_saldo, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  if nullif(btrim(coalesce(p_lote, '')), '') is not null or p_validade is not null then
    insert into public.product_batches (product_id, branch_id, batch_number, expires_at, quantity)
    values (p_produto, p_unidade, nullif(btrim(coalesce(p_lote, '')), ''), p_validade, p_quantidade)
    returning id into v_lote;
    insert into public.stock_movement_batches (movement_id, batch_id, quantity)
    values (v_mov, v_lote, p_quantidade);
  end if;

  if p_custo is not null and p_custo > 0 then
    update public.products set cost_price = p_custo, updated_at = now() where id = p_produto;
  end if;

  return v_novo_saldo;
end;
$function$;

revoke execute on function public.estoque_entrada(uuid, uuid, numeric, numeric, text, text, timestamp with time zone, text, text, text) from public, anon, authenticated;
grant execute on function public.estoque_entrada(uuid, uuid, numeric, numeric, text, text, timestamp with time zone, text, text, text) to service_role;

-- A de 8 argumentos (o estoque inicial, o Copilot, o leitor de código) chama a nova.
create or replace function public.estoque_entrada(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text,
  p_lote text, p_validade timestamp with time zone, p_autor text)
returns numeric
language sql
security definer
set search_path to 'public'
as $function$
  select public.estoque_entrada(p_produto, p_unidade, p_quantidade, p_custo, p_observacao, p_lote, p_validade, p_autor, null, null)
$function$;

-- 2. O ajuste a menos escolhe o lote (A38a). O corpo é o da 20261110004903,
--    com o lote também no negativo.
create or replace function public.estoque_ajuste_com_lote(
  p_produto uuid, p_unidade uuid, p_contagem numeric, p_em_consumo boolean, p_motivo text, p_autor text,
  p_lote uuid, p_lote_numero text, p_lote_validade timestamp with time zone)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p          public.products%rowtype;
  v_upp        numeric;
  v_saldo      numeric;
  v_rendimento numeric;
  v_rend_antes numeric;
  v_novo_rend  numeric;
  v_novas      numeric;
  v_delta      numeric;   -- na unidade do movimento (consumo, com unidade de consumo)
  v_delta_emb  numeric;   -- em embalagens (o lote)
  v_custo      numeric;
  v_mov        uuid;
  v_lote       uuid;
begin
  if p_contagem is null or p_contagem < 0 then
    raise exception 'Novo estoque não pode ser negativo.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Motivo do ajuste é obrigatório.' using errcode = 'P0001';
  end if;

  select * into v_p from public.products p where p.id = p_produto;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = v_p.tenant_id) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  v_upp := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_unidade, 0, 0)
  on conflict (product_id, branch_id) do nothing;

  select s.current_stock, s.current_rendimento into v_saldo, v_rendimento
    from public.branch_product_stock s
   where s.product_id = p_produto and s.branch_id = p_unidade
   for update;

  if v_upp is not null then
    v_rend_antes := coalesce(v_rendimento, coalesce(v_saldo, 0) * v_upp);
    v_novo_rend  := case when coalesce(p_em_consumo, false) then p_contagem else p_contagem * v_upp end;
    v_novas      := ceil(round(v_novo_rend / v_upp, 6));
    v_delta      := v_novo_rend - v_rend_antes;
    v_delta_emb  := v_delta / v_upp;
  else
    v_novas      := p_contagem;
    v_delta      := p_contagem - coalesce(v_saldo, 0);
    v_delta_emb  := v_delta;
  end if;

  -- O lote escolhido é desta unidade e deste produto (nos dois sentidos).
  if v_delta <> 0 and p_lote is not null then
    select b.id into v_lote
      from public.product_batches b
     where b.id = p_lote and b.product_id = p_produto and b.branch_id = p_unidade
     for update;
    if v_lote is null then
      raise exception 'Lote não encontrado nesta unidade.' using errcode = 'P0001';
    end if;
    if v_delta > 0 then
      v_custo := public.custo_do_lote(v_lote);
    end if;
  end if;
  if v_delta > 0 then
    v_custo := coalesce(v_custo, public.custo_de_consumo(v_p));
  end if;

  -- No negativo, o lote escolhido vai na referência: o gatilho do lote tira
  -- dele primeiro (A38 da 10ª), e o resto pelo FEFO, ao custo dos lotes.
  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference)
  values (p_unidade, p_produto, 'MANUAL_ADJUSTMENT', v_delta, coalesce(v_novo_rend, v_novas),
          case when v_delta > 0 then v_custo end, trim(p_motivo), p_autor,
          case when v_delta < 0 and v_lote is not null then 'lote:' || v_lote::text end)
  returning id into v_mov;

  -- O que a contagem achou a mais entra num lote (D5 da 10ª).
  if v_delta > 0 then
    if v_lote is not null then
      update public.product_batches set quantity = quantity + v_delta_emb where id = v_lote;
    else
      insert into public.product_batches (product_id, branch_id, batch_number, expires_at, quantity)
      values (p_produto, p_unidade, nullif(btrim(coalesce(p_lote_numero, '')), ''), p_lote_validade, v_delta_emb)
      returning id into v_lote;
    end if;
    insert into public.stock_movement_batches (movement_id, batch_id, quantity)
    values (v_mov, v_lote, v_delta_emb);
  end if;

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  -- O saldo de antes, na unidade da contagem (para o "de … para …").
  return case when v_upp is not null then
           case when coalesce(p_em_consumo, false) then v_rend_antes else round(v_rend_antes / v_upp, 4) end
         else coalesce(v_saldo, 0) end;
end $function$;

revoke execute on function public.estoque_ajuste_com_lote(uuid, uuid, numeric, boolean, text, text, uuid, text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.estoque_ajuste_com_lote(uuid, uuid, numeric, boolean, text, text, uuid, text, timestamp with time zone) to service_role;

-- 3. Desfazer a entrada enquanto o lote dela não teve saída (A38b).
create or replace function public.estoque_desfazer_entrada(p_tenant uuid, p_movimento uuid, p_motivo text, p_autor text)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_m          public.stock_movements%rowtype;
  v_p          public.products%rowtype;
  v_fator      numeric;
  v_upp        numeric;
  v_emb        numeric;   -- a entrada em embalagens
  v_lote       uuid;
  v_qtd_lote   numeric;
  v_ligada     numeric;
  v_saldo      numeric;
  v_rendimento numeric;
  v_novas      numeric;
  v_novo_rend  numeric;
  v_mov        uuid;
  v_custo      numeric;
begin
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Diga por que a entrada é desfeita.' using errcode = 'P0001';
  end if;

  select m.* into v_m
    from public.stock_movements m
    join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
   where m.id = p_movimento and m.type = 'PURCHASE' and m.quantity > 0
   for update of m;
  if not found then
    raise exception 'Entrada não encontrada.' using errcode = 'P0001';
  end if;
  if v_m.desfeita_em is not null then
    raise exception 'Esta entrada já foi desfeita.' using errcode = 'P0001';
  end if;

  select * into v_p from public.products p where p.id = v_m.product_id;
  v_fator := coalesce(public.fator_de_consumo(v_p), 1);
  v_upp   := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
  v_emb   := v_m.quantity / v_fator;

  -- O saldo travado antes do lote (a mesma ordem das outras funções de estoque).
  select s.current_stock, s.current_rendimento into v_saldo, v_rendimento
    from public.branch_product_stock s
   where s.product_id = v_m.product_id and s.branch_id = v_m.branch_id
   for update;

  select smb.batch_id, smb.quantity into v_lote, v_ligada
    from public.stock_movement_batches smb
   where smb.movement_id = v_m.id
   limit 1;

  if v_lote is not null then
    select b.quantity into v_qtd_lote from public.product_batches b where b.id = v_lote for update;
    if exists (select 1 from public.stock_movement_batches x where x.batch_id = v_lote and x.movement_id <> v_m.id)
       or round(coalesce(v_qtd_lote, 0), 6) <> round(v_ligada, 6) then
      raise exception 'O lote desta entrada já teve saída: corrija pelo Ajuste (inventário).' using errcode = 'P0001';
    end if;
  elsif exists (select 1 from public.product_batches b
                 where b.product_id = v_m.product_id and b.branch_id = v_m.branch_id and b.quantity > 0) then
    raise exception 'Esta entrada não tem lote, e o produto tem lotes com saldo nesta unidade: corrija pelo Ajuste (inventário).' using errcode = 'P0001';
  end if;

  v_novas := coalesce(v_saldo, 0) - v_emb;
  if round(v_novas, 6) < 0 then
    raise exception 'O saldo já não tem o que esta entrada trouxe: corrija pelo Ajuste (inventário).' using errcode = 'P0001';
  end if;
  v_novo_rend := case when v_upp is not null then coalesce(v_rendimento, coalesce(v_saldo, 0) * v_upp) - v_m.quantity end;
  if v_upp is not null then
    v_novas := ceil(round(v_novo_rend / v_upp, 6));
  end if;

  -- A ENTRADA ao contrário: fora de perda e de consumo. O gatilho do lote tira
  -- do lote dela (a referência).
  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference)
  values (v_m.branch_id, v_m.product_id, 'PURCHASE', -v_m.quantity, coalesce(v_novo_rend, v_novas), v_m.unit_cost,
          'Entrada desfeita: ' || btrim(p_motivo), p_autor,
          case when v_lote is not null then 'lote:' || v_lote::text end)
  returning id into v_mov;

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = v_m.product_id and branch_id = v_m.branch_id;

  update public.stock_movements
     set desfeita_em = now(), desfeita_por = p_autor, desfeita_motivo = btrim(p_motivo), desfeita_pelo = v_mov
   where id = v_m.id;

  -- O último custo era o desta entrada? Volta ao da entrada anterior que ficou.
  if v_m.unit_cost is not null and round(v_m.unit_cost * v_fator, 4) = round(coalesce(v_p.cost_price, -1), 4) then
    select m.unit_cost * v_fator into v_custo
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
     where m.product_id = v_m.product_id and m.type = 'PURCHASE' and m.quantity > 0
       and m.desfeita_em is null and m.unit_cost > 0 and m.id <> v_m.id
     order by m.created_at desc, m.id desc
     limit 1;
    if v_custo is not null then
      update public.products set cost_price = round(v_custo, 4), updated_at = now() where id = v_m.product_id;
    end if;
  end if;

  return v_novas;
end $function$;

revoke execute on function public.estoque_desfazer_entrada(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.estoque_desfazer_entrada(uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
