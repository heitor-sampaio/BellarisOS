-- A30 da 32ª simulação (2026-11-26), a Auditoria (AD-15): o "Mudar de unidade"
-- do agendamento saía "Repassou o agendamento de X a Fulano (e editou: unidade
-- e sala)" — sem a unidade de origem nem a de destino. O gatilho de
-- `appointments` guardava, como valor (antes e depois), a situação, o horário,
-- o procedimento, quem atende, a sala, o preço e a duração; a unidade (a
-- coluna `branch_id`) entra na lista, e a frase diz "Mudou de unidade o
-- agendamento de X: de Chapecó para Passo Fundo" (`lib/auditoria/frase.ts`).
-- O registro de antes desta migration não tem a de origem: a frase diz só a de
-- destino. Decisão do Claude, 26/11.

drop trigger if exists auditoria_ins on public.appointments;
drop trigger if exists auditoria_upd on public.appointments;
drop trigger if exists auditoria_del on public.appointments;
create trigger auditoria_ins after insert on public.appointments
  referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'status,scheduled_at,procedure_id,professional_id,room_id,price,duration_minutes,branch_id', '', '');
create trigger auditoria_upd after update on public.appointments
  referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'status,scheduled_at,procedure_id,professional_id,room_id,price,duration_minutes,branch_id', '', '');
create trigger auditoria_del after delete on public.appointments
  referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'status,scheduled_at,procedure_id,professional_id,room_id,price,duration_minutes,branch_id', '', '');

notify pgrst, 'reload schema';
