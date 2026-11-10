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
    opcoesDoBonus: j.opcoes_do_bonus && typeof j.opcoes_do_bonus === 'object'
      ? { INTEIRO: opcao((j.opcoes_do_bonus as Record<string, unknown>).INTEIRO), PROPORCIONAL: opcao((j.opcoes_do_bonus as Record<string, unknown>).PROPORCIONAL) }
      : null,
  }
}
