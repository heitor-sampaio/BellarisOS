-- Dois tipos novos de saída de estoque (D-7 e D4, decisões do Heitor,
-- 2026-10-29), numa migration só deles: o valor novo de um enum não pode ser
-- usado na mesma transação em que nasce.
--   * LOSS — a perda (vencido, quebrou, amostra, uso interno), pelo lote, sem
--     despesa;
--   * SALE — a venda de produto à cliente (a baixa da venda, pelo lote que
--     vence primeiro).
-- Nenhum dos dois é CONSUMO: o giro e o "insumo consumido" do lucro seguem só
-- com PROCEDURE_USAGE.
alter type public."StockMovementType" add value if not exists 'LOSS';
alter type public."StockMovementType" add value if not exists 'SALE';
