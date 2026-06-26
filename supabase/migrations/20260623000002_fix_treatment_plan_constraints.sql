-- 1. general_anamnesis no medical_records (pode não ter chegado ao remoto)
ALTER TABLE public.medical_records
  ADD COLUMN IF NOT EXISTS general_anamnesis JSONB;

-- 2. UNIQUE em evaluation_appointment_id (necessário para upsert ON CONFLICT)
ALTER TABLE public.treatment_plans
  ADD CONSTRAINT treatment_plans_evaluation_appointment_id_key
  UNIQUE (evaluation_appointment_id);

-- 3. products JSONB em treatment_plan_items (insumos por item do plano)
ALTER TABLE public.treatment_plan_items
  ADD COLUMN IF NOT EXISTS products JSONB NOT NULL DEFAULT '[]'::jsonb;
