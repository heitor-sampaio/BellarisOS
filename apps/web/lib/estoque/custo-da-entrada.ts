import { formatBRL } from '@estetica-os/utils'

/**
 * O custo unitário fora do comum na Entrada (A19 da 19ª simulação,
 * 2026-11-16; princípios 2 e 4). A Patrícia digitou R$ 90.000 por frasco, a
 * entrada passou calada, e a correção por Ajuste gerou uma perda de
 * R$ 180.000. O custo segue livre (é da rede — princípio 2): mais de 10 vezes
 * o custo do cadastro do produto (ou, sem ele, o preço de venda), a tela
 * AVISA.
 *
 * A10 da 24ª (o Heitor: "As duas"): sem referência nenhuma — o produto novo, o
 * cadastro com o estoque inicial —, R$ 40.000 por seringa também passava
 * calado. Sem o que comparar, avisa a partir de `CUSTO_FORA_DO_COMUM` por
 * embalagem. É só o aviso: o número não entra em conta nenhuma, e a rede
 * grava o valor que escolheu.
 */
const VEZES = 10
export const CUSTO_FORA_DO_COMUM = 10_000

export function avisoDoCustoDaEntrada(
  custo: number | null, ref: { custo?: number | null; venda?: number | null },
): string | null {
  if (custo == null || !(custo > 0)) return null
  const doCusto = Number(ref.custo ?? 0) > 0
  const referencia = doCusto ? Number(ref.custo) : Number(ref.venda ?? 0)
  if (!(referencia > 0)) {
    if (custo < CUSTO_FORA_DO_COMUM) return null
    return `${formatBRL(custo)} é um custo fora do comum para uma embalagem. `
      + 'Confira o custo unitário: se estiver certo, vale assim.'
  }
  if (custo <= referencia * VEZES) return null
  const de = doCusto ? 'o custo' : 'o preço de venda'
  return `${formatBRL(custo)} é mais de ${VEZES} vezes ${de} deste produto (${formatBRL(referencia)}). `
    + 'Confira o custo unitário: se estiver certo, a entrada vale assim.'
}
