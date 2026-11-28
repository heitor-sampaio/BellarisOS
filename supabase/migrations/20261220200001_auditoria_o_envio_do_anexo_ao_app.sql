-- D9 da 41ª simulação (plataforma: AD-13, "a gravação se lê pelo FATO";
-- decisão do Claude, 28/11).
--
-- "Enviar ao app" e "Tirar do app" da foto clínica gravam as mesmas colunas
-- (`enviado_em`, `enviado_por`, `enviado_por_nome`: preenchidas ao enviar,
-- nulas ao tirar), e o gatilho de `client_documents` era 'clinico' — só os
-- nomes das colunas. A Auditoria dizia o mesmo nos dois: "Editou o documento
-- da cliente (envio e quem enviou)".
--
-- O gatilho passa a guardar só o `enviado_em`, antes e depois: a DATA do envio
-- (nula quando não está no app), sem conteúdo nenhum do anexo — nem o nome, nem
-- o arquivo, nem quem enviou. Com ela a frase diz "Enviou ao app uma foto
-- clínica" / "Tirou do app uma foto clínica" (lib/auditoria/frase.ts). As
-- outras colunas seguem só pelo nome (o rótulo e a lista de valores não têm
-- mais nada). A gravação de antes, sem o valor, diz "Mudou o envio ao app".

drop trigger if exists auditoria_ins on public.client_documents;
drop trigger if exists auditoria_upd on public.client_documents;
drop trigger if exists auditoria_del on public.client_documents;
create trigger auditoria_ins after insert on public.client_documents
  referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'enviado_em', '', '');
create trigger auditoria_upd after update on public.client_documents
  referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'enviado_em', '', '');
create trigger auditoria_del after delete on public.client_documents
  referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'enviado_em', '', '');

notify pgrst, 'reload schema';
