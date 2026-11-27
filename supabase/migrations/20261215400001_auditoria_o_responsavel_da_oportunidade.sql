-- A5 da 36ª simulação (2026-11-27), a Auditoria (AD-13; por analogia com a
-- AD-15, "Repassou o agendamento de X a Fulano" — decisão do Claude, 27/11): o
-- repasse da oportunidade (ao desativar um membro, ou a troca do responsável
-- no CRM) saía "Editou a oportunidade X (responsável)", sem dizer para quem.
-- O gatilho de `leads` guardava como valor só `status,stage_id,funnel_id`; o
-- responsável (`owner_id`, só o id do membro — o nome se lê na hora de
-- mostrar, `lib/auditoria/leitura.ts`) entra na lista, e a frase diz
-- "Repassou a oportunidade de X a Fulano" / "Deixou a oportunidade de X sem
-- responsável" (`lib/auditoria/frase.ts`). O nome, o telefone e o resto da
-- oportunidade continuam fora (minimização). A gravação de antes desta
-- migration não tem o valor e segue "Editou a oportunidade X (responsável)"
-- (a auditoria não se altera).
--
-- E a etapa: a lista dizia `stage_id,funnel_id`, que não existem em `leads` (a
-- coluna é `crm_stage_id`). Por isso "Mudou a etapa da oportunidade X" nunca
-- dizia "de A para B" (AD-21), embora a frase já leia `crm_stage_id`. A lista
-- passa a ter a coluna de verdade.

drop trigger if exists auditoria_ins on public.leads;
drop trigger if exists auditoria_upd on public.leads;
drop trigger if exists auditoria_del on public.leads;
create trigger auditoria_ins after insert on public.leads
  referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'status,crm_stage_id,owner_id', '', '');
create trigger auditoria_upd after update on public.leads
  referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'status,crm_stage_id,owner_id', '', '');
create trigger auditoria_del after delete on public.leads
  referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'status,crm_stage_id,owner_id', '', '');

notify pgrst, 'reload schema';
