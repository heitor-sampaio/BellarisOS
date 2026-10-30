-- No app da cliente aparece só o arquivo que a clínica ENVIA (decisão do
-- Heitor, 2026-10-30). Desde f1f2fae toda foto clínica anexada no atendimento
-- entrava em client_documents e chegava sozinha ao Histórico do portal.
--
-- A marca é por arquivo: quando, quem (users.id, sem chave estrangeira — o
-- registro sobrevive ao membro, como apagado_por) e o nome de quem (o do ctx,
-- com a marca "via suporte"). Nula = só a equipe vê.
--
-- A tabela continua sem política permissiva (só o servidor lê e grava) e com
-- as restritivas do suporte: colunas novas não mudam isso.

alter table public.client_documents
  add column if not exists enviado_em       timestamptz,
  add column if not exists enviado_por      uuid,
  add column if not exists enviado_por_nome text;

comment on column public.client_documents.enviado_em is
  'Quando a clínica enviou o arquivo ao app da cliente. Nulo = só a equipe vê.';

-- Os de antes: o conservador é que NÃO apareçam até alguém enviar — menos o
-- termo/contrato assinado anexado (o que ela assinou conta como enviado).
-- Na produção, em 2026-10-30: 2 arquivos (duas fotos clínicas) ficam ocultos,
-- 0 termos/contratos anexados.
update public.client_documents
   set enviado_em = created_at, enviado_por_nome = 'Assinado pela cliente'
 where enviado_em is null
   and apagado_em is null
   and category in ('termo_consentimento', 'contrato');

notify pgrst, 'reload schema';
