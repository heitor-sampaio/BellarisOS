-- Fase 3 — KPIs comercial: atribuição de agendamentos.
-- (Aplicado no remoto via MCP. O ADD VALUE do enum roda isolado, fora desta transação.)

-- Novo valor de origem — carimba agendamentos criados por cargo comercial:
-- ALTER TYPE "AppointmentSource" ADD VALUE IF NOT EXISTS 'COMMERCIAL';  (aplicado via execute_sql isolado)

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES public.users(id);
CREATE INDEX IF NOT EXISTS appointments_created_by_idx ON public.appointments(created_by_id);
CREATE INDEX IF NOT EXISTS appointments_source_idx ON public.appointments(source);
