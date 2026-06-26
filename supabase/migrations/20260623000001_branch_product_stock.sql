-- Cria a tabela de estoque por filial.
-- O catálogo de produtos (products) é da rede; esta tabela rastreia
-- o saldo atual de cada produto em cada filial separadamente.

CREATE TABLE IF NOT EXISTS public.branch_product_stock (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID         NOT NULL REFERENCES public.products(id)  ON DELETE CASCADE,
  branch_id     UUID         NOT NULL REFERENCES public.branches(id)  ON DELETE CASCADE,
  current_stock NUMERIC(10,4) NOT NULL DEFAULT 0,
  min_stock     NUMERIC(10,4) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT branch_product_stock_unique UNIQUE (product_id, branch_id)
);

-- RLS
ALTER TABLE public.branch_product_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operacional acessa estoque da propria filial"
  ON public.branch_product_stock
  FOR ALL
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE b.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );
