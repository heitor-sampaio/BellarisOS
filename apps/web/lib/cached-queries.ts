import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Mapa auth_id → users.id interno (usado no getTenantContext) ──────────────
// Evita um round-trip PostgREST por request. Invalidar em actions/team.ts.
export function getCachedInternalUserId(authId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('users')
        .select('id')
        .eq('auth_id', authId)
        .maybeSingle()
      return data?.id ?? null
    },
    [`internal-user-id-${authId}`],
    { revalidate: 3600, tags: [`user:${authId}`] },
  )()
}

// ─── Branch: clientes da filial ──────────────────────────────────────────────
export function getCachedBranchClients(branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('clients')
        .select('id, name, phone, tags, is_active, created_at')
        .eq('branch_id', branchId)
        .order('name')
      return data ?? []
    },
    [`branch-clients-${branchId}`],
    { revalidate: 120, tags: [`clients:${tenantId}`] },
  )()
}

// ─── Branch: appointments concluídos (para calcular "última visita") ─────────
export function getCachedBranchCompletedAppointments(branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('appointments')
        .select('client_id, scheduled_at')
        .eq('branch_id', branchId)
        .eq('status', 'COMPLETED')
        .order('scheduled_at', { ascending: false })
        .limit(800)
      return data ?? []
    },
    [`branch-appointments-completed-${branchId}`],
    { revalidate: 300, tags: [`appointments:${tenantId}`] },
  )()
}

// ─── Network (admin): todos os clientes da rede ───────────────────────────────
export function getCachedNetworkClients(tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('clients')
        .select('id, name, phone, tags, is_active, created_at, branch_id, branches!branch_id(id, name)')
        .eq('tenant_id', tenantId)
        .order('name')
      return data ?? []
    },
    [`network-clients-${tenantId}`],
    { revalidate: 120, tags: [`clients:${tenantId}`] },
  )()
}

// ─── Network (admin): appointments concluídos de toda a rede ─────────────────
export function getCachedNetworkCompletedAppointments(tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('appointments')
        .select('client_id, scheduled_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'COMPLETED')
        .order('scheduled_at', { ascending: false })
        .limit(2000)
      return data ?? []
    },
    [`network-appointments-completed-${tenantId}`],
    { revalidate: 300, tags: [`appointments:${tenantId}`] },
  )()
}

// ─── Network (admin): branches ativas ────────────────────────────────────────
export function getCachedNetworkBranches(tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('branches')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')
      return data ?? []
    },
    [`network-branches-${tenantId}`],
    { revalidate: 600, tags: [`branches:${tenantId}`] },
  )()
}

// ─── Filial por slug (lookup feito em quase toda página de filial) ────────────
export function getCachedBranchBySlug(slug: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('branches')
        .select('id, name, slug')
        .eq('slug', slug)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .maybeSingle()
      return data
    },
    [`branch-by-slug-${tenantId}-${slug}`],
    { revalidate: 600, tags: [`branches:${tenantId}`] },
  )()
}

// ─── Permissões por role (roda no layout da filial → toda navegação) ──────────
export function getCachedRolePermissions(tenantId: string, role: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('role_permissions')
        .select('module, can_view, can_write')
        .eq('tenant_id', tenantId)
        .eq('role', role)
      return data ?? []
    },
    [`role-permissions-${tenantId}-${role}`],
    { revalidate: 600, tags: [`permissions:${tenantId}`] },
  )()
}

// ─── Procedimentos da filial (base da rede + locais) ──────────────────────────
export function getCachedBranchProcedures(branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('procedures')
        .select('id, name, category, duration_min, price')
        .eq('tenant_id', tenantId)
        .or(`branch_id.is.null,branch_id.eq.${branchId}`)
        .eq('is_active', true)
        .order('name')
      return data ?? []
    },
    [`branch-procedures-${branchId}`],
    { revalidate: 300, tags: [`procedures:${tenantId}`] },
  )()
}

// ─── Procedimentos da rede (lista leve id/name — admin CRM, notificações) ─────
export function getCachedNetworkProcedures(tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('procedures')
        .select('id, name, category')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')
      return data ?? []
    },
    [`network-procedures-${tenantId}`],
    { revalidate: 300, tags: [`procedures:${tenantId}`] },
  )()
}

// ─── Profissionais da filial (BRANCH_ADMIN + PROFESSIONAL ativos) ─────────────
export function getCachedBranchProfessionals(branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('users')
        .select('id, name')
        .eq('branch_id', branchId)
        .in('role', ['BRANCH_ADMIN', 'PROFESSIONAL'])
        .eq('is_active', true)
        .order('name')
      return data ?? []
    },
    [`branch-professionals-${branchId}`],
    { revalidate: 300, tags: [`professionals:${tenantId}`] },
  )()
}

// ─── Salas da filial ──────────────────────────────────────────────────────────
export function getCachedRoomsByBranch(branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('rooms')
        .select('id, name')
        .eq('branch_id', branchId)
        .eq('is_active', true)
      return data ?? []
    },
    [`branch-rooms-${branchId}`],
    { revalidate: 600, tags: [`rooms:${tenantId}`] },
  )()
}

// ─── Catálogo de produtos (colunas estáveis — NÃO inclui quantidade de estoque)
export function getCachedProductsReference(tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('products')
        .select('id, name, unit, branch_id, consumption_unit, units_per_package, cost_price')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')
      return data ?? []
    },
    [`products-reference-${tenantId}`],
    { revalidate: 300, tags: [`products:${tenantId}`] },
  )()
}

// ─── Perfil do cliente — as 11 queries paralelas da página de detalhe ─────────
// TTL curto (60s) + tags de tenant (clients/appointments) que as mutations já
// invalidam. Retorna os arrays crus; a página faz todo o mapeamento/transform.
export function getCachedClientProfileData(clientId: string, branchId: string, tenantId: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const [
        appts, loyalty, medRecord, pkgs, docsRaw,
        txAppts, directTxRaw, credits, branchesRaw,
        activePlansRaw, allPlansHistRaw,
      ] = await Promise.all([
        admin
          .from('appointments')
          .select('id, scheduled_at, status, price, treatment_plan_id, created_at, completed_at, cancelled_at, is_evaluation, procedures(name), professional:users!professional_id(name)')
          .eq('client_id', clientId)
          .order('scheduled_at', { ascending: false })
          .limit(60),
        admin
          .from('loyalty_accounts')
          .select('balance')
          .eq('client_id', clientId)
          .maybeSingle(),
        admin
          .from('medical_records')
          .select('id, general_anamnesis, consent_terms(id, title, signed_at, signed_via), entries:medical_record_entries(notes, created_at)')
          .eq('client_id', clientId)
          .maybeSingle(),
        admin
          .from('client_packages')
          .select('id, total_sessions, used_sessions, expires_at, service_packages(name, procedure_id, price, procedures(name, duration_min))')
          .eq('client_id', clientId)
          .order('purchased_at', { ascending: false })
          .limit(10),
        admin
          .from('client_documents')
          .select('id, name, category, file_path, file_name, file_size, mime_type, uploaded_by:users!uploaded_by(name), created_at')
          .eq('client_id', clientId)
          .eq('branch_id', branchId)
          .order('created_at', { ascending: false }),
        admin
          .from('appointments')
          .select(`
            scheduled_at,
            procedures(name),
            transaction:financial_transactions(
              id, description, amount, payment_method, is_paid, paid_at, created_at,
              installments(id, number, total, amount, due_date, is_paid, paid_at)
            )
          `)
          .eq('client_id', clientId)
          .not('transaction', 'is', null)
          .order('scheduled_at', { ascending: false })
          .limit(50),
        admin
          .from('financial_transactions')
          .select('id, description, amount, payment_method, is_paid, paid_at, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(50),
        admin
          .from('internal_credits')
          .select('id, amount, description, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        admin
          .from('branches')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('name'),
        admin
          .from('treatment_plans')
          .select('id, status, treatment_plan_sessions(id, treatment_plan_session_procedures(procedure_id, price, procedures(name, duration_min)))')
          .eq('client_id', clientId)
          .eq('status', 'ACCEPTED')
          .order('created_at', { ascending: false })
          .limit(1),
        admin
          .from('treatment_plans')
          .select('id, status, created_at, updated_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
      ])

      return {
        appts:          appts.data,
        loyalty:        loyalty.data,
        medRecord:      medRecord.data,
        pkgs:           pkgs.data,
        docsRaw:        docsRaw.data,
        txAppts:        txAppts.data,
        directTxRaw:    directTxRaw.data,
        credits:        credits.data,
        branchesRaw:    branchesRaw.data,
        activePlansRaw: activePlansRaw.data,
        allPlansHistRaw: allPlansHistRaw.data,
      }
    },
    [`client-profile-${clientId}`],
    { revalidate: 60, tags: [`clients:${tenantId}`, `appointments:${tenantId}`, `client:${clientId}`] },
  )()
}
