import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminSidebar } from '@/components/admin/sidebar'
import { Topbar } from '@/components/shared/topbar'
import { SidebarProvider } from '@/components/shared/sidebar-context'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext()

  if (!['NETWORK_ADMIN', 'FINANCIAL', 'MARKETING'].includes(ctx.role)) redirect('/login')

  // Tenant check + users query em paralelo — economiza 1 round-trip sequencial
  const supabase  = await createClient()
  const admin     = createAdminClient()

  const [tenantResult, userResult, unreadRes] = await Promise.all([
    (ctx.role === 'NETWORK_ADMIN' && ctx.tenantId)
      ? admin.from('tenants').select('onboarding_completed_at').eq('id', ctx.tenantId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('users').select('name').eq('auth_id', ctx.userId).single(),
    ctx.internalUserId
      ? admin.from('user_notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', ctx.internalUserId).eq('is_received', false)
      : Promise.resolve({ count: 0 }),
  ])

  if (ctx.role === 'NETWORK_ADMIN' && !tenantResult.data?.onboarding_completed_at) redirect('/setup')

  const user = userResult.data
  const initialUnread = unreadRes.count ?? 0

  return (
    <SidebarProvider>
      <AdminSidebar role={ctx.role} />
      <Topbar userName={user?.name ?? 'Admin'} userRole={ctx.role} internalUserId={ctx.internalUserId} initialUnread={initialUnread} />
      <main style={{
        marginLeft: 'var(--sidebar-w)',
        marginTop:  'var(--topbar-h)',
        padding:    'var(--content-pad-y) var(--content-pad-x)',
        minHeight:  'calc(100vh - var(--topbar-h))',
        transition: 'margin-left var(--sidebar-anim) var(--sidebar-ease)',
      }}>
        {children}
      </main>
    </SidebarProvider>
  )
}
