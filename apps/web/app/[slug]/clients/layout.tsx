import { notFound } from 'next/navigation'
import { subDays } from 'date-fns'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { ClientsSidebar } from '@/components/branch/clients-sidebar'

export default async function ClientsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'])

  const supabase = await createSupabase()
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) notFound()

  const admin = createAdminClient()

  const [{ data: rawClients }, { data: recentAppts }] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, phone, tags, is_active, created_at')
      .eq('branch_id', branch.id)
      .order('name'),

    admin
      .from('appointments')
      .select('client_id, scheduled_at')
      .eq('branch_id', branch.id)
      .eq('status', 'COMPLETED')
      .order('scheduled_at', { ascending: false })
      .limit(800),
  ])

  // Build last-visit map (first occurrence = most recent, since sorted desc)
  const lastVisitMap = new Map<string, string>()
  for (const a of recentAppts ?? []) {
    if (!lastVisitMap.has(a.client_id)) lastVisitMap.set(a.client_id, a.scheduled_at)
  }

  const thirtyDaysAgo = subDays(new Date(), 30)
  const clients = (rawClients ?? []).map(c => ({
    id:        c.id as string,
    name:      c.name as string,
    phone:     c.phone as string,
    tags:      (c.tags ?? []) as string[],
    isActive:  c.is_active as boolean,
    isNew:     new Date(c.created_at) >= thirtyDaysAgo,
    lastVisit: lastVisitMap.get(c.id) ?? null,
  }))

  const totalActive = clients.filter(c => c.isActive).length

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <ClientsSidebar
        clients={clients}
        basePath={`/${slug}/clients`}
        totalActive={totalActive}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}
