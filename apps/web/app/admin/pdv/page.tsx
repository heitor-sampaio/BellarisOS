import type { TenantContext } from '@estetica-os/types'
import { getTenantContext, podeReceber, podeVerFechamento } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { unidadesParaLer, nomeNaTela } from '@/lib/unidades/da-tela'
import { SeloUnidadeDesativada } from '@/components/shared/selo-unidade-desativada'
import { Pdv } from '@/app/_shared/pdv'
import { FechamentoDoDia } from '@/app/_shared/fechamento-do-dia'
import { getMovimentoDasUnidades } from '@/lib/metrics/fechamento-extra'
import { diaDoFechamento, janelaDoDia } from '@/lib/financeiro/fechamento'
import { fusoComum, fusoValido } from '@/lib/unidades/fuso'

/**
 * O PDV, no portal da rede: uma unidade de cada vez (`?unidade=`). Com
 * `?fechar=1`, o Fechamento do dia dentro dele (CX4): quem recebe fecha; o
 * Financeiro de todos em Ver também vê, sem fechar (D6).
 */
export default async function PdvDaRedePage({ searchParams }: {
  searchParams: Promise<{ ver?: string; comanda?: string; nova?: string; cliente?: string; unidade?: string; fechar?: string; dia?: string }>
}) {
  const ctx = await getTenantContext()
  const sp = await searchParams
  const fechar = sp.fechar === '1'
  if (fechar ? !podeVerFechamento(ctx) : !podeReceber(ctx)) throw semAcesso()
  if (fechar) return <FechamentoNaRede ctx={ctx} dia={sp.dia} unidade={sp.unidade} />

  // As unidades de LEITURA (a desativada com comanda aberta ainda recebe), e a
  // abrangência vence: quem tem unidade fixa, só a dela.
  const unidades = (await unidadesParaLer(ctx.tenantId!)).filter(u => !ctx.branchId || u.id === ctx.branchId)
  if (unidades.length === 0) {
    return <p style={{ padding: 40, color: 'var(--text-muted)' }}>Nenhuma unidade ativa.</p>
  }
  const atual = unidades.find(u => u.id === sp.unidade || u.slug === sp.unidade) ?? unidades[0]!

  return (
    <>
      {!atual.ativa && <div style={{ marginBottom: 12 }}><SeloUnidadeDesativada /></div>}
      <Pdv ctx={ctx} unidades={unidades.map(u => ({ id: u.id, name: nomeNaTela(u) }))}
        unidadeId={atual.id} slugDaUnidade={atual.slug} basePath="/admin/pdv"
        ver={sp.ver} comandaId={sp.comanda} nova={sp.nova} clienteId={sp.cliente}
        unidadeEscolhida={unidades.length === 1 || unidades.some(u => u.id === sp.unidade || u.slug === sp.unidade)} />
    </>
  )
}

/** O Fechamento do dia no PDV da rede (CX4): uma unidade por vez, e o dia de cada uma (A45 da 8ª). */
async function FechamentoNaRede({ ctx, dia, unidade }: { ctx: TenantContext; dia?: string; unidade?: string }) {
  // F72 (H6, C45): as unidades de LEITURA — a desativada com movimento no dia
  // olhado (ou com o que ficou: o a receber, a agenda) tem o fechamento dela,
  // com o selo. A abrangência vence: quem tem unidade fixa, só a dela.
  const diaPedido = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? new Date(`${dia}T12:00:00Z`) : new Date()
  const unidades = (await unidadesParaLer<{ fuso: string | null }>(ctx.tenantId!, {
    colunas: 'fuso',
    periodo: Number.isNaN(diaPedido.getTime()) ? undefined
      : { de: new Date(diaPedido.getTime() - 36 * 3_600_000), ate: new Date(diaPedido.getTime() + 36 * 3_600_000) },
  })).filter(u => !ctx.branchId || u.id === ctx.branchId)
  if (unidades.length === 0) {
    return <p style={{ padding: 40, color: 'var(--text-muted)' }}>Nenhuma unidade ativa.</p>
  }
  // A45 da 8ª: com duas ou mais, o dia de cada unidade e o da rede — e, sem
  // unidade pedida, abre na primeira que teve movimento.
  // F62: o dia de cada unidade é o do relógio dela; o "hoje" da tela, o do fuso comum.
  const fusoDaTela = fusoComum(unidades.map(u => fusoValido(u.fuso)))
  const diaDaTela = diaDoFechamento(dia, new Date(), fusoDaTela)
  const janela = janelaDoDia(diaDaTela, new Date(), fusoDaTela)!
  const daRede = unidades.length > 1
    ? await getMovimentoDasUnidades({
        tenantId: ctx.tenantId!, unidades: unidades.map(u => ({ id: u.id, name: nomeNaTela(u) })), from: janela.from, to: janela.to,
        janelaDe: id => janelaDoDia(diaDaTela, new Date(), fusoValido(unidades.find(u => u.id === id)?.fuso)),
      })
    : null
  const pedida = unidades.find(u => u.id === unidade || u.slug === unidade)
  const comMovimento = daRede?.unidades.find(u => u.lancamentos > 0)
  const atual = pedida ?? unidades.find(u => u.id === comMovimento?.id) ?? unidades[0]!

  return (
    <>
      {!atual.ativa && <div style={{ marginBottom: 12 }}><SeloUnidadeDesativada /></div>}
      <FechamentoDoDia ctx={ctx} unidades={unidades.map(u => ({ id: u.id, name: nomeNaTela(u) }))}
        unidadeId={atual.id} diaPedido={dia} basePath="/admin/pdv" daRede={daRede} />
    </>
  )
}
