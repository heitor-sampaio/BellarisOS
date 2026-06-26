import { subDays } from 'date-fns'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClientsSidebar } from '@/components/branch/clients-sidebar'

export default async function AdminClientsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN'])

  const admin = createAdminClient()

  const [{ data: rawClients }, { data: recentAppts }, { data: branchesRaw }] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, phone, tags, is_active, created_at, branch_id, branches!branch_id(id, name)')
      .eq('tenant_id', ctx.tenantId!)
      .order('name'),

    admin
      .from('appointments')
      .select('client_id, scheduled_at')
      .eq('tenant_id', ctx.tenantId!)
      .eq('status', 'COMPLETED')
      .order('scheduled_at', { ascending: false })
      .limit(2000),

    admin
      .from('branches')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'),
  ])

  const lastVisitMap = new Map<string, string>()
  for (const a of recentAppts ?? []) {
    if (!lastVisitMap.has(a.client_id)) lastVisitMap.set(a.client_id, a.scheduled_at)
  }

  const thirtyDaysAgo = subDays(new Date(), 30)

  const clients = (rawClients ?? []).map(c => {
    const branch = Array.isArray(c.branches) ? (c.branches[0] as { id: string; name: string } | undefined) ?? null : (c.branches as { id: string; name: string } | null)
    return {
      id:         c.id as string,
      name:       c.name as string,
      phone:      c.phone as string,
      tags:       (c.tags ?? []) as string[],
      isActive:   c.is_active as boolean,
      isNew:      new Date(c.created_at) >= thirtyDaysAgo,
      lastVisit:  lastVisitMap.get(c.id) ?? null,
      branchId:   (c.branch_id ?? undefined) as string | undefined,
      branchName: branch?.name ?? undefined,
    }
  })

  const totalActive    = clients.filter(c => c.isActive).length
  const branches       = (branchesRaw ?? []) as { id: string; name: string }[]

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <ClientsSidebar
        clients={clients}
        basePath="/admin/clients"
        totalActive={totalActive}
        newClientHref={null}
        availableBranches={branches}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}
