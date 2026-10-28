-- Anexo CLÍNICO não se deleta (CLAUDE.md §14: prontuário é soft delete).
--
-- Até aqui `deleteClientDocument` apagava a linha de client_documents e o
-- arquivo do bucket — o exame, o laudo, a foto clínica, a receita e o termo
-- sumiam sem rastro. Agora o clínico só é MARCADO: sai da ficha, da sessão do
-- atendimento e do portal, e a linha e o arquivo ficam, com quem apagou e
-- quando. O anexo comum (RG, comprovante) segue sendo apagado de verdade:
-- não é prontuário, e guardar cópia escondida de documento pessoal é o
-- contrário do que a LGPD pede.
--
-- `apagado_por` sem chave estrangeira, como em prontuario_acessos: o registro
-- sobrevive ao membro. O nome é o do ctx (leva a marca "via suporte").

alter table public.client_documents
  add column if not exists apagado_em       timestamptz,
  add column if not exists apagado_por      uuid,
  add column if not exists apagado_por_nome text;

comment on column public.client_documents.apagado_em is
  'Anexo clínico apagado pela tela (soft delete, 2026-10-27). Nulo = visível. O comum se apaga de verdade.';

notify pgrst, 'reload schema';
