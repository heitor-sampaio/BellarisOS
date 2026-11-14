-- MK1 (a revisão do Heitor, 2026-11-13: "mk1 ok"): a campanha é IMEDIATA ou
-- AGENDADA — numa data e hora (scheduled_at), ou todo ano numa data
-- (trigger_type = 'ANNUAL_DATE', trigger_config {month, day}). O tipo
-- "Automática" saiu: o aniversário, o lembrete do agendamento, o pós-visita e
-- o vencimento de pacote (e a confirmação, o cancelamento e os pontos) são
-- MODELOS desligados nas Automações (AU1).
--
-- As campanhas "Automáticas" que existissem: nenhuma no banco em 2026-11-14
-- (conferido antes de aplicar) — nada a converter. Se houvesse, o caminho
-- pelos princípios 6 e 3 seria arquivá-las (nada liga sozinho no lugar
-- delas, e a tela não mostraria um tipo que não existe mais); a de data
-- comemorativa viraria Agendada de todo ano, que é o mesmo comportamento.
-- Por segurança, a conversão vai aqui mesmo assim (zero linhas hoje):
update public.notification_campaigns
   set type = 'SCHEDULED', scheduled_at = null
 where type = 'AUTOMATED' and trigger_type = 'ANNUAL_DATE';
update public.notification_campaigns
   set status = 'ARCHIVED', type = 'SCHEDULED', trigger_type = null, trigger_config = null
 where type = 'AUTOMATED' or (trigger_type is not null and trigger_type <> 'ANNUAL_DATE');

-- O banco confere o que a action confere (lib/notifications/tipo-da-campanha).
alter table public.notification_campaigns
  add constraint notification_campaigns_tipo
  check (type in ('IMMEDIATE', 'SCHEDULED'));
alter table public.notification_campaigns
  add constraint notification_campaigns_gatilho
  check (trigger_type is null or (type = 'SCHEDULED' and trigger_type = 'ANNUAL_DATE'));

notify pgrst, 'reload schema';
