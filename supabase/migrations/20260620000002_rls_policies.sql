-- RLS Policies — EstéticaOS
-- Segunda linha de defesa: o Prisma já filtra por tenantId/branchId/clientId,
-- mas o RLS garante isolamento mesmo em queries diretas ao banco.

-- Helper: extrai claim do JWT atual
create or replace function auth.jwt_claim(claim text)
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> claim,
    null
  );
$$;

-- ============================================================
-- TENANTS
-- ============================================================
alter table public.tenants enable row level security;

create policy "Tenant visível para membros da rede" on public.tenants
  for select using (id::text = auth.jwt_claim('tenant_id'));

-- ============================================================
-- BRANCHES
-- ============================================================
alter table public.branches enable row level security;

-- NETWORK_ADMIN vê todas as filiais da rede
create policy "Network admin vê todas as filiais" on public.branches
  for select using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') = 'NETWORK_ADMIN'
  );

-- Outros roles veem apenas a própria filial
create policy "Usuário vê própria filial" on public.branches
  for select using (
    id::text = auth.jwt_claim('branch_id')
  );

-- ============================================================
-- USERS
-- ============================================================
alter table public.users enable row level security;

create policy "Network admin vê todos os usuários da rede" on public.users
  for select using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') = 'NETWORK_ADMIN'
  );

create policy "Usuário vê membros da própria filial" on public.users
  for select using (
    branch_id::text = auth.jwt_claim('branch_id')
  );

-- ============================================================
-- CLIENTS
-- ============================================================
alter table public.clients enable row level security;

-- Usuários operacionais veem clientes da filial
create policy "Operacional vê clientes da filial" on public.clients
  for all using (
    branch_id::text = auth.jwt_claim('branch_id')
    and auth.jwt_claim('role') != 'CLIENT'
  );

-- NETWORK_ADMIN vê todos da rede
create policy "Network admin vê todos os clientes" on public.clients
  for all using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') = 'NETWORK_ADMIN'
  );

-- Cliente vê apenas seus próprios dados
create policy "Cliente vê apenas seus dados" on public.clients
  for select using (
    id::text = auth.jwt_claim('client_id')
    and auth.jwt_claim('role') = 'CLIENT'
  );

-- ============================================================
-- APPOINTMENTS
-- ============================================================
alter table public.appointments enable row level security;

create policy "Operacional vê agendamentos da filial" on public.appointments
  for all using (
    branch_id::text = auth.jwt_claim('branch_id')
    and auth.jwt_claim('role') != 'CLIENT'
  );

create policy "Network admin vê todos os agendamentos" on public.appointments
  for select using (
    auth.jwt_claim('role') = 'NETWORK_ADMIN'
    and exists (
      select 1 from public.branches b
      where b.id = branch_id
      and b.tenant_id::text = auth.jwt_claim('tenant_id')
    )
  );

create policy "Cliente vê apenas seus agendamentos" on public.appointments
  for select using (
    client_id::text = auth.jwt_claim('client_id')
    and auth.jwt_claim('role') = 'CLIENT'
  );

-- ============================================================
-- MEDICAL RECORDS (acesso restrito — sem cliente)
-- ============================================================
alter table public.medical_records enable row level security;
alter table public.medical_record_entries enable row level security;
alter table public.record_photos enable row level security;
alter table public.consent_terms enable row level security;
alter table public.anamnesis_data enable row level security;

create policy "Operacional acessa prontuários da filial" on public.medical_records
  for all using (
    auth.jwt_claim('role') in ('NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL')
    and exists (
      select 1 from public.clients c
      where c.id = client_id
      and (
        c.branch_id::text = auth.jwt_claim('branch_id')
        or auth.jwt_claim('role') = 'NETWORK_ADMIN'
      )
    )
  );

-- ============================================================
-- FINANCIAL (sem acesso do cliente)
-- ============================================================
alter table public.financial_transactions enable row level security;
alter table public.cash_registers enable row level security;
alter table public.installments enable row level security;

create policy "Operacional acessa financeiro da filial" on public.financial_transactions
  for all using (
    branch_id::text = auth.jwt_claim('branch_id')
    and auth.jwt_claim('role') in ('NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'FINANCIAL')
  );

create policy "Network admin acessa financeiro da rede" on public.financial_transactions
  for select using (
    auth.jwt_claim('role') = 'NETWORK_ADMIN'
    and exists (
      select 1 from public.branches b
      where b.id = branch_id
      and b.tenant_id::text = auth.jwt_claim('tenant_id')
    )
  );

-- ============================================================
-- STOCK
-- ============================================================
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_transfers enable row level security;

create policy "Operacional acessa estoque da filial" on public.products
  for all using (
    branch_id::text = auth.jwt_claim('branch_id')
    and auth.jwt_claim('role') != 'CLIENT'
  );

create policy "Operacional acessa movimentos de estoque" on public.stock_movements
  for all using (
    branch_id::text = auth.jwt_claim('branch_id')
    and auth.jwt_claim('role') != 'CLIENT'
  );

-- ============================================================
-- LOYALTY (cliente vê os próprios)
-- ============================================================
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;

create policy "Cliente vê própria conta de pontos" on public.loyalty_accounts
  for select using (
    client_id::text = auth.jwt_claim('client_id')
    and auth.jwt_claim('role') = 'CLIENT'
  );

create policy "Operacional acessa fidelidade dos clientes da filial" on public.loyalty_accounts
  for all using (
    auth.jwt_claim('role') in ('NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST')
  );

-- ============================================================
-- PROCEDURES (cliente vê os visíveis no app)
-- ============================================================
alter table public.procedures enable row level security;

create policy "Operacional vê todos os procedimentos da rede" on public.procedures
  for all using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') != 'CLIENT'
  );

create policy "Cliente vê procedimentos visíveis no app" on public.procedures
  for select using (
    visible_on_client_app = true
    and is_active = true
    and auth.jwt_claim('role') = 'CLIENT'
  );
