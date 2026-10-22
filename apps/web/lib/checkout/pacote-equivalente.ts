/**
 * O pacote do catálogo que EQUIVALE ao plano (2026-10-21, decisão do Heitor):
 * os mesmos procedimentos, nas mesmas quantidades (cada procedimento de cada
 * sessão conta um), e mais barato que o total do plano. Com mais de um, o
 * mais barato. O checkout o sugere ("Fechar como pacote X") e, aceito, a
 * diferença entra como DESCONTO do plano — que continua montado por
 * procedimento (o desconto é rateado como sempre, §9.6).
 *
 * Pura e em centavos, para o servidor montar e o teste provar.
 */

export interface PacoteParaComparar {
  id: string
  name: string
  price: number
  itens: { procedureId: string; quantidade: number }[]
}

export interface PacoteEquivalente { id: string; nome: string; preco: number; economia: number }

const centavos = (v: number) => Math.round(v * 100)

export function pacoteEquivalente(
  sessoes: { procedures: { procedureId: string }[] }[],
  totalDoPlano: number,
  pacotes: PacoteParaComparar[],
): PacoteEquivalente | null {
  const doPlano = new Map<string, number>()
  for (const s of sessoes) for (const p of s.procedures) doPlano.set(p.procedureId, (doPlano.get(p.procedureId) ?? 0) + 1)
  if (doPlano.size === 0) return null

  const cabe = (pac: PacoteParaComparar) => {
    const doPacote = new Map<string, number>()
    for (const i of pac.itens) doPacote.set(i.procedureId, (doPacote.get(i.procedureId) ?? 0) + i.quantidade)
    if (doPacote.size !== doPlano.size) return false
    for (const [id, n] of doPlano) if (doPacote.get(id) !== n) return false
    return true
  }

  const total = centavos(totalDoPlano)
  const melhor = pacotes
    .filter(p => cabe(p) && centavos(p.price) < total)
    .sort((a, b) => centavos(a.price) - centavos(b.price))[0]
  if (!melhor) return null
  return { id: melhor.id, nome: melhor.name, preco: melhor.price, economia: (total - centavos(melhor.price)) / 100 }
}
