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

  const [tenantResult, userResult] = await Promise.all([
    (ctx.role === 'NETWORK_ADMIN' && ctx.tenantId)
      ? admin.from('tenants').select('onboarding_completed_at').eq('id', ctx.tenantId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('users').select('name').eq('auth_id', ctx.userId).single(),
  ])

  if (ctx.role === 'NETWORK_ADMIN' && !tenantResult.data?.onboarding_completed_at) redirect('/setup')

  const user = userResult.data

  return (
    <SidebarProvider>
      <AdminSidebar role={ctx.role} />
      <Topbar userName={user?.name ?? 'Admin'} userRole={ctx.role} />
      <main style={{
        marginLeft: 'var(--sidebar-w)',
        marginTop:  'var(--topbar-h)',
        padding:    'var(--content-pad-y) var(--content-pad-x)',
        minHeight:  'calc(100vh - var(--topbar-h))',
        transition: 'margin-left 240ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {children}
      </main>
    </SidebarProvider>
  )
}
