-- Trava de idempotência/concorrência da auto-criação de conversa+card:
-- no máximo 1 conversa por (tenant, canal, telefone). Base do upsert onConflict.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_conversations_tenant_channel_phone
ON public.conversations (tenant_id, channel, contact_phone)
WHERE contact_phone IS NOT NULL;
