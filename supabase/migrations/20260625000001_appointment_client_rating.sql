-- Avaliação do cliente após atendimento (1–5 estrelas)
ALTER TABLE appointments
  ADD COLUMN client_rating SMALLINT CHECK (client_rating BETWEEN 1 AND 5);
