-- Fase 9: remove as colunas legadas. role_id passa a ser a unica autoridade.
-- Aplicada no remoto via MCP (migration: drop_legacy_role_columns).

-- role_permissions: dropa role/can_view/can_write; role_id NOT NULL + unique (role_id, module)
alter table public.role_permissions drop constraint if exists role_permissions_tenant_id_role_module_key;
drop index if exists role_permissions_role_id_module_key;
delete from public.role_permissions where role_id is null;   -- limpa orfaos (0 esperado)
alter table public.role_permissions alter column role_id set not null;
alter table public.role_permissions drop column if exists role;
alter table public.role_permissions drop column if exists can_view;
alter table public.role_permissions drop column if exists can_write;
alter table public.role_permissions add constraint role_permissions_role_id_module_key unique (role_id, module);

-- users: remove o enum legado (role_id + provides_services governam)
alter table public.users drop column if exists role;
