import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminSidebar } from '@/components/admin/sidebar'
import { Topbar } from '@/components/shared/topbar'
import { SidebarProvider } from '@/components/shared/sidebar-context'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext()

  // Portal da rede: apenas usuários de abrangência de rede (branch_id null) ou o admin.
  if (ctx.isClient) redirect('/login')
  if (ctx.branchId !== null && !ctx.isNetworkAdmin) redirect('/')

  const admin = createAdminClient()

  const [tenantResult, unreadRes] = await Promise.all([
    (ctx.role === 'NETWORK_ADMIN' && ctx.tenantId)
      ? admin.from('tenants').select('onboarding_completed_at').eq('id', ctx.tenantId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ctx.internalUserId
      ? admin.from('user_notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', ctx.internalUserId).eq('is_received', false)
      : Promise.resolve({ count: 0 }),
  ])

  if (ctx.role === 'NETWORK_ADMIN' && !tenantResult.data?.onboarding_completed_at) redirect('/setup')

  const initialUnread = unreadRes.count ?? 0

  return (
    <SidebarProvider>
      <AdminSidebar permissions={ctx.permissions} />
      <Topbar userName={ctx.userName || 'Usuário'} userRole={ctx.role} roleLabel={ctx.roleLabel} internalUserId={ctx.internalUserId} initialUnread={initialUnread} />
      <main style={{
        marginLeft:    'var(--sidebar-w)',
        marginTop:     'calc(var(--topbar-h) + env(safe-area-inset-top, 0px))',
        padding:       'var(--content-pad-y) var(--content-pad-x)',
        paddingBottom: 'calc(var(--content-pad-y) + env(safe-area-inset-bottom, 0px))',
        minHeight:     'calc(100vh - var(--topbar-h))',
        transition:    'margin-left var(--sidebar-anim) var(--sidebar-ease)',
        overflowX:     'clip',
        minWidth:      0,
      }}>
        {children}
      </main>
    </SidebarProvider>
  )
}
