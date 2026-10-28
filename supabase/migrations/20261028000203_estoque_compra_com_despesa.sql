-- A compra de estoque e a despesa dela numa transação, pelas DUAS portas
-- (D13 da simulação de 2026-10-28).
--
-- Só o cadastro do produto (estoque_inicial) oferecia "Lançar o custo como
-- despesa paga hoje"; a "Entrada" (unidade e rede) gravava só o movimento. No
-- Kobrasol entraram R$ 1.800 de insumo com despesa de R$ 0, enquanto o Centro
-- pagou R$ 4.500 pelo cadastro: o lucro diferia por um critério que ninguém
-- escolheu. Decisão do Heitor: a Entrada ganha a mesma opção, e a despesa nasce
-- na mesma transação do movimento.
--
-- estoque_compra = estoque_entrada + (se pedida e com custo) a despesa paga de
-- hoje, categoria Estoque, na unidade. estoque_inicial passa a usá-la (a regra
-- da despesa é uma só). Corpo de estoque_inicial a partir da produção.

create or replace function public.estoque_compra(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text,
  p_lote text, p_validade timestamp with time zone, p_autor text, p_despesa boolean, p_descricao text
) returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_saldo numeric;
begin
  v_saldo := public.estoque_entrada(p_produto, p_unidade, p_quantidade, p_custo, p_observacao, p_lote, p_validade, p_autor);

  if coalesce(p_despesa, false) and p_custo is not null and p_custo > 0 then
    insert into public.financial_transactions (branch_id, type, category, description, amount, is_paid, paid_at, notes, created_by)
    values (p_unidade, 'EXPENSE', 'Estoque', p_descricao, round(p_custo * p_quantidade, 2), true, now(),
            coalesce(p_observacao, 'Entrada de estoque'), p_autor);
  end if;

  return v_saldo;
end;
$function$;

create or replace function public.estoque_inicial(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text, p_lote text,
  p_validade timestamp with time zone, p_autor text, p_minimo numeric, p_despesa boolean, p_descricao text
) returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_saldo numeric;
begin
  v_saldo := public.estoque_compra(p_produto, p_unidade, p_quantidade, p_custo,
                                   p_observacao, p_lote, p_validade, p_autor,
                                   p_despesa, p_descricao);

  if p_minimo is not null then
    update public.branch_product_stock set min_stock = p_minimo, updated_at = now()
     where product_id = p_produto and branch_id = p_unidade;
  end if;

  return v_saldo;
end;
$function$;

revoke execute on function public.estoque_compra(uuid, uuid, numeric, numeric, text, text, timestamp with time zone, text, boolean, text) from public, anon, authenticated;
grant execute on function public.estoque_compra(uuid, uuid, numeric, numeric, text, text, timestamp with time zone, text, boolean, text) to service_role;

notify pgrst, 'reload schema';
