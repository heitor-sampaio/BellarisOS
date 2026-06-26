CREATE TABLE leads (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  branch_id   UUID         NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  phone       VARCHAR(30),
  email       VARCHAR(255),
  source      VARCHAR(60),   -- Instagram, Google, Indicação, WhatsApp, Site, Evento, Outro
  stage       VARCHAR(20)  NOT NULL DEFAULT 'NOVO',
  notes       TEXT,
  client_id   UUID         REFERENCES clients(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_branch   ON leads(branch_id);
CREATE INDEX idx_leads_stage    ON leads(stage);

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
