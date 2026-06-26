import { notFound } from 'next/navigation'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProceduresClient } from '@/components/branch/procedures-client'
import type { ProcedureItem } from '@/components/branch/procedures-client'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

export default async function BranchProceduresPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx      = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'])

  const supabase = await createSupabase()
  const admin    = createAdminClient()

  const { data: branch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) notFound()

  const [{ data: allProcs }, { data: apptCounts }] = await Promise.all([
    // Procedures (rede + locais da filial)
    admin
      .from('procedures')
      .select(`
        id, name, category, description, duration_min, price,
        visible_on_client_app, branch_id,
        procedure_branch_availability(branch_id)
      `)
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .or(`branch_id.is.null,branch_id.eq.${branch.id}`)
      .order('category')
      .order('name'),

    // Contagem de sessões concluídas por procedimento nesta filial
    admin
      .from('appointments')
      .select('procedure_id')
      .eq('branch_id', branch.id)
      .eq('status', 'COMPLETED'),
  ])

  // Filtra procedimentos de rede pela disponibilidade de filial
  const procedures = (allProcs ?? []).filter(p => {
    if (p.branch_id !== null) return true  // local da filial — sempre inclui
    const av = p.procedure_branch_availability as { branch_id: string }[] | null
    if (!av || av.length === 0) return true  // sem restrição → toda a rede
    return av.some(a => a.branch_id === branch.id)
  })

  // Mapa procedureId → contagem de sessões
  const sessionsMap = new Map<string, number>()
  for (const a of apptCounts ?? []) {
    const pid = a.procedure_id as string
    sessionsMap.set(pid, (sessionsMap.get(pid) ?? 0) + 1)
  }

  // Categorias únicas (ordem de aparição)
  const categoriesOrdered: string[] = []
  for (const p of procedures) {
    const cat = (p.category as string) ?? 'Outros'
    if (!categoriesOrdered.includes(cat)) categoriesOrdered.push(cat)
  }

  const items: ProcedureItem[] = procedures.map(p => ({
    id:                 p.id as string,
    name:               p.name as string,
    category:           (p.category as string) ?? 'Outros',
    description:        (p.description as string | null) ?? null,
    durationMin:        Number(p.duration_min) || 0,
    price:              parseFloat(String(p.price ?? 0)),
    sessionCount:       sessionsMap.get(p.id as string) ?? 0,
    visibleOnClientApp: Boolean(p.visible_on_client_app),
  }))

  const totalCount  = items.length
  const ticketMedio = totalCount > 0
    ? items.reduce((s, p) => s + p.price, 0) / totalCount
    : 0

  const canManage = ctx.role === 'NETWORK_ADMIN'

  return (
    <>
      <RealtimeRefresher tables={['procedures']} />
      <ProceduresClient
      procedures={items}
      categories={categoriesOrdered}
      totalCount={totalCount}
      ticketMedio={ticketMedio}
      slug={slug}
      branchId={branch.id}
      canManage={canManage}
    />
    </>
  )
}
