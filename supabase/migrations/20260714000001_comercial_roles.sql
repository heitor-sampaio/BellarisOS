-- COMERCIAL / GERENTE_COMERCIAL: cargos fixos de rede (branch_id = null no JWT).
-- COMERCIAL: opera agenda da rede (via extensão) + CRM/leads no portal.
-- GERENTE_COMERCIAL: KPIs/relatórios do comercial.
-- (Aplicado no remoto via MCP: os ALTER TYPE por execute_sql, isolados; a função por migration.)

-- ── Enum de role (rodar isolado — ADD VALUE não pode ser usado na mesma transação) ──
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COMERCIAL';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'GERENTE_COMERCIAL';

-- ── set_user_claims: comerciais também forçam branch_id = null ───────────────
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
      'branch_id', case
        when p_role in ('FINANCIAL', 'MARKETING', 'COMERCIAL', 'GERENTE_COMERCIAL') then null
        else p_branch_id
      end,
      'role', p_role,
      'client_id', null
    )
  where id = p_auth_id;
end;
$$;
