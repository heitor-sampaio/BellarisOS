import { getTenantContext, podeVerFechamento } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { FechamentoDoDia } from '@/app/_shared/fechamento-do-dia'
import { getMovimentoDasUnidades } from '@/lib/metrics/fechamento-extra'
import { diaDoFechamento, janelaDoDia } from '@/lib/financeiro/fechamento'
import { fusoComum, fusoValido } from '@/lib/unidades/fuso'

/** O fechamento do dia, no portal da rede: uma unidade de cada vez (`?unidade=`). */
export default async function FechamentoDaRedePage({ searchParams }: {
  searchParams: Promise<{ dia?: string; unidade?: string }>
}) {
  const ctx = await getTenantContext()
  // A unidade inteira: quem recebe ou o financeiro de todos (D6, 2026-10-27).
  if (!podeVerFechamento(ctx)) throw semAcesso()
  const sp = await searchParams

  let q = createAdminClient().from('branches').select('id, name, slug, fuso')
    .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name')
  if (ctx.branchId) q = q.eq('id', ctx.branchId)
  const unidades = ((await ler(q, 'carregar as unidades')) ?? []) as { id: string; name: string; slug: string; fuso: string | null }[]
  if (unidades.length === 0) {
    return <p style={{ padding: 40, color: 'var(--text-muted)' }}>Nenhuma unidade ativa.</p>
  }
  // A45 da 8ª: com duas ou mais, o dia de cada unidade e o da clínica — e,
  // sem unidade pedida, abre na primeira que teve movimento (era a primeira em
  // ordem alfabética, sem movimento nenhum).
  // F62: o dia de cada unidade é o do relógio dela; o "hoje" da tela, o do fuso comum.
  const fusoDaTela = fusoComum(unidades.map(u => fusoValido(u.fuso)))
  const diaDaTela = diaDoFechamento(sp.dia, new Date(), fusoDaTela)
  const janela = janelaDoDia(diaDaTela, new Date(), fusoDaTela)!
  const daRede = unidades.length > 1
    ? await getMovimentoDasUnidades({
        tenantId: ctx.tenantId!, unidades, from: janela.from, to: janela.to,
        janelaDe: id => janelaDoDia(diaDaTela, new Date(), fusoValido(unidades.find(u => u.id === id)?.fuso)),
      })
    : null
  const pedida = unidades.find(u => u.id === sp.unidade || u.slug === sp.unidade)
  const comMovimento = daRede?.unidades.find(u => u.lancamentos > 0)
  const atual = pedida ?? unidades.find(u => u.id === comMovimento?.id) ?? unidades[0]!

  return (
    <FechamentoDoDia ctx={ctx} unidades={unidades.map(u => ({ id: u.id, name: u.name }))}
      unidadeId={atual.id} diaPedido={sp.dia} basePath="/admin/fechamento" daRede={daRede} />
  )
}
