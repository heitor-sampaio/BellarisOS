import { getTenantContext, podeReceber, can } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { FechamentoDoDia } from '@/app/_shared/fechamento-do-dia'

/** O fechamento do dia, no portal da rede: uma unidade de cada vez (`?unidade=`). */
export default async function FechamentoDaRedePage({ searchParams }: {
  searchParams: Promise<{ dia?: string; unidade?: string }>
}) {
  const ctx = await getTenantContext()
  if (!podeReceber(ctx) && !can(ctx, 'financial', 'VIEW')) throw semAcesso()
  const sp = await searchParams

  let q = createAdminClient().from('branches').select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name')
  if (ctx.branchId) q = q.eq('id', ctx.branchId)
  const unidades = ((await ler(q, 'carregar as unidades')) ?? []) as { id: string; name: string; slug: string }[]
  if (unidades.length === 0) {
    return <p style={{ padding: 40, color: 'var(--text-muted)' }}>Nenhuma unidade ativa.</p>
  }
  const atual = unidades.find(u => u.id === sp.unidade || u.slug === sp.unidade) ?? unidades[0]!

  return (
    <FechamentoDoDia ctx={ctx} unidades={unidades.map(u => ({ id: u.id, name: u.name }))}
      unidadeId={atual.id} diaPedido={sp.dia} basePath="/admin/fechamento" />
  )
}
