-- Disponibilidade de procedimentos por filial.
-- Sem linhas = disponível em toda a rede; com linhas = apenas nas filiais listadas.

CREATE TABLE procedure_branch_availability (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  branch_id    UUID NOT NULL REFERENCES branches(id)   ON DELETE CASCADE,
  UNIQUE(procedure_id, branch_id)
);

CREATE INDEX idx_pba_procedure ON procedure_branch_availability(procedure_id);
CREATE INDEX idx_pba_branch    ON procedure_branch_availability(branch_id);
