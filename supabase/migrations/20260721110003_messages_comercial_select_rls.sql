-- Fecha lacuna de RLS: COMERCIAL/GERENTE_COMERCIAL podem LER mensagens da rede.
-- Espelha a policy "Comercial le conversas da rede" de conversations.
-- (Escritas do inbox usam service role; o receiver de webhook também.)
DROP POLICY IF EXISTS "Comercial le mensagens da rede" ON public.messages;
CREATE POLICY "Comercial le mensagens da rede" ON public.messages
FOR SELECT USING (
  (tenant_id)::text = jwt_claim('tenant_id')
  AND jwt_claim('role') = ANY (ARRAY['COMERCIAL','GERENTE_COMERCIAL'])
);
