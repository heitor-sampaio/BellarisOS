import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProceduresClient } from '@/components/branch/procedures-client'
import type { ProcedureItem } from '@/components/branch/procedures-client'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { ler } from '@/lib/db'
import { getSessoesPorProcedimento } from '@/lib/metrics/unidade'

export default async function BranchProceduresPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx      = await getTenantContext()
  assertPermission(ctx, 'procedures', 'VIEW')

  const supabase = await createSupabase()
  const admin    = createAdminClient()

  const branch = await ler(supabase
    .from('branches')
    .select('id, name')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()

  const [allProcs, sessionsMap] = await Promise.all([
    ler(// Procedures (rede + locais da filial)
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
      .order('name'), 'carregar os procedimentos'),

    // Sessões concluídas por procedimento nesta filial, contadas no banco:
    // trazer uma linha por atendimento cortava em 1000 (§13.1).
    getSessoesPorProcedimento([branch.id]),
  ])

  // Filtra procedimentos de rede pela disponibilidade de filial
  const procedures = (allProcs ?? []).filter(p => {
    if (p.branch_id !== null) return true  // local da filial — sempre inclui
    const av = p.procedure_branch_availability as { branch_id: string }[] | null
    if (!av || av.length === 0) return true  // sem restrição → toda a rede
    return av.some(a => a.branch_id === branch.id)
  })

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

  // "Preço médio" do CATÁLOGO — média dos preços de tabela, não dinheiro que
  // entrou. Chamava-se "ticket médio", que no sistema inteiro é receita dos
  // atendimentos ÷ atendimentos concluídos (§13.1): se a conta é outra, o
  // nome tem de ser outro. É uma média sobre a lista já exibida, não um
  // indicador do período.
  const totalCount = items.length
  const precoMedio = totalCount > 0
    ? items.reduce((s, p) => s + p.price, 0) / totalCount
    : 0

  // Sem `canManage`: o catálogo é da rede e só se altera em `/admin/procedures`.
  return (
    <>
      <RealtimeRefresher tables={['procedures']} />
      <ProceduresClient
        procedures={items}
        categories={categoriesOrdered}
        totalCount={totalCount}
        precoMedio={precoMedio}
      />
    </>
  )
}
