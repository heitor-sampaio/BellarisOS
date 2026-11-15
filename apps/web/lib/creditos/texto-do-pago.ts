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
  return credito.tipo === 'PACOTE'
    ? `Incluído no pacote ${credito.origem}${deQual('sessão', credito.numero, credito.total)}`
    : `Incluído no pré-pago de ${credito.procedimento}${deQual('unidade', credito.numero, credito.total)}`
}
