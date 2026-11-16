-- A Auditoria é SÓ da Admin da rede (o Heitor, 2026-11-16: "Auditoria: quem
-- tem unidades continua sem ver 'Abriu o prontuário'?" — "Auditoria é só
-- admin").
--
-- O módulo `audit` era uma linha da matriz de Cargos (CF3c, 2026-11-16) que
-- nascia só no Admin da rede e a rede podia dar a outro cargo. Agora não se dá:
-- sai da tela de Cargos e do que `saveRolePermissions` grava
-- (`MODULOS_SO_DA_ADMIN`, lib/permissions.ts), e o contexto só o tem com o
-- cargo de sistema (`ctx.isNetworkAdmin`, que tem tudo e não guarda linhas).
--
-- Aqui saem as linhas `audit` gravadas em cargos que não são o Admin da rede
-- (Ver ou Sem acesso — a de Sem acesso também, para não sobrar o módulo na
-- matriz de cargo nenhum). O cargo de sistema não é tocado.

delete from public.role_permissions rp
where rp.module = 'audit'
  and not exists (
    select 1 from public.tenant_roles r
    where r.id = rp.role_id and r.key = 'NETWORK_ADMIN' and r.is_system
  );

notify pgrst, 'reload schema';
