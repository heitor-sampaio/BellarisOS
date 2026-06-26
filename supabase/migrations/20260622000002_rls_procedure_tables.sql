-- RLS para tabelas de procedimentos que ainda não tinham políticas

-- ── procedure_products ─────────────────────────────────────────────
ALTER TABLE procedure_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operacional lê insumos de procedimentos do tenant" ON procedure_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM procedures p
      WHERE p.id = procedure_products.procedure_id
        AND p.tenant_id::text = jwt_claim('tenant_id')
        AND jwt_claim('role') != 'CLIENT'
    )
  );

CREATE POLICY "Admin gerencia insumos de procedimentos" ON procedure_products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM procedures p
      WHERE p.id = procedure_products.procedure_id
        AND p.tenant_id::text = jwt_claim('tenant_id')
        AND jwt_claim('role') IN ('NETWORK_ADMIN', 'BRANCH_ADMIN')
    )
  );

-- ── procedure_branch_availability ──────────────────────────────────
ALTER TABLE procedure_branch_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operacional lê disponibilidade de procedimentos do tenant" ON procedure_branch_availability
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM procedures p
      WHERE p.id = procedure_branch_availability.procedure_id
        AND p.tenant_id::text = jwt_claim('tenant_id')
        AND jwt_claim('role') != 'CLIENT'
    )
  );

CREATE POLICY "Network admin gerencia disponibilidade por filial" ON procedure_branch_availability
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM procedures p
      WHERE p.id = procedure_branch_availability.procedure_id
        AND p.tenant_id::text = jwt_claim('tenant_id')
        AND jwt_claim('role') = 'NETWORK_ADMIN'
    )
  );
