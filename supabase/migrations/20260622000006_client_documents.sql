CREATE TABLE IF NOT EXISTS client_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id     UUID        NOT NULL REFERENCES branches(id),
  name          TEXT        NOT NULL,
  category      TEXT        NOT NULL DEFAULT 'outro',
  file_url      TEXT        NOT NULL,
  file_name     TEXT        NOT NULL,
  file_size     INTEGER,
  mime_type     TEXT,
  uploaded_by   UUID        REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_documents_client ON client_documents(client_id);
CREATE INDEX idx_client_documents_branch ON client_documents(branch_id);

-- RLS
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage client documents"
ON client_documents
FOR ALL
USING (
  branch_id IN (
    SELECT id FROM branches
    WHERE tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  )
);
