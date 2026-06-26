-- Plano de tratamento criado pela profissional durante a avaliação inicial.
-- O plano concentra os procedimentos/pacotes recomendados e serve de base
-- para o checkout na recepção (contrato, pagamento, agendamento de execução).

-- ── Plano de tratamento ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.treatment_plans (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                 UUID        NOT NULL REFERENCES public.clients(id)      ON DELETE CASCADE,
  branch_id                 UUID        NOT NULL REFERENCES public.branches(id)     ON DELETE CASCADE,
  professional_id           UUID        NOT NULL REFERENCES public.users(id),
  evaluation_appointment_id UUID        REFERENCES public.appointments(id),
  status                    TEXT        NOT NULL DEFAULT 'DRAFT',
  -- DRAFT | PROPOSED | ACCEPTED | COMPLETED | REJECTED
  professional_notes        TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS treatment_plans_branch_status_idx
  ON public.treatment_plans (branch_id, status);

CREATE INDEX IF NOT EXISTS treatment_plans_client_idx
  ON public.treatment_plans (client_id);

ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operacional acessa planos da propria filial"
  ON public.treatment_plans FOR ALL
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE b.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );

-- ── Itens do plano ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.treatment_plan_items (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            UUID         NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  procedure_id       UUID         NOT NULL REFERENCES public.procedures(id),
  service_package_id UUID         REFERENCES public.service_packages(id),
  sessions           INT          NOT NULL DEFAULT 1,
  unit_price         DECIMAL(10,2) NOT NULL,
  sort_order         INT          NOT NULL DEFAULT 0
);

ALTER TABLE public.treatment_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operacional acessa itens via plano da propria filial"
  ON public.treatment_plan_items FOR ALL
  USING (
    plan_id IN (
      SELECT tp.id FROM public.treatment_plans tp
      JOIN public.branches b ON b.id = tp.branch_id
      WHERE b.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );

-- ── Alterações em tabelas existentes ─────────────────────────────────────────

-- Assinatura digital desenhada no canvas (base64 PNG)
ALTER TABLE public.consent_terms
  ADD COLUMN IF NOT EXISTS signature_data TEXT;

-- Flag para identificar agendamentos do tipo avaliação inicial
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_evaluation BOOLEAN NOT NULL DEFAULT FALSE;
