/**
 * O estoque inicial do cadastro do produto, dividido entre as unidades (E11 do
 * Bloco Estoque, o Heitor, 2026-11-13: "mantem como está, mas com
 * possibilidade de dividir a entrada entre as unidades") — e quais unidades a
 * pessoa oferece (E13 + EQ1d: "Se for pessoa de uma unidade especifica, unidade
 * vem pré-preenchida e não pode ser mudada. Se a pessoa tiver mais de uma
 * unidade, a lista mostra apenas as unidades dela.").
 *
 * Puro de propósito: a tela, a action e o teste dividem as mesmas regras. O
 * alcance (`alcancaUnidade`) e a rede quem confere é a action, e a função do
 * banco (`produto_cadastrar`) confere a rede de novo, numa transação.
 */

export interface LinhaDoEstoqueInicial { unidade: string; quantidade: number }

export const RECUSA_SEM_UNIDADE = 'Escolha a unidade que vai receber o estoque inicial.'
export const RECUSA_UNIDADE_REPETIDA = 'Cada unidade aparece uma vez no estoque inicial.'

function numero(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  const n = parseFloat(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * As linhas do formulário: `_branchId` e `initial_qty` repetidos, na mesma
 * ordem (uma linha por unidade). A linha sem quantidade (ou com zero) não
 * conta. Sem nenhum `_branchId` (o chamador de antes, de uma unidade só), vale
 * a unidade em que a pessoa está. A unidade repetida é recusada: a tela não a
 * oferece duas vezes, e somar calado seria uma conta que a tela não mostra.
 */
export function linhasDoEstoqueInicial(
  dados: Pick<FormData, 'getAll'>, unidadeEmQueEsta: string | null,
): { linhas: LinhaDoEstoqueInicial[] } | { error: string } {
  const unidades = dados.getAll('_branchId').map(v => (typeof v === 'string' ? v.trim() : ''))
  const qtds = dados.getAll('initial_qty').map(numero)
  const linhas: LinhaDoEstoqueInicial[] = []
  const total = Math.max(unidades.length, qtds.length)
  for (let i = 0; i < total; i++) {
    const quantidade = qtds[i] ?? null
    if (quantidade == null || !(quantidade > 0)) continue
    const unidade = unidades.length === 0 ? (unidadeEmQueEsta ?? '') : (unidades[i] ?? '')
    if (!unidade) return { error: RECUSA_SEM_UNIDADE }
    if (linhas.some(l => l.unidade === unidade)) return { error: RECUSA_UNIDADE_REPETIDA }
    linhas.push({ unidade, quantidade })
  }
  return { linhas }
}

/**
 * As unidades que o cadastro do produto oferece: as ativas que a pessoa
 * alcança (`minhas` nulo = a rede inteira, todas). Com uma só, a tela a
 * mostra escrita, travada; com mais, a lista tem só estas.
 */
export function unidadesDoCadastro<U extends { id: string }>(ativas: readonly U[], minhas: readonly string[] | null): U[] {
  return minhas === null ? [...ativas] : ativas.filter(u => minhas.includes(u.id))
}
