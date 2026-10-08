-- ENTRADA e AJUSTE de estoque numa transação só (2026-10-08, revisão do
-- Copilot). Eram três gravações soltas no app (ler o saldo → inserir o
-- movimento → gravar o saldo absoluto): duas entradas ao mesmo tempo (a tela e
-- o Copilot) perdiam uma no saldo, e uma falha no meio deixava movimento sem
-- saldo (CLAUDE.md §14). Aqui a linha do saldo é TRAVADA (for update) e o
-- movimento, o saldo, o lote e o custo vão juntos. Quem chama já conferiu a
-- rede do produto e da unidade (lib/estoque/movimentos.ts). Só service_role.

create or replace function public.estoque_entrada(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric,
  p_observacao text, p_lote text, p_validade timestamptz, p_autor text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo        numeric;
  v_minimo       numeric;
  v_rendimento   numeric;
  v_upp          numeric;
  v_novo_saldo   numeric;
  v_novo_rend    numeric;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = 'P0001';
  end if;

  select case when units_per_package is not null and consumption_unit is not null then units_per_package end
    into v_upp from public.products where id = p_produto;

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
  values (p_unidade, p_produto, 'PURCHASE', p_quantidade, v_novo_saldo, p_custo, p_observacao, p_autor);

  update public.branch_product_stock
     set current_stock = v_novo_saldo, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  if p_lote is not null and p_lote <> '' then
    insert into public.product_batches (product_id, branch_id, batch_number, expires_at, quantity)
    values (p_produto, p_unidade, p_lote, p_validade, p_quantidade);
  end if;

  -- O custo do produto passa a ser o desta compra (preço da última entrada).
  if p_custo is not null and p_custo > 0 then
    update public.products set cost_price = p_custo, updated_at = now() where id = p_produto;
  end if;

  return v_novo_saldo;
end;
$$;

create or replace function public.estoque_ajuste(
  p_produto uuid, p_unidade uuid, p_novo_saldo numeric, p_motivo text, p_autor text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo      numeric;
  v_rendimento numeric;
  v_upp        numeric;
  v_consumido  numeric;
  v_novo_rend  numeric;
begin
  if p_novo_saldo is null or p_novo_saldo < 0 then
    raise exception 'Novo estoque não pode ser negativo.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Motivo do ajuste é obrigatório.' using errcode = 'P0001';
  end if;

  select case when units_per_package is not null and consumption_unit is not null then units_per_package end
    into v_upp from public.products where id = p_produto;

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_unidade, 0, 0)
  on conflict (product_id, branch_id) do nothing;

  select current_stock, current_rendimento into v_saldo, v_rendimento
  from public.branch_product_stock
  where product_id = p_produto and branch_id = p_unidade
  for update;

  -- Preserva o consumo acumulado ao ajustar a quantidade de embalagens.
  -- Ex.: 100 frascos × 100ml/frasco = 10.000ml; disponível 9.999ml → consumido 1ml.
  -- Ajuste para 20 frascos → 2.000ml − 1ml consumido = 1.999ml disponíveis.
  if v_upp is not null and v_upp > 0 then
    v_consumido := greatest(0, coalesce(v_saldo, 0) * v_upp - coalesce(v_rendimento, coalesce(v_saldo, 0) * v_upp));
    v_novo_rend := greatest(0, p_novo_saldo * v_upp - v_consumido);
  end if;

  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, notes, created_by)
  values (p_unidade, p_produto, 'MANUAL_ADJUSTMENT', p_novo_saldo - coalesce(v_saldo, 0), p_novo_saldo, trim(p_motivo), p_autor);

  update public.branch_product_stock
     set current_stock = p_novo_saldo, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  return coalesce(v_saldo, 0);
end;
$$;

revoke execute on function public.estoque_entrada(uuid, uuid, numeric, numeric, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.estoque_entrada(uuid, uuid, numeric, numeric, text, text, timestamptz, text) to service_role;
revoke execute on function public.estoque_ajuste(uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.estoque_ajuste(uuid, uuid, numeric, text, text) to service_role;

notify pgrst, 'reload schema';
