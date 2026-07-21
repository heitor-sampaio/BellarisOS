-- Roles de nível-rede (COMERCIAL, GERENTE_COMERCIAL, NETWORK_ADMIN) têm branch_id NULL.
-- A policy antiga usava private.can_access_branch(branch_id), cujo ramo NETWORK_ADMIN
-- faz EXISTS(branches WHERE id = branch_id ...) — que nunca casa com branch_id NULL,
-- deixando TODOS os usuários de nível-rede invisíveis na tela de equipe.
--
-- Nova policy: NETWORK_ADMIN enxerga todos os usuários do próprio tenant (inclusive
-- os de branch NULL); demais roles continuam restritos à própria filial.
-- Espelha o padrão real do banco (jwt_claim), não auth.jwt_claim.

DROP POLICY IF EXISTS "Usuário vê membros da própria filial" ON public.users;

CREATE POLICY "Usuário vê membros do próprio tenant/filial"
ON public.users FOR SELECT
USING (
  CASE
    WHEN public.jwt_claim('role') = 'NETWORK_ADMIN'
      THEN tenant_id = public.jwt_claim('tenant_id')::uuid
    ELSE public.jwt_claim('branch_id')::uuid = branch_id
  END
);
