-- D-7 (decisão do Heitor, 2026-10-29): a saída por PERDA — "com motivo
-- (vencido, quebrou, amostra, uso interno), sem gerar despesa, e um relatório
-- de perdas".
--
-- Até aqui a única saída manual era o AJUSTE (sobrescreve o saldo, sem dizer
-- por quê nem de qual lote), e a baixa ia pelo lote que vence primeiro: o
-- frasco VENCIDO que foi para o lixo ficava no estoque e saía o bom.
--
-- 1. stock_movements.motivo_da_perda (VENCIDO | QUEBROU | AMOSTRA |
--    USO_INTERNO), obrigatório no movimento LOSS.
-- 2. O gatilho do lote (on_stock_movement_lotes) passa a respeitar o lote
--    PEDIDO: o movimento com reference 'lote:<id>' tira daquele lote primeiro;
--    o que faltar segue o FEFO de sempre.
-- 3. estoque_perda: a perda numa transação, com a linha do saldo travada. A
--    quantidade é em EMBALAGENS (como a entrada, o ajuste e a transferência:
--    "0,5 frasco"); o movimento, em consumo (−50 UI). Não deixa sair mais do
--    que há (nem mais do que o lote tem). O custo é o da ENTRADA do lote (o
--    lote não guarda custo próprio); sem lote, o dos lotes que o FEFO vai
--    tirar, na proporção; sem lote nenhum, o custo de consumo do cadastro.
--    NUNCA gera despesa (D13 revisto): o custo serve ao relatório de perdas.
-- 4. metrics_perdas: o relatório — quantidade e custo por motivo e produto,
--    com o total de cada motivo e o geral (grouping sets), no período.
--
-- A perda não é consumo: fica fora do giro e do "insumo consumido" do lucro
-- (que só leem PROCEDURE_USAGE). Se ela deve descontar do lucro é decisão do
-- Heitor — por ora, não.

alter table public.stock_movements
  add column if not exists motivo_da_perda text;

alter table public.stock_movements drop constraint if exists stock_movements_motivo_da_perda_check;
alter table public.stock_movements
  add constraint stock_movements_motivo_da_perda_check check (
    (motivo_da_perda is null or motivo_da_perda in ('VENCIDO', 'QUEBROU', 'AMOSTRA', 'USO_INTERNO'))
    and (type <> 'LOSS' or motivo_da_perda is not null)
  );

-- 2. O lote pedido primeiro ------------------------------------------------
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
  v_alvo    uuid;
  v_qtd     numeric;
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

  -- O lote que a pessoa escolheu (a perda do frasco vencido): ele primeiro.
  if new.reference ~ '^lote:[0-9a-fA-F-]{36}$' then
    v_alvo := substring(new.reference from 6)::uuid;
    select b.quantity into v_qtd
      from public.product_batches b
     where b.id = v_alvo and b.product_id = new.product_id and b.branch_id = new.branch_id
       and b.quantity > 0
     for update;
    if found then
      v_tira := least(v_qtd, v_pedido);
      update public.product_batches set quantity = quantity - v_tira where id = v_alvo;
      insert into public.stock_movement_batches (movement_id, batch_id, quantity)
      values (new.id, v_alvo, v_tira);
      v_pedido := v_pedido - v_tira;
    end if;
  end if;

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
    values (new.id, v_lote.v_id, v_tira)
    on conflict (movement_id, batch_id) do update set quantity = public.stock_movement_batches.quantity + excluded.quantity;
    v_pedido := v_pedido - v_tira;
  end loop;

  return new;
end
$function$;

-- 3. A perda --------------------------------------------------------------
create or replace function public.estoque_perda(
  p_produto uuid, p_unidade uuid, p_lote uuid, p_quantidade numeric,
  p_motivo text, p_observacao text, p_autor text)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p          public.products%rowtype;
  v_upp        numeric;
  v_fator      numeric;
  v_saldo      numeric;
  v_rend       numeric;
  v_lote_qtd   numeric;
  v_custo      numeric;
  v_novo_rend  numeric;
  v_novas      numeric;
  v_falta      numeric;
  v_tira       numeric;
  v_soma       numeric := 0;
  v_peso       numeric := 0;
  v_l          record;
begin
  if p_motivo is null or p_motivo not in ('VENCIDO', 'QUEBROU', 'AMOSTRA', 'USO_INTERNO') then
    raise exception 'Escolha o motivo da perda.' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = 'P0001';
  end if;

  select * into v_p from public.products p where p.id = p_produto;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = v_p.tenant_id) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;

  v_upp   := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
  v_fator := public.fator_de_consumo(v_p);

  select s.current_stock, s.current_rendimento into v_saldo, v_rend
    from public.branch_product_stock s
   where s.product_id = p_produto and s.branch_id = p_unidade
   for update;
  if not found then
    raise exception 'Não há estoque deste produto nesta unidade.' using errcode = 'P0001';
  end if;

  -- O lote escolhido primeiro: "o lote tem só 2" diz mais que "o estoque tem 2".
  if p_lote is not null then
    select b.quantity into v_lote_qtd
      from public.product_batches b
     where b.id = p_lote and b.product_id = p_produto and b.branch_id = p_unidade
     for update;
    if not found then
      raise exception 'Lote não encontrado nesta unidade.' using errcode = 'P0001';
    end if;
    if p_quantidade > v_lote_qtd + 0.0001 then
      raise exception 'O lote tem só % %.', trim_scale(round(greatest(v_lote_qtd, 0), 2)), v_p.unit using errcode = 'P0001';
    end if;
  end if;

  if v_upp is not null then
    v_rend := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
    if p_quantidade * v_upp > v_rend + 0.0001 then
      raise exception 'Estoque insuficiente: há % % nesta unidade.',
        trim_scale(round(greatest(v_rend, 0) / v_upp, 2)), v_p.unit using errcode = 'P0001';
    end if;
    v_novo_rend := v_rend - p_quantidade * v_upp;
    v_novas     := ceil(round(v_novo_rend / v_upp, 6));
  else
    if p_quantidade > coalesce(v_saldo, 0) + 0.0001 then
      raise exception 'Estoque insuficiente: há % % nesta unidade.',
        trim_scale(round(greatest(coalesce(v_saldo, 0), 0), 2)), v_p.unit using errcode = 'P0001';
    end if;
    v_novas     := coalesce(v_saldo, 0) - p_quantidade;
    v_novo_rend := null;
  end if;

  if p_lote is not null then
    select m.unit_cost into v_custo
      from public.stock_movement_batches smb
      join public.stock_movements m on m.id = smb.movement_id
     where smb.batch_id = p_lote and m.type = 'PURCHASE' and m.unit_cost is not null
     limit 1;
  else
    -- Sem lote: o custo dos lotes que o FEFO vai tirar, na proporção.
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
    if v_peso > 0 then v_custo := v_soma / v_peso; end if;
  end if;
  v_custo := coalesce(v_custo, public.custo_de_consumo(v_p));

  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference, motivo_da_perda)
  values (
    p_unidade, p_produto, 'LOSS', -(p_quantidade * v_fator), coalesce(v_novo_rend, v_novas), v_custo,
    nullif(btrim(coalesce(p_observacao, '')), ''), coalesce(p_autor, 'sistema'),
    case when p_lote is not null then 'lote:' || p_lote end, p_motivo
  );

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  return v_novas;
end;
$function$;

revoke execute on function public.estoque_perda(uuid, uuid, uuid, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.estoque_perda(uuid, uuid, uuid, numeric, text, text, text) to service_role;

-- 4. O relatório de perdas -----------------------------------------------------
-- Uma linha por motivo × produto (quantidade na unidade do movimento, a
-- equivalência em embalagens e o custo), a linha de cada motivo (produto nulo:
-- o custo e os movimentos — quantidade de produtos diferentes não se soma) e a
-- geral (motivo nulo). O custo é o do movimento (custo_do_movimento).
create or replace function public.metrics_perdas(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
returns table (
  motivo text, product_id uuid, produto text, unidade text, embalagem text,
  quantidade numeric, embalagens numeric, custo numeric, movimentos bigint)
language sql
stable
set search_path to ''
as $function$
  select m.motivo_da_perda,
         m.product_id,
         case when grouping(m.product_id) = 0 then max(p.name) end,
         case when grouping(m.product_id) = 0 then max(case when public.tem_unidade_de_consumo(p) then p.consumption_unit else p.unit end) end,
         case when grouping(m.product_id) = 0 then max(p.unit) end,
         case when grouping(m.product_id) = 0 then sum(abs(m.quantity)) end,
         case when grouping(m.product_id) = 0 then round(sum(abs(m.quantity) / public.fator_de_consumo(p)), 4) end,
         round(coalesce(sum(public.custo_do_movimento(m, p)), 0), 2),
         count(*)
    from public.stock_movements m
    join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
    left join public.products p on p.id = m.product_id
   where m.type = 'LOSS'
     and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
     and m.created_at between p_from and p_to
   group by grouping sets ((m.motivo_da_perda, m.product_id), (m.motivo_da_perda), ())
$function$;

notify pgrst, 'reload schema';
