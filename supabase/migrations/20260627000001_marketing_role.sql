-- MARKETING role: cargo fixo de rede (branch_id = null no JWT)
-- Acesso: leads (read), CRM, relatórios — sem acesso financeiro, estoque ou configurações

-- ── set_user_claims: MARKETING também força branch_id = null ─────────────────
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
        when p_role in ('FINANCIAL', 'MARKETING') then null
        else p_branch_id
      end,
      'role', p_role,
      'client_id', null
    )
  where id = p_auth_id;
end;
$$;

-- ── LEADS — MARKETING lê todos os leads da rede ──────────────────────────────
create policy "Marketing lê leads da rede" on public.leads
  for select using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') = 'MARKETING'
  );

-- ── BRANCHES — MARKETING vê filiais (para contexto nos relatórios) ────────────
create policy "Marketing vê filiais da rede" on public.branches
  for select using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') = 'MARKETING'
  );

-- ── CONVERSATIONS / CRM — MARKETING lê conversas ─────────────────────────────
create policy "Marketing lê conversas da rede" on public.conversations
  for select using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') = 'MARKETING'
  );
