import { formatarPontos } from '@/lib/fidelidade/formato'

/**
 * Os pontos que a devolução de PARTE da venda tira, ditos ANTES de devolver (ES-02; D7 da 42ª: a janela
 * dizia só "e os pontos dele saem do saldo"). A regra não muda: é a conta que `produto_devolver_itens` faz
 * ao devolver por estorno, com os pontos de cada pagamento lidos pela conta do estorno inteiro
 * (`fidelidade_pontos_do_estorno`: os que ele deu e os usados nele). Aqui só a ordem e a proporção, e o texto.
 * Puro: roda no navegador.
 */

export interface PagamentoQueVolta {
  id:       string
  valor:    number
  pagoEm:   string | null
  criadoEm: string
  /** Os pontos que este pagamento deu (o GANHO). */
  ganhos:   number
  /** Os pontos usados neste pagamento (o RESGATE): voltam no estorno inteiro dele. */
  usados:   number
}

export interface PontosDaDevolucao {
  saem:     number
  voltam:   number
  /** No "estornar inteiro e lançar o usado de novo": os pontos do que fica, lançado de novo. */
  entram:   number
  /** Os pagamentos estornados inteiros (o voucher e o prêmio deles seguem a regra do estorno inteiro). */
  inteiros: string[]
}

const centavos = (v: number) => Math.round(v * 100)

/**
 * Os dois jeitos de estornar o pagamento pego em parte. Sem pagamento em parte, os dois são o mesmo.
 * `pontosPorReal`: o do lançamento novo do que fica (a venda de produto pontua por real pago); nulo quando
 * a venda de produto não pontua.
 */
export function pontosDaDevolucao(
  pagamentos: readonly PagamentoQueVolta[], devolver: number, pontosPorReal: number | null,
): Record<'PARCIAL' | 'INTEIRO', PontosDaDevolucao> {
  const ordem = [...pagamentos].filter(p => p.valor > 0).sort((a, b) =>
    (b.pagoEm ?? b.criadoEm).localeCompare(a.pagoEm ?? a.criadoEm)
    || b.criadoEm.localeCompare(a.criadoEm) || b.id.localeCompare(a.id))
  const parcial: PontosDaDevolucao = { saem: 0, voltam: 0, entram: 0, inteiros: [] }
  const inteiro: PontosDaDevolucao = { saem: 0, voltam: 0, entram: 0, inteiros: [] }
  let resto = centavos(devolver)
  for (const p of ordem) {
    if (resto <= 0) break
    const valor = centavos(p.valor)
    if (valor <= resto) {
      for (const c of [parcial, inteiro]) { c.saem += p.ganhos; c.voltam += p.usados; c.inteiros.push(p.id) }
      resto -= valor
      continue
    }
    // Em parte: o estorno parcial tira na proporção (os usados ficam); o inteiro tira tudo, devolve os usados,
    // e o que fica entra de novo, pontuando pelo real pago.
    parcial.saem += Math.round(p.ganhos * resto / valor)
    inteiro.saem += p.ganhos
    inteiro.voltam += p.usados
    inteiro.inteiros.push(p.id)
    if (pontosPorReal !== null) inteiro.entram += Math.floor((valor - resto) * pontosPorReal / 100 + 1e-9)
    resto = 0
  }
  return { PARCIAL: parcial, INTEIRO: inteiro }
}

/** "Saem 100 pontos de Glória: o saldo dela vai de 170 a 70 pontos." — nulo sem nada a mexer, ou desligada. */
export function textoDosPontosDaDevolucao(p: { ligada: boolean; cliente: string; saldo: number; conta: PontosDaDevolucao }): string | null {
  const { saem, voltam, entram } = p.conta
  if (!p.ligada || (saem === 0 && voltam === 0 && entram === 0)) return null
  const depois = p.saldo - saem + voltam + entram
  const partes: string[] = []
  if (saem > 0) partes.push(`Saem ${formatarPontos(saem)} de ${p.cliente}`)
  if (voltam > 0) partes.push(saem > 0 ? `voltam os ${formatarPontos(voltam)} usados` : `Voltam a ${p.cliente} os ${formatarPontos(voltam)} usados`)
  let oQue = partes.join(' e ')
  if (entram > 0) {
    oQue = oQue
      ? `${oQue}, e o que fica, lançado de novo, dá ${formatarPontos(entram)}`
      : `O que fica, lançado de novo, dá ${formatarPontos(entram)} a ${p.cliente}`
  }
  return `${oQue}: o saldo dela vai de ${p.saldo.toLocaleString('pt-BR')} a ${formatarPontos(depois)}${depois < 0 ? ' (fica negativo)' : ''}.`
}
