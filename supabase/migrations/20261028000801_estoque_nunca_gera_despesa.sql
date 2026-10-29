-- Movimentação de estoque NUNCA gera despesa (D13 revisto, decisão do Heitor,
-- 2026-10-28): "Movimentação de estoque, tanto entrada quanto saída, não gera
-- despesa. Os valores são informados apenas para base de cálculo de insumos,
-- custo, margem e lucro."
--
-- Desfaz o comportamento de 20261028000203 (estoque_compra: a "Entrada" com
-- "Lançar o custo como despesa paga hoje") e também a mesma opção do estoque
-- inicial do cadastro do produto (20261021000013): uma entrada é uma entrada,
-- pela porta que for. O custo continua no movimento (unit_cost), base do custo
-- de consumo, do giro e da margem.
--
-- estoque_inicial ganha a assinatura sem p_despesa/p_descricao. A antiga e
-- estoque_compra saem em 20261028000802, DEPOIS do deploy do app (o app no ar
-- ainda as chama até lá). Corpo de estoque_inicial a partir da
-- produção (estoque_compra ⇒ estoque_entrada, sem o insert da despesa).
-- Nenhum lançamento já gravado é mexido (registro financeiro não se apaga).

create or replace function public.estoque_inicial(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text, p_lote text,
  p_validade timestamp with time zone, p_autor text, p_minimo numeric
) returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_saldo numeric;
begin
  v_saldo := public.estoque_entrada(p_produto, p_unidade, p_quantidade, p_custo,
                                    p_observacao, p_lote, p_validade, p_autor);

  if p_minimo is not null then
    update public.branch_product_stock set min_stock = p_minimo, updated_at = now()
     where product_id = p_produto and branch_id = p_unidade;
  end if;

  return v_saldo;
end;
$function$;

revoke execute on function public.estoque_inicial(uuid, uuid, numeric, numeric, text, text, timestamp with time zone, text, numeric) from public, anon, authenticated;
grant execute on function public.estoque_inicial(uuid, uuid, numeric, numeric, text, text, timestamp with time zone, text, numeric) to service_role;

notify pgrst, 'reload schema';
