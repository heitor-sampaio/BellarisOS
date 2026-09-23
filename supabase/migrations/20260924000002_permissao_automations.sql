-- O módulo novo `automations` para quem já existe.
--
-- Módulo novo não nasce no banco: `role_permissions` tem uma linha por cargo e
-- por módulo, e cargo criado antes desta migração fica sem a linha. O efeito é
-- mudo — o admin da rede simplesmente não veria Automações no menu — e foi
-- `e2e/fase4-permissoes.spec.ts` que pegou, conferindo que todo módulo
-- declarado em `ALL_MODULES` tem linha para o cargo de sistema.
--
-- **Só o Admin da rede ganha MANAGE.** Automação ligada manda mensagem ao
-- cliente e mexe no CRM sozinha; dar isso de presente a todo cargo existente
-- seria decidir pela clínica um acesso que ela não pediu. Os demais cargos
-- ficam em NONE, e quem quiser libera na tela de Cargos.

insert into role_permissions (tenant_id, role_id, module, level, scope)
select r.tenant_id, r.id, 'automations',
       case when r.key = 'NETWORK_ADMIN' then 'MANAGE' else 'NONE' end::permission_level,
       'ALL'::permission_scope
from tenant_roles r
on conflict (role_id, module) do nothing;
