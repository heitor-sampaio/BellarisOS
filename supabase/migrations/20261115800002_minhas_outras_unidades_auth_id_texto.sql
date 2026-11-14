-- Conserto da 20261115800001: `users.auth_id` é TEXTO, e a primeira versão de
-- `private.minhas_outras_unidades` o comparava com `auth.uid()` (uuid) — toda
-- leitura de `branches` pela sessão de um membro de unidade dava 42883
-- ("operator does not exist: text = uuid") na linha que não era a unidade
-- principal dele. Ficou no ar alguns minutos (achado pelo spec novo,
-- e2e/equipe-varias-unidades.spec.ts, "a sessão (RLS) lê as unidades A e B").
create or replace function private.minhas_outras_unidades()
returns uuid[]
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid text := coalesce(auth.uid()::text, '');
  v_c   text;
  v_r   uuid[];
begin
  if v_uid = '' then return '{}'; end if;
  v_c := current_setting('bellaris.unidades', true);
  if v_c is not null and v_c like v_uid || ':%' then
    return substr(v_c, length(v_uid) + 2)::uuid[];
  end if;
  select u.outras_unidades into v_r
    from public.users u
   where u.auth_id = v_uid
     and u.is_active
     and u.branch_id is not null
     and u.tenant_id::text = public.jwt_claim('tenant_id');
  v_r := coalesce(v_r, '{}');
  perform set_config('bellaris.unidades', v_uid || ':' || v_r::text, true);
  return v_r;
end $$;

notify pgrst, 'reload schema';
