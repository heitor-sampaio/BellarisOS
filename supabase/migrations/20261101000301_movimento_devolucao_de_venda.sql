-- O tipo de movimento da DEVOLUÇÃO de uma venda de produto (H2, decisão do
-- Heitor, 2026-11-01: "estorno de produto precisa ter um campo para indicar se
-- houve devolução de produto ou não; se sim, produto volta ao estoque"), numa
-- migration só dele: o valor novo de um enum não pode ser usado na mesma
-- transação em que nasce (como LOSS e SALE em 20261029001303).
--   * SALE_RETURN — o produto da venda estornada que VOLTOU ao estoque, aos
--     lotes de onde a venda o tirou. Não é consumo: o giro e o "insumo
--     consumido" do lucro seguem só com PROCEDURE_USAGE.
alter type public."StockMovementType" add value if not exists 'SALE_RETURN';
