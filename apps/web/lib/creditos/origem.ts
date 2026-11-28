/**
 * De onde veio o crédito na clínica da cliente (A41 da 9ª simulação; princípio
 * 3): a ficha dizia "o dinheiro entrou quando o crédito nasceu" também no
 * crédito CONCEDIDO (que nunca teve dinheiro). Três origens: o COMPRADO (o
 * "Crédito na clínica" do Vender, decisão 1 da 9ª), o que FICOU de um
 * pagamento (o cancelamento do pacote ou do plano, a devolução de produto) e o
 * CONCEDIDO pela clínica (o "Conceder crédito": a cortesia, o crédito de fora).
 * O crédito que volta de um estorno (`transactionId`) só devolve um uso: não
 * conta. Puro: serve ao servidor e ao navegador.
 */
export interface CreditoComOrigem { amount: number; concedido?: boolean | null; transactionId?: string | null }

export function textoDaOrigemDoCredito(creditos: CreditoComOrigem[]): string {
  const entradas = creditos.filter(c => c.amount > 0 && !c.transactionId)
  const concedido = entradas.some(c => c.concedido)
  const comDinheiro = entradas.some(c => !c.concedido)
  if (concedido && !comDinheiro) return 'o crédito foi concedido, sem dinheiro — não é receita'
  if (concedido && comDinheiro) return 'o crédito comprado (ou que ficou de um cancelamento) entrou no caixa quando foi pago; o concedido nunca teve dinheiro'
  return 'o dinheiro entrou quando o crédito foi comprado (ou ficou de um cancelamento)'
}

/**
 * CI-04 (D14 da 41ª): a linha do crédito na ficha diz de onde ele veio. O
 * comprado, o bônus, o do cancelamento e o da devolução já dizem na descrição
 * que o banco grava; só o "Conceder crédito" leva o texto que quem concedeu
 * digitou — esse ganha "Concedido, sem dinheiro" (não é receita).
 */
export function rotuloDaOrigemDoCredito(c: CreditoComOrigem & { comprado?: boolean | null }): string | null {
  if (!(c.amount > 0) || c.transactionId || !c.concedido || c.comprado) return null
  return 'Concedido, sem dinheiro'
}
