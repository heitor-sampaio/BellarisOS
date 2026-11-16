import { formatBRL } from '@estetica-os/utils'

/**
 * O custo unitário fora do comum na Entrada (A19 da 19ª simulação,
 * 2026-11-16; princípios 2 e 4). A Patrícia digitou R$ 90.000 por frasco, a
 * entrada passou calada, e a correção por Ajuste gerou uma perda de
 * R$ 180.000. O custo segue livre (é da rede — princípio 2): mais de 10 vezes
 * o custo do cadastro do produto (ou, sem ele, o preço de venda), a tela
 * AVISA. Sem referência nenhuma, não há o que comparar e nada se diz
 * (princípio 4: não chutar número).
 */
const VEZES = 10

export function avisoDoCustoDaEntrada(
  custo: number | null, ref: { custo?: number | null; venda?: number | null },
): string | null {
  if (custo == null || !(custo > 0)) return null
  const doCusto = Number(ref.custo ?? 0) > 0
  const referencia = doCusto ? Number(ref.custo) : Number(ref.venda ?? 0)
  if (!(referencia > 0) || custo <= referencia * VEZES) return null
  const de = doCusto ? 'o custo' : 'o preço de venda'
  return `${formatBRL(custo)} é mais de ${VEZES} vezes ${de} deste produto (${formatBRL(referencia)}). `
    + 'Confira o custo unitário: se estiver certo, a entrada vale assim.'
}
