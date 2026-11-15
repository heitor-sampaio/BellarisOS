import { formatBRL } from '@estetica-os/utils'

/**
 * A24 da 16ª (princípio 3): o preço do pacote nasce com a soma das sessões
 * avulsas (PC6); trocado para menos, a tela diz quanto é o desconto. Igual ou
 * acima da soma, não há desconto a dizer (null). Em centavos, para a conta
 * não arredondar errado.
 */
export function descontoDoPacote(preco: number, avulso: number): string | null {
  if (!Number.isFinite(preco) || !Number.isFinite(avulso) || avulso <= 0 || preco < 0) return null
  const centavos = Math.round(avulso * 100) - Math.round(preco * 100)
  if (centavos <= 0) return null
  const pct = (centavos / Math.round(avulso * 100)) * 100
  const pctTexto = pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return `${formatBRL(centavos / 100)} de desconto (${pctTexto}%) sobre as sessões avulsas`
}
