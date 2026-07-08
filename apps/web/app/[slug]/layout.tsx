import { redirect, notFound } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BranchSidebar } from '@/components/branch/sidebar'
import { Topbar } from '@/components/shared/topbar'
import { SidebarProvider } from '@/components/shared/sidebar-context'
import { resolvePermissions } from '@/lib/permissions'

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

  // Portal do cliente: valida vínculo com a filial e devolve children sem chrome de staff
  if (ctx.isClient) {
    const adminClient = createAdminClient()
    const { data: clientData } = await adminClient
      .from('clients')
      .select('branch_id')
      .eq('id', ctx.clientId!)
      .single()
    if (!clientData?.branch_id) redirect('/login')
    const { data: clientBranch } = await adminClient
      .from('branches')
      .select('slug')
      .eq('id', clientData.branch_id)
      .single()
    if (clientBranch?.slug !== slug) redirect('/login')
    return <>{children}</>
  }

  if (ctx.role !== 'NETWORK_ADMIN' && !BRANCH_ROLES.includes(ctx.role as typeof BRANCH_ROLES[number])) {
    redirect('/login')
  }

  const supabase = await createClient()

  const { data: branch } = await supabase
    .from('branches')
    .select('id, name, slug')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .single()

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

  // Busca overrides de permissão, nome do usuário e filiais (NETWORK_ADMIN) em paralelo
  const [{ data: permOverrides }, { data: user }, allBranches] = await Promise.all([
    supabase
      .from('role_permissions')
      .select('module, can_view, can_write')
      .eq('tenant_id', ctx.tenantId!)
      .eq('role', ctx.role),
    supabase
      .from('users')
      .select('name')
      .eq('auth_id', ctx.userId)
      .single(),
    ctx.role === 'NETWORK_ADMIN'
      ? supabase
          .from('branches')
          .select('name, slug')
          .eq('tenant_id', ctx.tenantId!)
          .eq('is_active', true)
          .order('name')
          .then(r => r.data ?? [])
      : Promise.resolve([]),
  ])

  const permissions = resolvePermissions(ctx.role, permOverrides ?? [])

  return (
    <SidebarProvider>
      <BranchSidebar
        slug={branch.slug}
        branchName={branch.name}
        permissions={permissions}
        isNetworkAdmin={ctx.role === 'NETWORK_ADMIN'}
        allBranches={allBranches}
      />
      <Topbar userName={user?.name ?? 'Usuário'} userRole={ctx.role} />
      <main style={{
        marginLeft:  'var(--sidebar-w)',
        marginTop:   'var(--topbar-h)',
        padding:     'var(--content-pad-y) var(--content-pad-x)',
        minHeight:   'calc(100vh - var(--topbar-h))',
        transition:  'margin-left 240ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {children}
      </main>
    </SidebarProvider>
  )
}
