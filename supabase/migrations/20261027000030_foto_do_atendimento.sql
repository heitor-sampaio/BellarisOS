-- A30 da simulação de 2026-10-27: a foto clínica entra pela tela do
-- ATENDIMENTO, ligada a ele. Até aqui só entrava por Clientes → Documentos →
-- "Foto clínica", fora do fluxo e sem saber de qual atendimento era.
--
-- O anexo continua sendo `client_documents` (o mesmo upload, o mesmo bucket
-- privado, as mesmas políticas — inclusive as restritivas do suporte:
-- suporte_sem_clinico e suporte_sem_escrita_*). Só ganha a ligação opcional.
-- Apagar o agendamento não apaga a foto: ela é do prontuário da cliente.

alter table public.client_documents
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null;

create index if not exists client_documents_appointment_idx
  on public.client_documents (appointment_id) where appointment_id is not null;

comment on column public.client_documents.appointment_id is
  'O atendimento em que o anexo foi feito (a foto clínica pela tela do atendimento, A30 de 2026-10-27). Nulo = anexado pela ficha.';

notify pgrst, 'reload schema';
