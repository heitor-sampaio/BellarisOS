-- A21 da 34ª simulação (princípio 3; AD-08: a gravação se lê pelo fato).
--
-- Ligar o agendamento à sessão do pacote fecha, no banco, o termo que o
-- agendamento gerou (`private.documentos_da_sessao_de_pacote`: "os documentos
-- são os do pacote"). A Auditoria lia a gravação como "Cancelou o documento
-- Termo… — Cliente", e a sessão sozinha como "Editou a sessão do pacote
-- (agendamento)", sem dizer se ligou ou desligou. Quem agiu estava certo (o
-- dono da gravação: a cliente que agendou pelo app, ou o membro).
--
-- O gatilho de package_sessions passa a guardar o `appointment_id` (só o id,
-- sem dado pessoal), antes e depois: com ele a frase diz "Agendou a sessão 1
-- do pacote X" ou "Desmarcou a sessão 1 do pacote X" (lib/auditoria/frase.ts).
-- A gravação de antes, só com o nome da coluna, segue lida pela gravação (a
-- sessão ligada com o documento fechado é o agendamento da sessão).

drop trigger if exists auditoria_ins on public.package_sessions;
drop trigger if exists auditoria_upd on public.package_sessions;
drop trigger if exists auditoria_del on public.package_sessions;
create trigger auditoria_ins after insert on public.package_sessions
  referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'status,appointment_id', 'client_packages:client_package_id', '');
create trigger auditoria_upd after update on public.package_sessions
  referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'status,appointment_id', 'client_packages:client_package_id', '');
create trigger auditoria_del after delete on public.package_sessions
  referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'status,appointment_id', 'client_packages:client_package_id', '');

notify pgrst, 'reload schema';
