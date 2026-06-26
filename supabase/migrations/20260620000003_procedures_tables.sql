-- Catálogo de procedimentos da rede
CREATE TABLE IF NOT EXISTS procedures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id             UUID REFERENCES branches(id) ON DELETE CASCADE,  -- NULL = catálogo base da rede
  name                  TEXT NOT NULL,
  category              TEXT NOT NULL,
  description           TEXT,
  duration_min          INTEGER NOT NULL DEFAULT 60,
  price                 NUMERIC(10, 2) NOT NULL DEFAULT 0,
  visible_on_client_app BOOLEAN NOT NULL DEFAULT true,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procedures_tenant   ON procedures(tenant_id);
CREATE INDEX IF NOT EXISTS idx_procedures_branch   ON procedures(branch_id);
CREATE INDEX IF NOT EXISTS idx_procedures_category ON procedures(tenant_id, category);

-- Insumos consumidos por procedimento (base do consumo automático de estoque)
CREATE TABLE IF NOT EXISTS procedure_products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES procedures(id)  ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id)    ON DELETE CASCADE,
  quantity     NUMERIC(10, 4) NOT NULL DEFAULT 1,
  UNIQUE(procedure_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pp_procedure ON procedure_products(procedure_id);
CREATE INDEX IF NOT EXISTS idx_pp_product   ON procedure_products(product_id);

-- Histórico de alterações de preço
CREATE TABLE IF NOT EXISTS procedure_price_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  price        NUMERIC(10, 2) NOT NULL,
  changed_by   UUID REFERENCES auth.users(id),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pph_procedure ON procedure_price_history(procedure_id);
