-- O atendimento com vários lançamentos vivos (decisões do Heitor de 2026-11-16:
-- a comanda em várias formas — "Ok" — e o crediário no avulso — "Mesma regra
-- de pagamentos dos outros").
--
-- A chave única por atendimento (20261028000201: um lançamento vivo, fora o
-- "Estornada") recusava a 2ª forma e as parcelas do crediário com 23505, e o
-- "Receber" da comanda não gravava nada. A trava contra pagar duas vezes não é
-- a chave: `confirmar_pagamento_do_atendimento` trava o agendamento
-- (`for update`) e recusa quando não falta nada a receber; as leituras do app
-- já tratam vários lançamentos (`limit(1)`, a lista da sessão).
--
-- Fica um índice comum para as buscas pelo atendimento.

drop index if exists public.financial_transactions_appointment_id_key;

create index if not exists financial_transactions_appointment_vivo
  on public.financial_transactions (appointment_id)
  where appointment_id is not null and coalesce(notes, '') <> 'Estornada';

notify pgrst, 'reload schema';
