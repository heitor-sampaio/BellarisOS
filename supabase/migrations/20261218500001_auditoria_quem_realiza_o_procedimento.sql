-- A15 da 39ª simulação (2026-11-27), a Auditoria (AD-13, "a linha diz o fato";
-- decisão do Claude, 27/11): desmarcar uma pessoa de "Quem realiza" no
-- cadastro do procedimento saía "Apagou quem faz o procedimento", sem dizer
-- quem nem de qual procedimento. O gatilho de `procedure_professionals` não
-- guardava valor nenhum (a lista estava vazia) e, sem coluna `id`, nem o
-- registro. Passa a guardar `user_id` e `procedure_id` — só os ids; o nome da
-- pessoa e o do procedimento se leem na hora de mostrar
-- (`lib/auditoria/leitura.ts`) —, e a frase diz "Tirou Damião de quem realiza
-- Limpeza de pele" / "Marcou Damião em quem realiza Limpeza de pele"
-- (`lib/auditoria/frase.ts`). A chave da tabela (`procedure_id,user_id`) pareia
-- o antes e o depois de um UPDATE (a padrão, `id`, não existe aqui). A gravação
-- de antes desta migration não tem os ids e diz "uma pessoa" e "o
-- procedimento" (a auditoria não se altera).

drop trigger if exists auditoria_ins on public.procedure_professionals;
drop trigger if exists auditoria_upd on public.procedure_professionals;
drop trigger if exists auditoria_del on public.procedure_professionals;
create trigger auditoria_ins after insert on public.procedure_professionals
  referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'user_id,procedure_id', '', 'procedure_id,user_id');
create trigger auditoria_upd after update on public.procedure_professionals
  referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'user_id,procedure_id', '', 'procedure_id,user_id');
create trigger auditoria_del after delete on public.procedure_professionals
  referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'user_id,procedure_id', '', 'procedure_id,user_id');

notify pgrst, 'reload schema';
