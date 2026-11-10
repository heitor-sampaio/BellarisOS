-- D2 da 10ª simulação (2026-11-10): o valor em estoque e o custo do consumo
-- usavam o ÚLTIMO custo de compra (products.cost_price, que toda entrada
-- reescreve), não o do lote. O Gel com 11,1 un a R$ 22 e 6 un a R$ 24 valia
-- 17,1 × 24; lançar uma entrada mais barata BAIXAVA o valor de tudo; a limpeza
-- que "sai do lote MA-2026-077" (R$ 18,50) gravava R$ 19,50. A perda e a venda
-- já iam pelo custo da entrada do lote. Agora a mesma régua vale para o
-- consumo e para o valor em estoque; sem lote (ou o lote sem custo), o último
-- custo, como antes.
--
-- 1. public.custo_do_lote(lote): o custo de UMA unidade de consumo do lote — o
--    do movimento de entrada ligado a ele (a compra, ou o ajuste de inventário
--    que o criou ou somou nele — D5); o lote que veio por transferência herda o
--    do lote de origem (o mesmo número e validade, na perna de saída). Nulo
--    quando não há.
-- 2. public.valor_do_saldo: o saldo coberto pelos lotes vale o custo de cada
--    um; o que nenhum lote cobre, o último custo. Se os lotes passam do saldo,
--    o saldo vale a média dos lotes. Deixa de ser IMMUTABLE (lê os lotes).
-- 3. on_stock_movement_lotes: a saída de CONSUMO (o insumo do atendimento,
--    PROCEDURE_USAGE) e o ajuste negativo (MANUAL_ADJUSTMENT) gravam o custo
--    dos lotes que o FEFO tirou — a mesma conta da perda sem lote escolhido; o
--    que nenhum lote cobre fica com o custo que o movimento trouxe. A
--    conclusão lê esse custo depois (os insumos da comissão), na mesma
--    transação. Os movimentos de antes não foram reescritos.

create or replace function public.custo_do_lote(p_lote uuid)
returns numeric
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_custo numeric;
  v_b     public.product_batches%rowtype;
  v_ref   text;
  v_orig  uuid;
begin
  select m.unit_cost into v_custo
    from public.stock_movement_batches smb
    join public.stock_movements m on m.id = smb.movement_id
   where smb.batch_id = p_lote and m.quantity > 0 and m.unit_cost is not null
     and m.type in ('PURCHASE', 'MANUAL_ADJUSTMENT')
   order by m.created_at, m.id
   limit 1;
  if v_custo is not null then
    return v_custo;
  end if;

  -- Veio por transferência: o custo do lote de origem.
  select b.* into v_b from public.product_batches b where b.id = p_lote;
  if not found then
    return null;
  end if;
  select m.reference into v_ref
    from public.stock_movement_batches smb
    join public.stock_movements m on m.id = smb.movement_id
   where smb.batch_id = p_lote and m.type = 'TRANSFER_IN'
   limit 1;
  if v_ref is null then
    return null;
  end if;
  select ob.id into v_orig
    from public.stock_movements o
    join public.stock_movement_batches osmb on osmb.movement_id = o.id
    join public.product_batches ob on ob.id = osmb.batch_id
   where o.type = 'TRANSFER_OUT' and o.reference = v_ref and o.product_id = v_b.product_id
     and ob.id <> p_lote
     and ob.batch_number is not distinct from v_b.batch_number
     and ob.expires_at is not distinct from v_b.expires_at
   limit 1;
  if v_orig is null then
    return null;
  end if;
  return public.custo_do_lote(v_orig);
end $function$;

create or replace function public.valor_do_saldo(s public.branch_product_stock, p public.products)
returns numeric
language sql
stable
set search_path to ''
as $function$
  with saldo as (
    select public.saldo_de_consumo(s, p) as cons, coalesce(public.custo_de_consumo(p), 0) as ultimo
  ), lotes as (
    select coalesce(sum(b.quantity * public.fator_de_consumo(p)), 0) as cons,
           coalesce(sum(b.quantity * public.fator_de_consumo(p)
                         * coalesce(public.custo_do_lote(b.id), public.custo_de_consumo(p), 0)), 0) as valor
      from public.product_batches b
     where b.product_id = s.product_id and b.branch_id = s.branch_id and b.quantity > 0
  )
  select coalesce(case
           when sd.cons is null then 0
           when sd.cons <= 0 or l.cons <= 0 then sd.cons * sd.ultimo
           when l.cons >= sd.cons then sd.cons * l.valor / l.cons
           else l.valor + (sd.cons - l.cons) * sd.ultimo
         end, 0)
    from saldo sd, lotes l
$function$;

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
  v_custo   numeric;
  v_soma    numeric := 0;   -- o custo das unidades de consumo que os lotes com custo cobriram
  v_coberto numeric := 0;   -- quantas unidades de consumo eles cobriram
  v_total   numeric;
  v_resto   numeric;
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
  v_fator  := coalesce(v_fator, 1);
  v_pedido := -new.quantity / v_fator;

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
      v_custo := public.custo_do_lote(v_alvo);
      if v_custo is not null then
        v_soma := v_soma + v_tira * v_fator * v_custo;
        v_coberto := v_coberto + v_tira * v_fator;
      end if;
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
    v_custo := public.custo_do_lote(v_lote.v_id);
    if v_custo is not null then
      v_soma := v_soma + v_tira * v_fator * v_custo;
      v_coberto := v_coberto + v_tira * v_fator;
    end if;
  end loop;

  -- D2 da 10ª: o consumo e o ajuste negativo ao custo dos lotes de onde saíram
  -- (a perda e a venda já gravam o delas); o resto, o custo que veio no movimento.
  if new.type in ('PROCEDURE_USAGE', 'MANUAL_ADJUSTMENT') and v_coberto > 0 then
    v_total := -new.quantity;
    v_resto := greatest(v_total - v_coberto, 0);
    update public.stock_movements
       set unit_cost = (v_soma + v_resto * coalesce(new.unit_cost,
                          (select public.custo_de_consumo(p) from public.products p where p.id = new.product_id), 0))
                       / (v_coberto + v_resto)
     where id = new.id;
  end if;

  return new;
end
$function$;

notify pgrst, 'reload schema';
