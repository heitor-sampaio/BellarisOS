-- Histórico do lead: registrar TODA ação, não só a mudança de etapa.
--
-- A primeira versão só sabia de criação, movimento de etapa e conversão. Editar
-- telefone, trocar a origem, mexer nas tags, marcar um agendamento — nada disso
-- deixava rastro. Como a unidade do lead passou a ser uma tag que qualquer um
-- pode remarcar, o rastro é o que substitui a trava: não se impede o roubo, se
-- enxerga quem fez.
--
-- Padrão do banco: jwt_claim(...) em public, NUNCA auth.jwt_claim.
-- Idempotente: pode rodar de novo em clone/CI.

-- Mudanças genéricas de campo: [{ "campo": "phone", "de": "...", "para": "..." }].
-- As colunas de etapa continuam existindo à parte porque são o que sustenta
-- análise de tempo por etapa — jsonb não se agrupa bem.
ALTER TABLE public.lead_events ADD COLUMN IF NOT EXISTS changes jsonb;

ALTER TABLE public.lead_events DROP CONSTRAINT IF EXISTS lead_events_type_check;
ALTER TABLE public.lead_events
  ADD CONSTRAINT lead_events_type_check CHECK (type IN (
    'CREATED',
    'STAGE_CHANGED',
    'UNIT_CHANGED',
    'UPDATED',
    'APPOINTMENT_CREATED',
    'CONVERTED',
    'OWNER_CHANGED'
  ));
