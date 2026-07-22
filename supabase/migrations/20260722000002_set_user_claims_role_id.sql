-- Fase 4: claims por role_id. Abrangencia (branch_id) definida por membro,
-- sem forcar null por nome de role. O claim `role` passa a carregar a KEY do cargo
-- (NETWORK_ADMIN/CLIENT permanecem estaveis para o RLS).
-- Aplicada no remoto via MCP (migration: set_user_claims_role_id).

-- users.role vira opcional: membros de cargo dinamico nao usam o enum legado.
alter table public.users alter column role drop not null;

-- Overload por role_id (uuid). Convive com a versao antiga (p_role text) durante a transicao.
create or replace function public.set_user_claims(
  p_auth_id uuid, p_tenant_id text, p_branch_id text, p_role_id uuid
) returns void
  language plpgsql security definer set search_path to 'public'
as $function$
declare v_key text;
begin
  select key into v_key from public.tenant_roles where id = p_role_id and tenant_id = p_tenant_id::uuid;
  update auth.users
  set raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
    'tenant_id', p_tenant_id,
    'branch_id', p_branch_id,            -- abrangencia por membro: null = rede
    'role', coalesce(v_key, 'MEMBER'),
    'role_id', p_role_id::text,
    'client_id', null
  )
  where id = p_auth_id;
end;
$function$;
