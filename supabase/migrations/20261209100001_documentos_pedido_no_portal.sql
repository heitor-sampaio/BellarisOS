-- D21 da 31ª simulação (documentos:DC-02; plataforma:AD-04 — entra na Auditoria
-- toda gravação que muda o que alguém FAZ). O "Pedir no portal" avisava a
-- cliente e gravava o evento `NOTIFICADO_PORTAL` em `issued_document_events`,
-- que fica fora da Auditoria de propósito (é andamento, migration
-- 20261116000001) — e o pedido não aparecia nela, enquanto o "Enviar link"
-- aparece (o link criado, `document_sign_links`, é auditado).
--
-- O pedido passa a marcar o documento: `pedido_no_portal_em`, o mais recente.
-- `issued_documents` já é auditada (o gatilho `auditoria_upd`): a coluna mudada
-- é a linha do pedido, com quem pediu (o ator da requisição) e quando. A linha
-- do documento na ficha lê o pedido do evento (o histórico de antes também), e
-- os pedidos de antes não ganham a marca: a Auditoria começa na migration dela
-- (plataforma.md, "Nenhuma linha antiga entrou").
--
-- Decisão do Claude, 26/11 (princípio 3; AD-04).

alter table public.issued_documents
  add column if not exists pedido_no_portal_em timestamptz;

comment on column public.issued_documents.pedido_no_portal_em is
  'O pedido de assinatura no portal mais recente ("Pedir no portal"). A marca é o que põe o pedido na Auditoria; o histórico dos pedidos é issued_document_events (NOTIFICADO_PORTAL).';

notify pgrst, 'reload schema';
