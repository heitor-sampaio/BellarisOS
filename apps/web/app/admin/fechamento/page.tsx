import { getTenantContext, podeVerFechamento } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { unidadesParaLer, nomeNaTela } from '@/lib/unidades/da-tela'
import { SeloUnidadeDesativada } from '@/components/shared/selo-unidade-desativada'
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

  // F72 (H6, C45): as unidades de LEITURA — a desativada com movimento no dia
  // olhado (ou com o que ficou: o a receber, a agenda) tem o fechamento dela,
  // com o selo. A abrangência vence: quem tem unidade fixa, só a dela.
  const diaPedido = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? new Date(`${sp.dia}T12:00:00Z`) : new Date()
  const unidades = (await unidadesParaLer<{ fuso: string | null }>(ctx.tenantId!, {
    colunas: 'fuso',
    periodo: Number.isNaN(diaPedido.getTime()) ? undefined
      : { de: new Date(diaPedido.getTime() - 36 * 3_600_000), ate: new Date(diaPedido.getTime() + 36 * 3_600_000) },
  })).filter(u => !ctx.branchId || u.id === ctx.branchId)
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
        tenantId: ctx.tenantId!, unidades: unidades.map(u => ({ id: u.id, name: nomeNaTela(u) })), from: janela.from, to: janela.to,
        janelaDe: id => janelaDoDia(diaDaTela, new Date(), fusoValido(unidades.find(u => u.id === id)?.fuso)),
      })
    : null
  const pedida = unidades.find(u => u.id === sp.unidade || u.slug === sp.unidade)
  const comMovimento = daRede?.unidades.find(u => u.lancamentos > 0)
  const atual = pedida ?? unidades.find(u => u.id === comMovimento?.id) ?? unidades[0]!

  return (
    <>
      {!atual.ativa && <div style={{ marginBottom: 12 }}><SeloUnidadeDesativada /></div>}
      <FechamentoDoDia ctx={ctx} unidades={unidades.map(u => ({ id: u.id, name: nomeNaTela(u) }))}
        unidadeId={atual.id} diaPedido={sp.dia} basePath="/admin/fechamento" daRede={daRede} />
    </>
  )
}
