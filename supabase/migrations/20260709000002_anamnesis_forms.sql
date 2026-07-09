-- Construtor de fichas de anamnese: fichas por tenant, selecionáveis por procedimento.
CREATE TABLE IF NOT EXISTS anamnesis_forms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  schema     jsonb NOT NULL DEFAULT '{"fields":[]}'::jsonb,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anamnesis_forms_tenant ON anamnesis_forms(tenant_id);

-- Acesso somente via service_role (admin client), que ignora RLS.
-- RLS habilitado sem policy = bloqueado para anon/authenticated (defesa em profundidade).
ALTER TABLE anamnesis_forms ENABLE ROW LEVEL SECURITY;

-- Ficha selecionada ao criar/editar um procedimento (opcional).
ALTER TABLE procedures
  ADD COLUMN IF NOT EXISTS anamnesis_form_id uuid REFERENCES anamnesis_forms(id) ON DELETE SET NULL;
