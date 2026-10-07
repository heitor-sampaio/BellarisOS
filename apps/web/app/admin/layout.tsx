import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { AdminSidebar } from '@/components/admin/sidebar'
import { Topbar } from '@/components/shared/topbar'
import { avisoDaAssinatura } from '@/lib/redes/aviso'
import { SidebarProvider } from '@/components/shared/sidebar-context'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext()

  // Portal da rede: apenas usuários de abrangência de rede (branch_id null) ou o admin.
  if (ctx.isClient) redirect('/login')
  if (ctx.branchId !== null && !ctx.isNetworkAdmin) redirect('/')

  const admin = createAdminClient()

  const [tenant, unreadRes] = await Promise.all([
    // A rede É lida com `ler`: com o erro descartado, uma falha na consulta
    // parecia "onboarding não concluído" e mandava o admin para /setup.
    (ctx.role === 'NETWORK_ADMIN' && ctx.tenantId)
      ? ler(admin.from('tenants').select('onboarding_completed_at').eq('id', ctx.tenantId).maybeSingle(), 'carregar a rede')
      : Promise.resolve(null),
    ctx.internalUserId
      ? admin.from('user_notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', ctx.internalUserId).eq('is_received', false)
      : Promise.resolve({ count: 0, error: null }),
  ])

  if (ctx.role === 'NETWORK_ADMIN' && !tenant?.onboarding_completed_at) redirect('/setup')

  // O contador do sino é acessório: falhar aqui não pode derrubar o portal
  // inteiro. A falha fica no log e o sino começa em zero (o realtime corrige).
  if (unreadRes.error) console.error('[admin/layout] contar as notificações:', unreadRes.error.message)
  const initialUnread = unreadRes.count ?? 0

  return (
    <SidebarProvider>
      <AdminSidebar permissions={ctx.permissions} plano={ctx.plano ?? null} />
      <Topbar userName={ctx.userName || 'Usuário'} userRole={ctx.role} roleLabel={ctx.roleLabel} internalUserId={ctx.internalUserId} initialUnread={initialUnread} slug={null} permissions={ctx.permissions} plano={ctx.plano ?? null} suporte={ctx.suporte ?? null} assinatura={await avisoDaAssinatura(ctx)} />
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
