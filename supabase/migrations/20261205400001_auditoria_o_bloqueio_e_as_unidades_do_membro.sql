-- A16 e A17 (plataforma:AD-13 e AD-21: a gravação se lê pelo FATO, com o de → para).
--
-- A16: o bloqueio da agenda saía "Criou o bloqueio da agenda", sem de quem.
-- O gatilho de `agenda_bloqueios` já guardava o início, o fim e o motivo; passa a
-- guardar também QUEM foi bloqueado (`professional_id`) ou a sala (`room_id`) —
-- ids, sem dado pessoal; o nome se lê na hora de mostrar (`lib/auditoria/leitura.ts`).
--
-- A17: a troca das unidades do membro saía "(outras unidades)", sem o de → para.
-- O gatilho de `users` guardava o cargo, a unidade principal e o ativo; passa a
-- guardar também `outras_unidades` (ids de unidade).
--
-- O que já foi gravado não muda (a auditoria é imutável); a leitura das gravações
-- de antes diz só o nome do campo.

drop trigger if exists auditoria_ins on public.agenda_bloqueios;
drop trigger if exists auditoria_upd on public.agenda_bloqueios;
drop trigger if exists auditoria_del on public.agenda_bloqueios;
create trigger auditoria_ins after insert on public.agenda_bloqueios referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'motivo,starts_at,ends_at,inicio,fim,professional_id,room_id', '', '');
create trigger auditoria_upd after update on public.agenda_bloqueios referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'motivo,starts_at,ends_at,inicio,fim,professional_id,room_id', '', '');
create trigger auditoria_del after delete on public.agenda_bloqueios referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'motivo,starts_at,ends_at,inicio,fim,professional_id,room_id', '', '');

drop trigger if exists auditoria_ins on public.users;
drop trigger if exists auditoria_upd on public.users;
drop trigger if exists auditoria_del on public.users;
create trigger auditoria_ins after insert on public.users referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'is_active,role_id,branch_id,outras_unidades', '', '');
create trigger auditoria_upd after update on public.users referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'is_active,role_id,branch_id,outras_unidades', '', '');
create trigger auditoria_del after delete on public.users referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'is_active,role_id,branch_id,outras_unidades', '', '');

notify pgrst, 'reload schema';
