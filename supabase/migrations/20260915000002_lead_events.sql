-- Histórico do card do CRM.
--
-- Até aqui não havia nenhum registro de movimentação: o lead tinha só
-- `crm_stage_id` (onde ele está agora) e `created_at`. Quem moveu, quando, de
-- onde para onde e quanto tempo ficou parado em cada etapa não existia em lugar
-- nenhum — nem para auditoria, nem para medir tempo por etapa.
--
-- Padrão do banco: jwt_claim(...) em public, NUNCA auth.jwt_claim.
-- Idempotente: pode rodar de novo em clone/CI.

CREATE TABLE IF NOT EXISTS public.lead_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES public.leads(id)   ON DELETE CASCADE,
  type          text NOT NULL,

  -- Ids para análise (tempo por etapa, taxa de passagem)...
  from_stage_id uuid REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  to_stage_id   uuid REFERENCES public.crm_stages(id) ON DELETE SET NULL,

  -- ...e os nomes congelados para leitura. Um log de eventos registra o que era
  -- verdade na hora: renomear "Fechado" para "Ganho" não pode reescrever o
  -- passado, e excluir uma etapa não pode apagar a linha do tempo.
  from_stage_name  text,
  to_stage_name    text,
  from_funnel_name text,
  to_funnel_name   text,

  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name    text,

  created_at    timestamptz NOT NULL DEFAULT now()
);

DO $type_check$
BEGIN
  ALTER TABLE public.lead_events
    ADD CONSTRAINT lead_events_type_check
    CHECK (type IN ('CREATED', 'STAGE_CHANGED', 'CONVERTED', 'OWNER_CHANGED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $type_check$;

-- A leitura é sempre "a linha do tempo deste card", do mais novo para o mais
-- antigo.
CREATE INDEX IF NOT EXISTS idx_lead_events_lead
  ON public.lead_events (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_events_tenant
  ON public.lead_events (tenant_id, created_at DESC);

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_events_tenant ON public.lead_events;
CREATE POLICY lead_events_tenant ON public.lead_events
  USING ((tenant_id)::text = jwt_claim('tenant_id'));

-- Leads que já existiam ganham o evento de criação, senão a linha do tempo
-- deles nasce vazia e parece defeito. Data e etapa são as que o lead tem —
-- não há como reconstruir por onde ele passou antes disto.
INSERT INTO public.lead_events (
  tenant_id, lead_id, type, to_stage_id, to_stage_name, to_funnel_name, created_at
)
SELECT
  l.tenant_id, l.id, 'CREATED', l.crm_stage_id, s.name, f.name, l.created_at
FROM public.leads l
LEFT JOIN public.crm_stages  s ON s.id = l.crm_stage_id
LEFT JOIN public.crm_funnels f ON f.id = s.funnel_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.lead_events e WHERE e.lead_id = l.id AND e.type = 'CREATED'
);

-- Lead que já é cliente ganha o evento de conversão. A data real não existe —
-- `leads` não guarda quando a ligação aconteceu —, então usa a do cliente.
INSERT INTO public.lead_events (tenant_id, lead_id, type, created_at)
SELECT l.tenant_id, l.id, 'CONVERTED', COALESCE(c.created_at, l.created_at)
FROM public.leads l
JOIN public.clients c ON c.id = l.client_id
WHERE l.client_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_events e WHERE e.lead_id = l.id AND e.type = 'CONVERTED'
  );
