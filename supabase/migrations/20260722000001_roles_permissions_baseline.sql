-- Fase 1: versiona o modelo de cargos/permissoes dinamicas.
-- Adiciona nivel unico (NONE/VIEW/MANAGE) e FKs role_id, sem quebrar o caminho antigo.
-- Aplicada no remoto via MCP (migration: roles_permissions_baseline).

-- Nivel de acesso por modulo (fonte unica de verdade)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'permission_level') then
    create type permission_level as enum ('NONE', 'VIEW', 'MANAGE');
  end if;
end $$;

-- role_permissions: identidade estavel por cargo + nivel
alter table public.role_permissions
  add column if not exists role_id uuid references public.tenant_roles(id) on delete cascade;
alter table public.role_permissions
  add column if not exists level permission_level not null default 'NONE';

-- Indice unico por (role_id, module) — convive com a UNIQUE antiga (tenant_id, role, module)
create unique index if not exists role_permissions_role_id_module_key
  on public.role_permissions (role_id, module)
  where role_id is not null;

-- users: cargo dinamico + flag de "atende clientes" (profissional)
alter table public.users
  add column if not exists role_id uuid references public.tenant_roles(id);
alter table public.users
  add column if not exists provides_services boolean not null default false;

create index if not exists users_role_id_idx on public.users (role_id);
