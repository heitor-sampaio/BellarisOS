import { formatarPontos } from '@/lib/fidelidade/formato'

/**
 * O que o estorno de um pagamento faz com os pontos, dito ANTES de estornar
 * (A30 da 12ª simulação, 2026-11-11; princípio 3: a Helena estornou o
 * pagamento da Carla sem saber que saíam os 180 pontos dela e os 200 do prêmio
 * da Ana pela indicação). A conta é do banco (`fidelidade_pontos_do_estorno`):
 * o GANHO deste pagamento, o RESGATE que volta, o saldo de hoje e o prêmio por
 * indicação ligado a ele. A regra não muda (`fidelidade.md`): aqui só o texto.
 * Puro: roda no navegador.
 */
export interface PontosDoEstorno {
  /** O programa da rede ligado: desligado, nenhum sinal de pontos. */
  ligada:  boolean
  cliente: string
  /** Os pontos que este pagamento deu (saem). */
  ganhos:  number
  /** Os pontos usados neste pagamento (voltam). */
  usados:  number
  /** O saldo da cliente hoje. */
  saldo:   number
  premio: {
    indicadora: string
    /** Os pontos do prêmio (0 quando o prêmio é um voucher). */
    pontos: number
    voucher: string | null
    voucherUsado: boolean
    /** Ela tem outro pagamento que vale: o prêmio passa para ele (sai e volta). */
    passaParaOutro: boolean
  } | null
}

export function textoDosPontosDoEstorno(p: PontosDoEstorno): string | null {
  if (!p.ligada) return null
  const partes: string[] = []
  if (p.ganhos > 0 || p.usados > 0) {
    const depois = p.saldo - p.ganhos + p.usados
    const oQue = p.ganhos > 0 && p.usados > 0
      ? `Saem ${formatarPontos(p.ganhos)} de ${p.cliente}, os que este pagamento deu, e voltam os ${formatarPontos(p.usados)} usados nele`
      : p.ganhos > 0
      ? `Saem ${formatarPontos(p.ganhos)} de ${p.cliente}, os que este pagamento deu`
      : `Voltam a ${p.cliente} os ${formatarPontos(p.usados)} usados neste pagamento`
    const saldo = `o saldo dela vai de ${p.saldo.toLocaleString('pt-BR')} a ${formatarPontos(depois)}${depois < 0 ? ' (fica negativo)' : ''}`
    partes.push(`${oQue}: ${saldo}.`)
  }
  const pr = p.premio
  if (pr) {
    const daIndicacao = `pela indicação de ${p.cliente}`
    if (pr.passaParaOutro) {
      partes.push(`O prêmio de ${pr.indicadora} ${daIndicacao}${pr.pontos > 0 ? ` (${formatarPontos(pr.pontos)})` : pr.voucher ? ` (o voucher “${pr.voucher}”)` : ''} passa para o outro pagamento de ${p.cliente}: sai e volta, e fica um só.`)
    } else if (pr.voucher) {
      partes.push(pr.voucherUsado
        ? `O voucher “${pr.voucher}” de ${pr.indicadora}, prêmio ${daIndicacao}, já foi usado: fica como foi.`
        : `O voucher “${pr.voucher}” de ${pr.indicadora}, prêmio ${daIndicacao}, é cancelado.`)
    } else if (pr.pontos > 0) {
      partes.push(`${partes.length ? 'E saem' : 'Saem'} os ${formatarPontos(pr.pontos)} do prêmio de ${pr.indicadora} ${daIndicacao}.`)
    }
  }
  return partes.length ? partes.join(' ') : null
}
