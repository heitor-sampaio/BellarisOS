import type { CreditoParaAgendar } from '@/lib/creditos/credito'

/** "(sessão 2 de 3)" — sem o número, nada. */
export const deQual = (rotulo: string, numero?: number, total?: number) =>
  numero && total ? ` (${rotulo} ${numero} de ${total})` : ''

/**
 * O que o app diz no lugar do preço quando o agendamento usa um crédito da
 * cliente (D10 da 8ª). "Incluído", nunca "Já pago" (A10/A17 da 15ª simulação,
 * princípio 3): o pacote pode estar no crediário com dinheiro em aberto, e o
 * app dizia "Já pago" a quem ainda devia R$ 1.500. Pura: o teste a chama.
 */
export function textoDoCreditoNoApp(
  credito: Pick<CreditoParaAgendar, 'tipo' | 'origem' | 'procedimento' | 'numero' | 'total'>,
): string {
  return textoDoCreditoAoAgendar(credito)
}

/**
 * O mesmo texto no agendar da EQUIPE (A3 da 25ª simulação, princípio 3): a
 * agenda, o inbox e o Copilot diziam "Já pago" — também da sessão do plano
 * recebido no crediário, com parcelas em aberto. E a sessão do plano caía no
 * texto do pré-pago. A6 da 25ª: a "unidade" do pré-pago é a sessão (unidade é
 * a unidade da rede, CLAUDE.md §1).
 */
export function textoDoCreditoAoAgendar(
  credito: Pick<CreditoParaAgendar, 'tipo' | 'origem' | 'procedimento' | 'numero' | 'total'>,
): string {
  const qual = deQual('sessão', credito.numero, credito.total)
  if (credito.tipo === 'PACOTE') return `Incluído no pacote ${credito.origem}${qual}`
  if (credito.tipo === 'PLANO') return `Incluído no plano de tratamento${qual}`
  return `Incluído no pré-pago de ${credito.procedimento}${qual}`
}
