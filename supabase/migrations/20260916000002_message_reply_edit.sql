-- Responder e editar mensagem, como no WhatsApp.
--
-- `reply_to_external_id` guarda o id da mensagem citada NO PROVEDOR, não uma FK
-- para `messages.id`. A citada pode ser anterior à integração, ter sido apagada,
-- ou simplesmente nunca ter passado por aqui — uma FK transformaria qualquer um
-- desses casos numa mensagem recusada no insert, e perder a mensagem é pior do
-- que perder a citação.

alter table public.messages
  add column if not exists reply_to_external_id text,
  add column if not exists edited_at timestamptz;

comment on column public.messages.reply_to_external_id is
  'external_id da mensagem citada. Texto e nao FK de proposito: a citada pode ser anterior a integracao, ter sido apagada, ou nunca ter passado por aqui.';

comment on column public.messages.edited_at is
  'Quando o texto foi editado. Null = nunca editada. O conteudo atual fica em content; o WhatsApp so permite editar ate 15 minutos apos o envio.';

-- Parcial: só uma fração das mensagens é resposta, e é por conversa que a
-- citada é procurada na hora de montar a prévia.
create index if not exists messages_reply_to_idx
  on public.messages (conversation_id, reply_to_external_id)
  where reply_to_external_id is not null;
