import { parseDinheiro, formatBRL, DINHEIRO_INVALIDO } from '@estetica-os/utils'
import { lerEntrada } from './entrada'
import { valorDaParte, valorDaPrincipal, type EstadoDaParte } from './varias-formas'

/**
 * O troco no dinheiro (item 14 do escopo de 18/11; o Heitor: "ok"): ao receber
 * em DINHEIRO, a tela pede o "Valor entregue" (opcional) e mostra o troco; o
 * entregue MENOR que o que se paga em dinheiro avisa e não deixa confirmar.
 *
 * É só a conta do balcão: o entregue NÃO vai ao servidor nem se grava (decisão
 * do Claude pelo princípio 7) — o que se registra é o pagamento, e o caixa e
 * o Fechamento do dia contam o recebido, não o entregue. Puro: a tela e os
 * testes dividem a mesma conta, em centavos.
 */

const centavos = (v: number) => Math.round(v * 100)

export type ContaDoTroco =
  | { situacao: 'sem-entregue' }
  | { situacao: 'ilegivel'; mensagem: string }
  | { situacao: 'menor'; falta: number }
  | { situacao: 'troco'; troco: number }

/** O entregue (como foi digitado) contra o que se paga em dinheiro. */
export function contaDoTroco(valorEmDinheiro: number, entregue: string): ContaDoTroco {
  if (!(valorEmDinheiro > 0) || !entregue.trim()) return { situacao: 'sem-entregue' }
  const n = parseDinheiro(entregue)
  if (!Number.isFinite(n)) return { situacao: 'ilegivel', mensagem: DINHEIRO_INVALIDO }
  if (n < 0) return { situacao: 'ilegivel', mensagem: 'O valor entregue não pode ser negativo.' }
  const diferenca = centavos(n) - centavos(valorEmDinheiro)
  return diferenca < 0 ? { situacao: 'menor', falta: -diferenca / 100 } : { situacao: 'troco', troco: diferenca / 100 }
}

/** A recusa do botão (o entregue menor ou ilegível), ou nulo. Vazio passa: o campo é opcional. */
export function recusaDoTroco(valorEmDinheiro: number, entregue: string | undefined): string | null {
  const conta = contaDoTroco(valorEmDinheiro, entregue ?? '')
  if (conta.situacao === 'ilegivel') return conta.mensagem
  if (conta.situacao === 'menor') {
    const lido = parseDinheiro(entregue ?? '')
    return `O valor entregue (${formatBRL(lido)}) é menor que os ${formatBRL(valorEmDinheiro)} em dinheiro: faltam ${formatBRL(conta.falta)}.`
  }
  return null
}

/**
 * Quanto do pagamento é em dinheiro: a 1ª forma (o bloco escolhido), se for
 * Dinheiro, com o valor dela (o que falta das outras), mais cada outra forma em
 * Dinheiro ("+ Outra forma", D1 da 18ª). Uma nota entregue paga tudo o que é
 * em espécie.
 */
export function emDinheiro(metodoDaPrimeira: string, valorDaPrimeira: number, outras: EstadoDaParte[] = []): number {
  const daPrimeira = metodoDaPrimeira === 'CASH' ? centavos(Math.max(0, valorDaPrimeira)) : 0
  const dasOutras = outras.filter(o => o.metodo === 'CASH').reduce((s, o) => s + centavos(valorDaParte(o) ?? 0), 0)
  return (daPrimeira + dasOutras) / 100
}

/**
 * O dinheiro dos campos do pagamento (`CamposDoPagamento`): no à vista, o
 * total (dividido, a 1ª forma com o que falta); no crediário, só a ENTRADA (o
 * resto entra depois, parcela a parcela); no a receber, nada.
 */
export function emDinheiroDoEstado(
  e: { forma: string; metodo: string; entrada: string; outras?: EstadoDaParte[] },
  total: number | undefined,
): number {
  if (e.forma === 'AVISTA') {
    if (total === undefined) return 0
    const outras = e.outras ?? []
    return emDinheiro(e.metodo, outras.length ? valorDaPrincipal(total, outras) : total, outras)
  }
  if (e.forma === 'PARCELADO') {
    const lida = lerEntrada(e.entrada)
    return 'valor' in lida && lida.valor > 0 ? emDinheiro(e.metodo, lida.valor) : 0
  }
  return 0
}
