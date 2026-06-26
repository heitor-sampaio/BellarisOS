-- Overrides de preço e custo de mão de obra por filial
CREATE TABLE IF NOT EXISTS procedure_branch_pricing (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  branch_id    UUID NOT NULL REFERENCES branches(id)   ON DELETE CASCADE,
  price        NUMERIC(10, 2),   -- NULL = usa valor base do procedimento
  labor_cost   NUMERIC(10, 2),   -- NULL = usa valor base do procedimento
  UNIQUE(procedure_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_pbp_procedure ON procedure_branch_pricing(procedure_id);
CREATE INDEX IF NOT EXISTS idx_pbp_branch    ON procedure_branch_pricing(branch_id);

ALTER TABLE procedure_branch_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operacional lê overrides de preço do tenant" ON procedure_branch_pricing
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM procedures p
      WHERE p.id = procedure_branch_pricing.procedure_id
        AND p.tenant_id::text = jwt_claim('tenant_id')
        AND jwt_claim('role') != 'CLIENT'
    )
  );

CREATE POLICY "Network admin gerencia overrides de preço" ON procedure_branch_pricing
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM procedures p
      WHERE p.id = procedure_branch_pricing.procedure_id
        AND p.tenant_id::text = jwt_claim('tenant_id')
        AND jwt_claim('role') = 'NETWORK_ADMIN'
    )
  );
