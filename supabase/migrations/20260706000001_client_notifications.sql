-- Notificações in-app para clientes do portal web/mobile
CREATE TABLE IF NOT EXISTS public.client_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  body       TEXT,
  type       TEXT        NOT NULL DEFAULT 'general',
  -- general | appointment_confirmed | appointment_reminder | appointment_cancelled
  -- appointment_completed | points_earned | package_activated | promotion
  data       JSONB,
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_notifications_client_unread
  ON public.client_notifications (client_id, is_read, created_at DESC);

ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

-- Cliente lê e marca como lidas as próprias notificações
CREATE POLICY "Cliente lê próprias notificações"
  ON public.client_notifications FOR SELECT
  USING (client_id::text = jwt_claim('client_id') AND jwt_claim('role') = 'CLIENT');

CREATE POLICY "Cliente marca notificação como lida"
  ON public.client_notifications FOR UPDATE
  USING (client_id::text = jwt_claim('client_id') AND jwt_claim('role') = 'CLIENT')
  WITH CHECK (client_id::text = jwt_claim('client_id'));

-- Staff (service role) insere notificações programaticamente
-- (SERVICE_ROLE key bypassa RLS — as políticas acima são para acesso direto)
