-- "Outros custos" na calculadora de custos do procedimento.
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS other_costs NUMERIC(10,2) NOT NULL DEFAULT 0;
