-- CRM: múltiplos funis por rede.
--
-- Até aqui `crm_stages` era uma lista plana por tenant: a rede tinha um funil só.
-- Agora as etapas pertencem a um funil, e a rede cria quantos quiser (venda,
-- recuperação de inativo, pós-venda…). O lead continua em um funil por vez —
-- o funil dele é derivado de `crm_stage_id -> crm_stages.funnel_id`, sem coluna
-- nova em `leads`, para não existirem duas verdades sobre a mesma coisa.
--
-- Padrão do banco: jwt_claim(...) em public, NUNCA auth.jwt_claim.
-- Idempotente: pode rodar de novo em clone/CI.

-- ---------------------------------------------------------------- funis ----

CREATE TABLE IF NOT EXISTS public.crm_funnels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        varchar(60) NOT NULL,
  is_default  boolean     NOT NULL DEFAULT false,
  position    smallint    NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_funnels_tenant ON public.crm_funnels (tenant_id, position);

-- Um padrão por rede, garantido pelo banco e não só pela action: é o funil onde
-- caem os leads que chegam sozinhos pelo WhatsApp e a base das métricas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_funnels_default
  ON public.crm_funnels (tenant_id) WHERE is_default;

ALTER TABLE public.crm_funnels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_funnels_tenant ON public.crm_funnels;
CREATE POLICY crm_funnels_tenant ON public.crm_funnels
  USING ((tenant_id)::text = jwt_claim('tenant_id'));

-- --------------------------------------------------------------- etapas ----

ALTER TABLE public.crm_stages
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.crm_funnels(id) ON DELETE CASCADE;

-- OPEN | WON | LOST. Sem isso a conversão do CRM era "o lead virou cliente",
-- que num funil de pós-venda nasce 100% porque todo mundo já é cliente.
ALTER TABLE public.crm_stages
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'OPEN';

DO $outcome_check$
BEGIN
  ALTER TABLE public.crm_stages
    ADD CONSTRAINT crm_stages_outcome_check CHECK (outcome IN ('OPEN', 'WON', 'LOST'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $outcome_check$;

-- ------------------------------------------------------------- backfill ----

-- Toda rede que já tinha etapas ganha o funil onde elas estavam.
INSERT INTO public.crm_funnels (tenant_id, name, is_default, position)
SELECT DISTINCT s.tenant_id, 'Funil de vendas', true, 0
FROM public.crm_stages s
WHERE s.funnel_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_funnels f
    WHERE f.tenant_id = s.tenant_id AND f.is_default
  );

UPDATE public.crm_stages s
SET funnel_id = f.id
FROM public.crm_funnels f
WHERE s.funnel_id IS NULL
  AND f.tenant_id = s.tenant_id
  AND f.is_default;

-- As etapas existentes vieram todas do mesmo DEFAULT_STAGES (actions/crm-stages.ts),
-- então casar por nome aqui é seguro; o pior caso é a rede remarcar no modal.
UPDATE public.crm_stages SET outcome = 'WON'  WHERE outcome = 'OPEN' AND name = 'Fechado';
UPDATE public.crm_stages SET outcome = 'LOST' WHERE outcome = 'OPEN' AND name = 'Perdido';

ALTER TABLE public.crm_stages ALTER COLUMN funnel_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_stages_funnel ON public.crm_stages (funnel_id, position);

-- Lead sem etapa entra na primeira do funil padrão da rede.
--
-- ⚠️ O fallback "crm_stage_id NULL = primeira coluna" morre aqui. Ele era
-- inofensivo com um funil só; com vários, o mesmo lead apareceria na primeira
-- coluna de TODOS os quadros. A partir de agora todo caminho de escrita resolve
-- uma etapa.
UPDATE public.leads l
SET crm_stage_id = (
  SELECT s.id
  FROM public.crm_stages s
  JOIN public.crm_funnels f ON f.id = s.funnel_id
  WHERE f.tenant_id = l.tenant_id AND f.is_default
  ORDER BY s.position
  LIMIT 1
)
WHERE l.crm_stage_id IS NULL;

-- -------------------------------------------------------------- métricas ----

-- metrics_lead_funnel passa a receber o funil. Sem isso o gráfico do dashboard
-- empilharia as etapas de todos os funis da rede no mesmo desenho.
--
-- ⚠️ CREATE OR REPLACE com um parâmetro a mais NÃO substitui: cria sobrecarga, e
-- aí a chamada de 4 argumentos fica ambígua. Tem que dropar a antiga primeiro —
-- e regravar o GRANT, que é por assinatura.
DROP FUNCTION IF EXISTS public.metrics_lead_funnel(uuid, uuid[], timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.metrics_lead_funnel(
  p_tenant     uuid,
  p_branch_ids uuid[],
  p_from       timestamptz,
  p_to         timestamptz,
  p_funnel     uuid DEFAULT NULL
)
returns table (
  stage_id       uuid,
  stage_name     text,
  stage_position int,
  stage_outcome  text,
  leads          bigint,
  converted      bigint
)
language sql
stable
as $fn$
  with alvo as (
    select coalesce(
      p_funnel,
      (select f.id from public.crm_funnels f
        where f.tenant_id = p_tenant and f.is_default
        limit 1)
    ) as funnel_id
  ),
  scoped_leads as (
    select l.id, l.client_id, l.crm_stage_id
    from public.leads l
    where l.tenant_id = p_tenant
      and l.created_at between p_from and p_to
      and (p_branch_ids is null or l.branch_id is null or l.branch_id = any (p_branch_ids))
  )
  select
    st.id,
    st.name::text,
    st.position::int,
    st.outcome,
    count(l.id),
    count(l.id) filter (where l.client_id is not null)
  from public.crm_stages st
  left join scoped_leads l on l.crm_stage_id = st.id
  where st.tenant_id = p_tenant
    and st.funnel_id = (select funnel_id from alvo)
  group by st.id, st.name, st.position, st.outcome
  order by st.position;
$fn$;

REVOKE ALL ON FUNCTION public.metrics_lead_funnel(uuid, uuid[], timestamptz, timestamptz, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.metrics_lead_funnel(uuid, uuid[], timestamptz, timestamptz, uuid)
  TO service_role;
