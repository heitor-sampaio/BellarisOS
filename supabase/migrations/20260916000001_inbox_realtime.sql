-- Realtime do inbox.
--
-- `crm-inbox.tsx` já assina `postgres_changes` de `conversations` e `messages`
-- desde sempre — mas as tabelas nunca entraram na publication. A assinatura
-- conecta, não dá erro, e nada chega: o inbox PARECIA ter tempo real e só
-- atualizava no refresh.
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Só publicar não basta: o realtime respeita RLS, e a RLS aqui ficou para trás
-- da decisão de produto de julho ("lead e conversa nascem na REDE").
--
-- `private.can_access_branch(branch_id)` compara `jwt_claim('branch_id')` com o
-- branch da linha. Com `branch_id` NULL isso é NULL (nunca true), e para
-- NETWORK_ADMIN vira `EXISTS (... WHERE id = NULL)`, que é false. Ou seja:
-- a policy operacional não cobre NENHUMA conversa da rede — e hoje 100% delas
-- são da rede. Sobrava só a policy de quem tem abrangência de rede; quem é de
-- unidade não receberia evento nenhum.
--
-- O recorte certo é o mesmo que `getConversations` já usa: a conversa é do
-- TENANT, e quem separa é o alcance do cargo (`ownerFilter`), não a unidade.
DROP POLICY IF EXISTS "Comercial le conversas da rede" ON public.conversations;
CREATE POLICY conversations_select_tenant ON public.conversations
  FOR SELECT
  USING (
    (tenant_id)::text = jwt_claim('tenant_id')
    AND jwt_claim('role') <> 'CLIENT'
  );

DROP POLICY IF EXISTS "Comercial le mensagens da rede" ON public.messages;
CREATE POLICY messages_select_tenant ON public.messages
  FOR SELECT
  USING (
    (tenant_id)::text = jwt_claim('tenant_id')
    AND jwt_claim('role') <> 'CLIENT'
  );

COMMENT ON POLICY conversations_select_tenant ON public.conversations IS
  'Conversa é da rede; o recorte por pessoa é do cargo (ownerFilter), não da unidade. Vale para leitura direta e para o realtime.';
