-- JWT Custom Claims
-- Injeta tenant_id, branch_id, role e client_id no JWT do Supabase Auth.
-- Chamado via trigger on_auth_user_created e também pode ser chamado manualmente.

create or replace function public.set_claim(uid uuid, claim text, value jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from auth.users where id = uid) then
    return 'User not found';
  end if;

  update auth.users
  set raw_app_meta_data =
    raw_app_meta_data ||
    json_build_object(claim, value)::jsonb
  where id = uid;

  return 'OK';
end;
$$;

-- Lê claim do app_metadata do usuário atual
create or replace function public.get_claim(uid uuid, claim text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(raw_app_meta_data -> claim, 'null'::jsonb)
  from auth.users
  where id = uid;
$$;

-- Configura claims de um usuário operacional (User)
create or replace function public.set_user_claims(
  p_auth_id uuid,
  p_tenant_id text,
  p_branch_id text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
  set raw_app_meta_data = raw_app_meta_data ||
    jsonb_build_object(
      'tenant_id', p_tenant_id,
      'branch_id', p_branch_id,
      'role', p_role,
      'client_id', null
    )
  where id = p_auth_id;
end;
$$;

-- Configura claims de um cliente final (Client)
create or replace function public.set_client_claims(
  p_auth_id uuid,
  p_client_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
  set raw_app_meta_data = raw_app_meta_data ||
    jsonb_build_object(
      'tenant_id', null,
      'branch_id', null,
      'role', 'CLIENT',
      'client_id', p_client_id
    )
  where id = p_auth_id;
end;
$$;
