-- Adiciona min_stock como referência padrão da rede no catálogo de produtos
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS min_stock NUMERIC(10, 4) NOT NULL DEFAULT 0;
