-- A4 da 41ª simulação (DE-15: o termo que bloqueia libera o início quando
-- assinado; princípio 3). Depois da assinatura pelo link, o "Iniciar" da tela
-- do atendimento seguia desligado até recarregar: a tela assina os sinais da
-- agenda, do prontuário e do financeiro (a sessão só lê SINAIS, CLAUDE.md §4),
-- e nenhum se marcava na assinatura — `issued_documents` não tinha gatilho de
-- sinal.
--
-- O documento ligado a um atendimento passa a marcar o sinal da AGENDA (o que
-- a tela do atendimento já assina; a linha é da rede, sem conteúdo): na
-- emissão, na assinatura (pela tela, pelo link, pelo app ou no papel), no PDF
-- e na dispensa. O documento sem atendimento (o do plano, o do pacote) não
-- acorda a agenda. Os documentos não se apagam (são substituídos ou
-- dispensados): o gatilho é de insert e update.
--
-- O gatilho é o genérico `private.marcar_sinal` (20261128200001): a rede vem
-- da coluna tenant_id da linha.

drop trigger if exists trg_sinal_issued_documents_agenda on public.issued_documents;
create trigger trg_sinal_issued_documents_agenda
  after insert or update on public.issued_documents
  for each row
  when (new.appointment_id is not null)
  execute function private.marcar_sinal('agenda');

notify pgrst, 'reload schema';
