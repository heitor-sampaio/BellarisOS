import { lerParcial, type PagamentoEmParte } from '@/lib/pacotes/cancelamento'

/**
 * A conta do estorno de uma venda de crédito na clínica (decisão 1 da 9ª
 * simulação), como o banco a fez (`credito_estornar_venda` simulando): o que
 * foi vendido, o pagamento vivo, o saldo da cliente hoje, o que volta (o que
 * ela ainda não usou, até o pago) e o usado, que fica pago. `parcial` é o
 * pagamento que o estorno pega EM PARTE — o mesmo formato do cancelamento do
 * pacote (`EscolhaDaDevolucao`).
 */
export interface PreviaDoEstornoDoCredito {
  vendido: number
  pago:    number
  saldo:   number
  volta:   number
  usado:   number
  metodo:  string | null
  vezes:   number | null
  parcial: PagamentoEmParte | null
  /** A20 da 11ª: o bônus da venda e quanto dele sai no estorno (pela escolha). */
  bonus:    number
  bonusSai: number
  /** As duas formas de o bônus sair, com o que volta em cada uma (do banco). */
  opcoesDoBonus: { INTEIRO: { volta: number; bonusSai: number }; PROPORCIONAL: { volta: number; bonusSai: number } } | null
  /** D1 da 41ª: a escolha do bônus com que o banco fez ESTA conta (nula sem escolha, ou sem bônus). */
  bonusComo: 'INTEIRO' | 'PROPORCIONAL' | null
  /**
   * O crédito CONCEDIDO (o "Conceder crédito", o bônus de outra venda) que está no
   * saldo e fica com a cliente: não volta em dinheiro (auditoria das regras,
   * 2026-11-18 — decisão do Claude pelos princípios: "não vamos fazer as
   * clinicas perderem dinheiro").
   */
  concedidoFica: number
}

const opcao = (v: unknown) => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { volta: num(o.volta), bonusSai: num(o.bonus_sai) }
}

const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100

export function lerPreviaDoEstornoDoCredito(v: unknown): PreviaDoEstornoDoCredito {
  const j = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    vendido: num(j.vendido),
    pago:    num(j.pago),
    saldo:   num(j.saldo),
    volta:   num(j.volta),
    usado:   num(j.usado),
    metodo:  typeof j.metodo === 'string' ? j.metodo : null,
    vezes:   j.vezes == null ? null : Number(j.vezes),
    parcial: lerParcial(j.parcial),
    bonus:    num(j.bonus),
    bonusSai: num(j.bonus_sai),
    concedidoFica: num(j.concedido_fica),
    bonusComo: j.bonus_como === 'INTEIRO' || j.bonus_como === 'PROPORCIONAL' ? j.bonus_como : null,
    opcoesDoBonus: j.opcoes_do_bonus && typeof j.opcoes_do_bonus === 'object'
      ? { INTEIRO: opcao((j.opcoes_do_bonus as Record<string, unknown>).INTEIRO), PROPORCIONAL: opcao((j.opcoes_do_bonus as Record<string, unknown>).PROPORCIONAL) }
      : null,
  }
}

/**
 * A conta que a janela mostra e manda ao banco como o "esperado" (D1 da 41ª
 * simulação; CI-08). Na venda com bônus, só a conta que o banco fez COM a
 * escolha marcada: ao marcar "Na proporção", a janela seguia com a simulação
 * anterior (a do inteiro) até a nova chegar, e confirmar nesse meio mandava o
 * "volta" do inteiro — o banco calculava o da proporção e recusava ("Os valores
 * do crédito mudaram…"). Nula: ainda calculando (ou sem escolha).
 */
export function contaDaEscolha(
  previa: PreviaDoEstornoDoCredito | null, bonusComo: 'INTEIRO' | 'PROPORCIONAL' | null,
): PreviaDoEstornoDoCredito | null {
  if (!previa) return null
  if (!(previa.bonus > 0)) return previa
  return bonusComo && previa.bonusComo === bonusComo ? previa : null
}
