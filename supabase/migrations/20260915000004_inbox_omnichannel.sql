-- Inbox omnichannel: identidade de contato genérica e mídia recebida.
--
-- O inbox só funcionava para WhatsApp. A conversa era identificada por TELEFONE,
-- e Instagram/Messenger não têm telefone — identificam por PSID/IGSID.
--
-- Padrão do banco: jwt_claim(...) em public, NUNCA auth.jwt_claim.
-- Idempotente: pode rodar de novo em clone/CI.

-- ------------------------------------------------- identidade do contato ----

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS contact_external_id text;

-- Toda conversa que existe hoje é de WhatsApp, onde a identidade é o telefone.
UPDATE public.conversations
SET contact_external_id = contact_phone
WHERE contact_external_id IS NULL AND contact_phone IS NOT NULL;

-- ⚠️ Índice TOTAL, não parcial — de propósito.
--
-- O que existia era `uniq_conversations_tenant_channel_phone ... WHERE
-- contact_phone IS NOT NULL`. O Postgres não infere ON CONFLICT a partir de
-- índice parcial sem repetir o mesmo predicado na instrução, e o PostgREST não
-- tem como mandar isso: dava `42P10`. Como o erro era descartado, o clique no
-- card do funil não fazia nada e a PRIMEIRA mensagem de um número novo era
-- descartada sem criar conversa (corrigido em 2729613, contornando o upsert).
-- Com índice total, ON CONFLICT volta a ser uma opção segura aqui.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_conversations_tenant_channel_external
  ON public.conversations (tenant_id, channel, contact_external_id);

CREATE INDEX IF NOT EXISTS idx_conversations_external
  ON public.conversations (contact_external_id);

-- ------------------------------------------------------------- mídia --------

-- `InboundMsg.mediaUrl` era parseado pelos provedores e jogado fora: não havia
-- onde gravar. Numa clínica a foto que a cliente manda é contexto clínico.
--
-- Guarda o CAMINHO no bucket, não a URL do provedor: link da Meta expira em
-- horas e exige token, então o histórico ficaria com buraco.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_path text;

DO $media_check$
BEGIN
  ALTER TABLE public.messages
    ADD CONSTRAINT messages_media_type_check
    CHECK (media_type IS NULL OR media_type IN ('image', 'audio', 'video', 'document'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $media_check$;

-- Bucket privado. Leitura sempre por signed URL, como em `lgpd-exports`.
INSERT INTO storage.buckets (id, name, public)
VALUES ('inbox-media', 'inbox-media', false)
ON CONFLICT (id) DO NOTHING;
