import { formatBRL } from '@estetica-os/utils'

/**
 * A20 da 11ª simulação (decisão do Heitor, 2026-11-10): o crédito na clínica
 * vendido com bônus — "R$ 500,00 pagos + R$ 50,00 de bônus". A frase é UMA,
 * na venda, na ficha e no app. Puro: roda no navegador.
 */
export function textoDoBonus(pago: number, bonus: number): string {
  return `${formatBRL(pago)} pagos + ${formatBRL(bonus)} de bônus`
}
