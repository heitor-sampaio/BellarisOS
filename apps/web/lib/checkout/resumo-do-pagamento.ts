import { formatBRL } from '@estetica-os/utils'
import { dividirEmParcelas } from '@/lib/checkout/parcelas'

/**
 * O pagamento em uma linha, antes de vender (A46/A47 da 5ª simulação): a
 * venda com "Entrada + parcelas" mostrava só "Vender por R$ 3.300,00", e o
 * crédito não dizia "até 4x" nem o valor da parcela.
 *
 * A divisão é a MESMA dos lançamentos (`dividirEmParcelas`: centavos, a
 * sobra na última), e as parcelas iguais se juntam: "3× R$ 1.000,00" ou
 * "2× R$ 333,33 + 1× R$ 333,34".
 */

function juntar(valores: number[]): string {
  const grupos: { valor: number; n: number }[] = []
  for (const v of valores) {
    const ult = grupos[grupos.length - 1]
    if (ult && Math.abs(ult.valor - v) < 0.005) ult.n++
    else grupos.push({ valor: v, n: 1 })
  }
  return grupos.map(g => `${g.n}× ${formatBRL(g.valor)}`).join(' + ')
}

/** "Entrada R$ 300,00 + 3× R$ 1.000,00" — ou, sem entrada, "3× R$ 1.100,00". Nulo sem o que dividir. */
export function resumoDasParcelas(total: number, entrada: number, parcelas: number): string | null {
  const saldo = Math.round((total - Math.max(0, entrada)) * 100) / 100
  if (!(total > 0) || !(parcelas >= 1) || saldo <= 0) return null
  const valores = dividirEmParcelas(saldo, parcelas, '2026-01-01').map(p => p.amount)
  const parte = juntar(valores)
  return entrada > 0 ? `Entrada ${formatBRL(entrada)} + ${parte}` : parte
}

/** "3× R$ 366,67" no cartão em N vezes (o valor de cada parcela na maquininha). Nulo à vista. */
export function resumoDasVezes(total: number, vezes: number): string | null {
  if (!(total > 0) || !(vezes > 1)) return null
  return juntar(dividirEmParcelas(total, vezes, '2026-01-01').map(p => p.amount))
}
