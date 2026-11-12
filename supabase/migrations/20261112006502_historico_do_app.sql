-- F65 (C15) — o que a CLIENTE faz pelo app fica no histórico do agendamento.
--
-- `appointment_history.changed_by_id` era obrigatório, e a cliente não é membro
-- (`users`): o "Agendamento criado" do app, o remarcado e o cancelado pela
-- cliente não se gravavam (o app pulava a linha sem `internalUserId`). Quem
-- fez segue no `changed_by_name` ("Fulana (app)"). Aditiva: só aceita o nulo.

alter table public.appointment_history alter column changed_by_id drop not null;
