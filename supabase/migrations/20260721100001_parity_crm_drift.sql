-- PARIDADE de drift: estas estruturas já existem no banco BellarisOS (aplicadas direto,
-- sem migration). Este arquivo é idempotente e serve a clones/CI — não altera o remoto.
-- Padrão do banco: jwt_claim(...) em public, NUNCA auth.jwt_claim.

-- crm_stages: etapas do funil, por tenant (rede)
CREATE TABLE IF NOT EXISTS public.crm_stages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       varchar(60) NOT NULL,
  color      varchar(9)  NOT NULL DEFAULT '#c34d6b',
  position   smallint    NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_stages_tenant ON public.crm_stages (tenant_id, position);
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_stages_tenant ON public.crm_stages;
CREATE POLICY crm_stages_tenant ON public.crm_stages
  USING ((tenant_id)::text = jwt_claim('tenant_id'));

-- lead_procedures: join lead <-> procedimento (interesse do lead)
CREATE TABLE IF NOT EXISTS public.lead_procedures (
  lead_id      uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES public.procedures(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, procedure_id)
);

-- leads.crm_stage_id: etapa atual do card (crm_stage_id null = 1a coluna)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_stage_id uuid REFERENCES public.crm_stages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_crm_stage ON public.leads (crm_stage_id);
-- NOTA: leads.stage VARCHAR(20) DEFAULT 'NOVO' é LEGADO e não é usado pela UI atual. Não dropar.

-- provider: canal/provedor de origem da mensagem (drift em conversations/messages)
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.messages      ADD COLUMN IF NOT EXISTS provider text;
