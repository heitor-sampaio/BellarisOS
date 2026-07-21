-- CRM unificado (card = lead, conversa = operacional).
-- 1) Canal 'messenger' (Facebook Messenger) no CHECK de channel.
-- 2) branch_id opcional: lead/conversa nascem na REDE (network); a designação de
--    filial é feita depois via tag, pois o 1o contato não revela onde o lead quer ser atendido.

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_channel_check
  CHECK (channel = ANY (ARRAY['whatsapp','instagram','messenger','email','manual']));

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_channel_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_channel_check
  CHECK (channel = ANY (ARRAY['whatsapp','instagram','messenger','email','manual']));

ALTER TABLE public.leads         ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN branch_id DROP NOT NULL;
