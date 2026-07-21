-- Cliente pertence à REDE, não a uma filial. A unidade vira dimensão de MÉTRICA
-- (via appointments.branch_id = onde foi atendido), não uma fronteira de negócio.
-- Um cliente pode ser atendido em várias unidades.

-- 1) branch_id opcional (cliente de rede = branch_id null)
ALTER TABLE public.clients ALTER COLUMN branch_id DROP NOT NULL;

-- 2) Clientes de rede (branch_id null) são visíveis a toda a equipe do tenant.
--    Sem isto a policy clients_select (can_access_branch) os esconderia.
DROP POLICY IF EXISTS clients_select_network ON public.clients;
CREATE POLICY clients_select_network ON public.clients
FOR SELECT USING (
  jwt_claim('role') <> 'CLIENT'
  AND branch_id IS NULL
  AND (tenant_id)::text = jwt_claim('tenant_id')
);

-- 3) Clientes de rede também precisam ser editáveis (updateClient usa RLS client).
DROP POLICY IF EXISTS clients_update_network ON public.clients;
CREATE POLICY clients_update_network ON public.clients
FOR UPDATE
USING (
  jwt_claim('role') <> 'CLIENT'
  AND branch_id IS NULL
  AND (tenant_id)::text = jwt_claim('tenant_id')
)
WITH CHECK (
  jwt_claim('role') <> 'CLIENT'
  AND (tenant_id)::text = jwt_claim('tenant_id')
);
