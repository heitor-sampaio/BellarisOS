import { redirect, notFound } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
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

  if (ctx.role === 'CLIENT') redirect('/login')
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

  // Busca overrides de permissão e nome do usuário em paralelo
  const [{ data: permOverrides }, { data: user }] = await Promise.all([
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
  ])

  const permissions = resolvePermissions(ctx.role, permOverrides ?? [])

  // Para o NETWORK_ADMIN: busca todas as filiais para o seletor de unidade
  const allBranches = ctx.role === 'NETWORK_ADMIN'
    ? await supabase
        .from('branches')
        .select('name, slug')
        .eq('tenant_id', ctx.tenantId!)
        .eq('is_active', true)
        .order('name')
        .then(r => r.data ?? [])
    : []

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
