-- Remove a versão antiga de set_user_claims, que recebia o NOME do cargo
-- (p_role text) e ainda carregava as regras do modelo abandonado: forçar
-- branch_id = null para FINANCIAL, MARKETING, COMERCIAL e GERENTE_COMERCIAL.
--
-- Desde a migração de cargos dinâmicos (20260722000002), abrangência é atributo
-- do MEMBRO (users.branch_id) e não do nome do cargo. Os três chamadores no app
-- (actions/auth.ts, actions/team.ts ×2) usam a versão com p_role_id uuid.
-- Manter as duas convivendo é convite a chamar a errada e reintroduzir a regra
-- por nome de cargo pela porta dos fundos.

drop function if exists public.set_user_claims(uuid, text, text, text);

notify pgrst, 'reload schema';
