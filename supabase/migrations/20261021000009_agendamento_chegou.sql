-- O check-in vira um status próprio: "Chegou" (2026-10-21, decisão do Heitor;
-- atrito da simulação de um dia de clínica). Confirmar e fazer check-in
-- gravavam o MESMO status (CONFIRMED): a recepção não distinguia quem
-- confirmou presença de quem já está na sala de espera.
--
-- Agendado → Confirmado → Chegou (arrived_at) → Em atendimento. As funções
-- que listam status ganham o novo na migration seguinte (o valor novo de um
-- enum não se usa na mesma transação que o cria).

alter type public."AppointmentStatus" add value if not exists 'ARRIVED' after 'CONFIRMED';

alter table public.appointments add column if not exists arrived_at timestamptz;

notify pgrst, 'reload schema';
