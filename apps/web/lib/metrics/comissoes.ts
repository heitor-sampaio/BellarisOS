/**
 * Os totais das comissões que as telas somavam cada uma (C46/C-17 da F68):
 * o "Minhas comissões" do dashboard, o cartão de Comissões do Financeiro e os
 * totais da tela de Comissões. As linhas já vêm do banco (o resumo agregado
 * por profissional e unidade; o detalhe, inteiro e paginado); aqui só se soma,
 * ao centavo, num lugar só. Puro: roda no navegador e no teste.
 */

const centavos = (v: number) => Math.round(v * 100) / 100

export interface TotaisDoResumo { aPagar: number; liberado: number; pago: number; aguardando: number }

/** As linhas do resumo (uma por profissional e unidade) somadas. */
export function totaisDoResumoDasComissoes(linhas: TotaisDoResumo[]): TotaisDoResumo {
  const t = { aPagar: 0, liberado: 0, pago: 0, aguardando: 0 }
  for (const l of linhas) {
    t.aPagar += l.aPagar; t.liberado += l.liberado; t.pago += l.pago; t.aguardando += l.aguardando
  }
  return { aPagar: centavos(t.aPagar), liberado: centavos(t.liberado), pago: centavos(t.pago), aguardando: centavos(t.aguardando) }
}

interface Lancamento { professionalId: string; professionalName: string; amount: number; isPaid: boolean }

/** O total, o pago e cada profissional (na ordem em que aparece) com o seu total. */
export function totaisDasComissoes<T extends Lancamento>(lancamentos: T[]): {
  total: number; pago: number
  porProfissional: { id: string; name: string; total: number; itens: T[] }[]
} {
  let total = 0, pago = 0
  const grupos = new Map<string, { id: string; name: string; total: number; itens: T[] }>()
  for (const l of lancamentos) {
    total += l.amount
    if (l.isPaid) pago += l.amount
    const g = grupos.get(l.professionalId) ?? { id: l.professionalId, name: l.professionalName, total: 0, itens: [] }
    g.total += l.amount
    g.itens.push(l)
    grupos.set(l.professionalId, g)
  }
  return {
    total: centavos(total), pago: centavos(pago),
    porProfissional: [...grupos.values()].map(g => ({ ...g, total: centavos(g.total) })),
  }
}
