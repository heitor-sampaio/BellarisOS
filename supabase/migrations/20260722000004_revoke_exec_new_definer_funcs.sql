-- Bloqueia chamada direta via RPC (anon/authenticated) das funcoes SECURITY DEFINER
-- novas — evita escalada de privilegio (reescrever as proprias claims) e seed manual.
-- service_role (admin client do app) mantem execute.
-- Aplicada no remoto via MCP (migrations: revoke_exec_new_definer_funcs + grant service_role).

revoke execute on function public.set_user_claims(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.seed_tenant_admin_role() from public, anon, authenticated;

grant execute on function public.set_user_claims(uuid, text, text, uuid) to service_role;
grant execute on function public.seed_tenant_admin_role() to service_role;
