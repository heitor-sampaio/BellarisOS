-- FINANCIAL role agora opera em nível de rede (tenant_id, branch_id: null)
-- Adiciona políticas RLS de leitura e escrita financeira cross-branch

-- ── set_user_claims: quando role = FINANCIAL, branch_id é sempre null ────────
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
      -- FINANCIAL opera em nível de rede; branch_id deve ser null
      'branch_id', case when p_role = 'FINANCIAL' then null else p_branch_id end,
      'role', p_role,
      'client_id', null
    )
  where id = p_auth_id;
end;
$$;

-- ── BRANCHES — FINANCIAL vê todas as filiais da rede ─────────────────────────
create policy "Financial vê todas as filiais da rede" on public.branches
  for select using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') = 'FINANCIAL'
  );

-- ── CLIENTS — FINANCIAL lê todos os clientes da rede ─────────────────────────
create policy "Financial lê clientes da rede" on public.clients
  for select using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') = 'FINANCIAL'
  );

-- ── PROCEDURES — FINANCIAL lê todos os procedimentos da rede ─────────────────
-- (a policy existente já cobre tenant_id != CLIENT; FINANCIAL terá tenant_id preenchido)

-- ── FINANCIAL TRANSACTIONS — FINANCIAL tem acesso total cross-branch ──────────
drop policy if exists "Operacional acessa financeiro da filial" on public.financial_transactions;

create policy "Operacional acessa financeiro da filial" on public.financial_transactions
  for all using (
    branch_id::text = auth.jwt_claim('branch_id')
    and auth.jwt_claim('role') in ('NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST')
  );

create policy "Financial acessa financeiro de todas as filiais da rede" on public.financial_transactions
  for all using (
    auth.jwt_claim('role') = 'FINANCIAL'
    and exists (
      select 1 from public.branches b
      where b.id = branch_id
      and b.tenant_id::text = auth.jwt_claim('tenant_id')
    )
  );

-- ── CASH REGISTERS — FINANCIAL acessa caixas de todas as filiais ─────────────
create policy "Financial acessa caixas da rede" on public.cash_registers
  for all using (
    auth.jwt_claim('role') = 'FINANCIAL'
    and exists (
      select 1 from public.branches b
      where b.id = branch_id
      and b.tenant_id::text = auth.jwt_claim('tenant_id')
    )
  );

-- ── INSTALLMENTS — FINANCIAL lê parcelas da rede ─────────────────────────────
create policy "Financial lê parcelas da rede" on public.installments
  for select using (
    auth.jwt_claim('role') = 'FINANCIAL'
    and exists (
      select 1 from public.financial_transactions ft
      join public.branches b on b.id = ft.branch_id
      where ft.id = financial_transaction_id
      and b.tenant_id::text = auth.jwt_claim('tenant_id')
    )
  );

-- ── COMMISSIONS — FINANCIAL lê comissões da rede ─────────────────────────────
create policy "Financial lê comissões da rede" on public.commissions
  for select using (
    auth.jwt_claim('role') = 'FINANCIAL'
    and exists (
      select 1 from public.branches b
      where b.id = branch_id
      and b.tenant_id::text = auth.jwt_claim('tenant_id')
    )
  );

-- ── PRODUCTS / STOCK — FINANCIAL lê estoque de toda a rede ───────────────────
create policy "Financial lê produtos da rede" on public.products
  for select using (
    auth.jwt_claim('role') = 'FINANCIAL'
    and tenant_id::text = auth.jwt_claim('tenant_id')
  );

create policy "Financial lê movimentos de estoque da rede" on public.stock_movements
  for select using (
    auth.jwt_claim('role') = 'FINANCIAL'
    and exists (
      select 1 from public.branches b
      where b.id = branch_id
      and b.tenant_id::text = auth.jwt_claim('tenant_id')
    )
  );

-- ── APPOINTMENTS — FINANCIAL lê agendamentos da rede (contexto financeiro) ───
create policy "Financial lê agendamentos da rede" on public.appointments
  for select using (
    auth.jwt_claim('role') = 'FINANCIAL'
    and exists (
      select 1 from public.branches b
      where b.id = branch_id
      and b.tenant_id::text = auth.jwt_claim('tenant_id')
    )
  );
