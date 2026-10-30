-- J-45 (simulação de 2026-10-28/29): o lote, a validade e o custo na tela.
--
-- 1. A entrada com VALIDADE e sem número de lote também guarda o lote. Antes
--    só o número criava a linha em product_batches: a validade digitada sumia,
--    e o cartão "Validade em 30 dias" nunca a via.
-- 2. A entrada fica LIGADA ao lote que criou (stock_movement_batches), como a
--    saída já ficava. É por essa ligação que a tela diz o custo do lote (o
--    custo do movimento de entrada) e o histórico diz de qual lote cada
--    movimento é. O lote continua sem custo próprio: o custo é o do movimento.
--
-- O resto da função é o de 20261027000011 (a entrada em embalagens, o
-- movimento em consumo, sem despesa — D13 revisto).

create or replace function public.estoque_entrada(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text,
  p_lote text, p_validade timestamp with time zone, p_autor text)
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

  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by)
  values (p_unidade, p_produto, 'PURCHASE', p_quantidade * v_fator, coalesce(v_novo_rend, v_novo_saldo),
          p_custo / v_fator, p_observacao, p_autor)
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

revoke execute on function public.estoque_entrada(uuid, uuid, numeric, numeric, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.estoque_entrada(uuid, uuid, numeric, numeric, text, text, timestamptz, text) to service_role;

notify pgrst, 'reload schema';
