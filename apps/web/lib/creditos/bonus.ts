import { formatBRL } from '@estetica-os/utils'

/**
 * A20 da 11ª simulação (decisão do Heitor, 2026-11-10): o crédito na clínica
 * vendido com bônus — "R$ 500,00 pagos + R$ 50,00 de bônus". A frase é UMA,
 * na venda, na ficha e no app. Puro: roda no navegador.
 */
export function textoDoBonus(pago: number, bonus: number): string {
  return `${formatBRL(pago)} pagos + ${formatBRL(bonus)} de bônus`
}

/**
 * A31 da 12ª simulação: o "Já usado" do estorno da venda de crédito com bônus.
 * O banco devolve o usado do PAGO (`usado` = o pago − o que volta) e o bônus que
 * sai; o que ficou do bônus foi usado também. "R$ 180,00 usados, R$ 16,36 deles
 * do bônus" (a Bruna: R$ 300 + R$ 30, usou R$ 180, o bônus na proporção) — era
 * "R$ 163,64", e a diferença não aparecia. Em centavos; sem bônus usado, só o
 * valor.
 */
export function textoDoJaUsado(p: { usado: number; bonus: number; bonusSai: number }): string {
  const doBonus = Math.max(0, Math.round(p.bonus * 100) - Math.round(p.bonusSai * 100))
  const usado = Math.round(p.usado * 100) + doBonus
  return doBonus > 0 ? `${formatBRL(usado / 100)} usados, ${formatBRL(doBonus / 100)} deles do bônus` : formatBRL(usado / 100)
}
