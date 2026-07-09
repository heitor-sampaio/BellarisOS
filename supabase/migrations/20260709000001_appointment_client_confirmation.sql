-- Confirmação do atendimento pelo cliente (substitui a ficha de papel) + avaliações.
-- Inclui client_rating (nota do profissional) porque a migration anterior
-- (20260625000001) não chegou a ser aplicada neste projeto. IF NOT EXISTS torna
-- idempotente em bases que já a tenham.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS client_rating       SMALLINT CHECK (client_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS client_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS procedure_rating    SMALLINT CHECK (procedure_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS client_feedback     TEXT;

COMMENT ON COLUMN appointments.client_rating       IS 'Avaliação do profissional (1–5) deixada pelo cliente ao confirmar.';
COMMENT ON COLUMN appointments.client_confirmed_at IS 'Momento em que o cliente confirmou, pelo app, que o atendimento foi realizado (validação formal).';
COMMENT ON COLUMN appointments.procedure_rating    IS 'Avaliação do procedimento (1–5) deixada pelo cliente ao confirmar.';
COMMENT ON COLUMN appointments.client_feedback     IS 'Comentário livre opcional do cliente sobre o atendimento.';
