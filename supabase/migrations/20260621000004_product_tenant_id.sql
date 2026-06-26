-- Adiciona tenant_id em products e torna branch_id nullable
-- products com branch_id = NULL são catálogo base da rede (NETWORK_ADMIN)

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Preenche tenant_id para produtos já existentes via branch
UPDATE products p
SET tenant_id = b.tenant_id
FROM branches b
WHERE p.branch_id = b.id
  AND p.tenant_id IS NULL;

-- Torna branch_id nullable (null = catálogo da rede)
ALTER TABLE products
  ALTER COLUMN branch_id DROP NOT NULL;

-- Agora tenant_id pode ser NOT NULL (todos os rows já têm valor)
ALTER TABLE products
  ALTER COLUMN tenant_id SET NOT NULL;

-- Índice para queries de catálogo por tenant
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);

-- ── RLS ──────────────────────────────────────────────────────────────
-- A policy anterior só permitia acesso por branch_id,
-- bloqueando NETWORK_ADMIN (que tem branch_id = null no JWT).

-- Remove a policy antiga que bloqueava NETWORK_ADMIN
DROP POLICY IF EXISTS "Operacional acessa estoque da filial" ON public.products;

-- Acesso por filial (BRANCH_ADMIN, RECEPTIONIST, PROFESSIONAL, FINANCIAL)
CREATE POLICY "Operacional acessa produtos da filial" ON public.products
  FOR ALL USING (
    branch_id::text = auth.jwt_claim('branch_id')
    AND auth.jwt_claim('role') NOT IN ('CLIENT', 'NETWORK_ADMIN')
  );

-- NETWORK_ADMIN acessa todos os produtos da rede por tenant_id
CREATE POLICY "Network admin acessa produtos da rede" ON public.products
  FOR ALL USING (
    tenant_id::text = auth.jwt_claim('tenant_id')
    AND auth.jwt_claim('role') = 'NETWORK_ADMIN'
  );
