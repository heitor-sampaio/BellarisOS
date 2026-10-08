-- O módulo novo `copilot` para os cargos que já existem (2026-10-08).
--
-- O acesso ao Copilot passou a ser do CARGO (pedido do Heitor): Ver só
-- consulta; Gerenciar também prepara gravações. Módulo novo não nasce no
-- banco — cargo sem a linha fica em NONE (ver 20260924000002, automations).
--
-- Aqui a decisão é a OPOSTA da das automações: o Copilot foi lançado hoje
-- para toda a equipe, e o cartão de confirmação já protege as gravações (que
-- ainda exigem o módulo delas). Tirá-lo de quem já usa seria uma mudança que
-- a clínica não pediu. Todo cargo existente fica em MANAGE, menos o "Não
-- definido" (o cargo de quem ainda não tem cargo), que fica em NONE. Quem
-- quiser restringir faz na tela de Cargos.

insert into role_permissions (tenant_id, role_id, module, level, scope)
select r.tenant_id, r.id, 'copilot',
       case when r.key = 'NAO_DEFINIDO' then 'NONE' else 'MANAGE' end::permission_level,
       'ALL'::permission_scope
from tenant_roles r
on conflict (role_id, module) do nothing;
