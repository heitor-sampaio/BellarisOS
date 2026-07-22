import { redirect, notFound } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BranchSidebar } from '@/components/branch/sidebar'
import { Topbar } from '@/components/shared/topbar'
import { SidebarProvider } from '@/components/shared/sidebar-context'
import { getCachedBranchBySlug } from '@/lib/cached-queries'

const BRANCH_ROLES = ['BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL', 'FINANCIAL'] as const

export default async function BranchLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()

  // Portal do cliente: valida vínculo com a filial e devolve children sem chrome de staff.
  // 1 query com join (antes eram 2 sequenciais: clients → branches).
  if (ctx.isClient) {
    const adminClient = createAdminClient()
    const { data: clientData } = await adminClient
      .from('clients')
      .select('branch_id, branches!inner(slug)')
      .eq('id', ctx.clientId!)
      .single()
    const clientBranch = clientData?.branches as unknown as { slug: string } | null
    if (!clientData?.branch_id || clientBranch?.slug !== slug) redirect('/login')
    return <>{children}</>
  }

  // Usuário operacional (não-cliente). O acesso a cada módulo é gateado por
  // assertPermission nas páginas; aqui só validamos vínculo com a filial (abaixo).
  const supabase = await createClient()

  const branch = await getCachedBranchBySlug(slug, ctx.tenantId!)

  if (!branch) notFound()

  // Usuário de filial só pode acessar a própria filial
  if (ctx.branchId && ctx.branchId !== branch.id) {
    const { data: userBranch } = await supabase
      .from('branches')
      .select('slug')
      .eq('id', ctx.branchId)
      .single()
    redirect(`/${userBranch?.slug ?? ''}/dashboard`)
  }

  // Filiais (NETWORK_ADMIN) + não-lidas em paralelo. Nome e permissões já vêm no ctx.
  const [allBranches, unreadRes] = await Promise.all([
    ctx.role === 'NETWORK_ADMIN'
      ? supabase
          .from('branches')
          .select('name, slug')
          .eq('tenant_id', ctx.tenantId!)
          .eq('is_active', true)
          .order('name')
          .then(r => r.data ?? [])
      : Promise.resolve([]),
    ctx.internalUserId
      ? createAdminClient()
          .from('user_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', ctx.internalUserId)
          .eq('is_received', false)
      : Promise.resolve({ count: 0 }),
  ])

  const permissions   = ctx.permissions
  const initialUnread = unreadRes.count ?? 0

  return (
    <SidebarProvider>
      <BranchSidebar
        slug={branch.slug}
        branchName={branch.name}
        permissions={permissions}
        isNetworkAdmin={ctx.role === 'NETWORK_ADMIN'}
        allBranches={allBranches}
      />
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
