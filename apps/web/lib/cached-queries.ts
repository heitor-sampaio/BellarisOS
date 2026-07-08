import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

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
