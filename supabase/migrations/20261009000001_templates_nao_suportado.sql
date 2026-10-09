-- O template importado da Meta que o BellarisOS não sabe ENVIAR.
--
-- Conectar um número oficial puxa o catálogo inteiro da conta (a WABA) — e lá
-- há o que o nosso envio não monta: cabeçalho com imagem/vídeo/documento,
-- variáveis numeradas ({{1}}), botão de telefone/código/link com variável,
-- autenticação, carrossel. Eles entram para a tela mostrar a conta como ela é,
-- mas com o motivo aqui: o inbox não os oferece e a tela não os edita.
-- Nulo = o sistema envia.

alter table public.message_templates
  add column if not exists nao_suportado text;

comment on column public.message_templates.nao_suportado is
  'Por que o BellarisOS não envia este template (importado da Meta). Nulo = envia.';
