-- Rastreamento de rendimento (unidades de consumo) por produto/filial.
-- current_rendimento = quantidade real em unidades de uso (ex: ml, UI, g).
-- current_stock continua sendo o número de embalagens (ceil(rendimento / units_per_package)).
-- Para produtos sem units_per_package, current_rendimento permanece NULL.

ALTER TABLE branch_product_stock
  ADD COLUMN IF NOT EXISTS current_rendimento DECIMAL(14,4) DEFAULT NULL;

-- Popula retroativamente para produtos que já têm units_per_package configurado
UPDATE branch_product_stock bps
SET current_rendimento = bps.current_stock * p.units_per_package
FROM products p
WHERE p.id = bps.product_id
  AND p.units_per_package IS NOT NULL
  AND p.units_per_package > 0
  AND bps.current_rendimento IS NULL;
