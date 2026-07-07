-- ── Notification Campaigns ────────────────────────────────────────────
-- Campanhas de notificação gerenciadas pelo NETWORK_ADMIN.
-- Canal inicial: in_app (insere em client_notifications).
-- Colunas channels[] preparam push/WhatsApp futuros.

CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  description       TEXT,

  -- DRAFT | ACTIVE | PAUSED | COMPLETED | ARCHIVED
  status            TEXT        NOT NULL DEFAULT 'DRAFT',
  -- IMMEDIATE | SCHEDULED | AUTOMATED
  type              TEXT        NOT NULL,

  -- Conteúdo — suporta {{first_name}}
  title             TEXT        NOT NULL,
  body              TEXT        NOT NULL,
  -- mapeia para client_notifications.type
  notification_type TEXT        NOT NULL DEFAULT 'promotion',

  -- Agendamento (type = SCHEDULED)
  scheduled_at      TIMESTAMPTZ,

  -- Automação (type = AUTOMATED)
  -- BIRTHDAY | ANNUAL_DATE | DAYS_AFTER_VISIT | DAYS_BEFORE_EXPIRY
  trigger_type      TEXT,
  -- { month, day } para ANNUAL_DATE; { days: 30 } para os outros
  trigger_config    JSONB,

  -- Segmentação de público
  audience_rules    JSONB       NOT NULL DEFAULT '{}',

  -- Canais de envio — in_app sempre presente no MVP
  channels          TEXT[]      NOT NULL DEFAULT ARRAY['in_app'],

  -- Métricas atualizadas no disparo / leitura
  total_sent        INT         NOT NULL DEFAULT 0,
  total_read        INT         NOT NULL DEFAULT 0,

  created_by        UUID        REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at       TIMESTAMPTZ  -- última execução (automated/scheduled)
);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_tenant_status
  ON public.notification_campaigns (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_automated_active
  ON public.notification_campaigns (tenant_id, trigger_type, status)
  WHERE type = 'AUTOMATED' AND status = 'ACTIVE';

-- ── Campaign Dispatches ────────────────────────────────────────────────
-- Log de cada notificação enviada por campanha.
-- Usado para idempotência (não enviar duas vezes no mesmo dia) e relatórios.

CREATE TABLE IF NOT EXISTS public.campaign_dispatches (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID        NOT NULL REFERENCES public.notification_campaigns(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  notification_id UUID        REFERENCES public.client_notifications(id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'SENT', -- SENT | FAILED
  error_message   TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_dispatches_campaign_client
  ON public.campaign_dispatches (campaign_id, client_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_dispatches_client
  ON public.campaign_dispatches (client_id, sent_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.notification_campaigns   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_dispatches      ENABLE ROW LEVEL SECURITY;

-- NETWORK_ADMIN lê/gerencia campanhas do próprio tenant
CREATE POLICY "Admin gerencia campanhas do tenant"
  ON public.notification_campaigns
  FOR ALL
  USING (
    tenant_id::text = jwt_claim('tenant_id')
    AND jwt_claim('role') = 'NETWORK_ADMIN'
  )
  WITH CHECK (
    tenant_id::text = jwt_claim('tenant_id')
    AND jwt_claim('role') = 'NETWORK_ADMIN'
  );

-- Service role lê dispatches para relatórios via admin client
CREATE POLICY "Admin lê dispatches do tenant"
  ON public.campaign_dispatches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.notification_campaigns nc
      WHERE nc.id = campaign_id
        AND nc.tenant_id::text = jwt_claim('tenant_id')
        AND jwt_claim('role') = 'NETWORK_ADMIN'
    )
  );

-- ── updated_at trigger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_campaigns_updated_at'
  ) THEN
    CREATE TRIGGER trg_notification_campaigns_updated_at
      BEFORE UPDATE ON public.notification_campaigns
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;
