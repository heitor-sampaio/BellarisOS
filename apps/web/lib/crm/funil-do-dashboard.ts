interface FunilAtivo { id: string; is_default: boolean }

/**
 * O funil que o bloco do Dashboard abre (A30 da 20ª simulação; princípio 7):
 * abria no "Funil de vendas" padrão, vazio ("0 de 0"), com as 4 oportunidades
 * no "Corporal". O pedido no endereço (`?funil=`) vale sempre; sem ele, o
 * padrão — e, vazio no período, o primeiro funil que tem oportunidade. Todos
 * vazios, o padrão. Lê o funil uma vez só (devolve as etapas lidas).
 */
export async function funilDoDashboard<T extends FunilAtivo, S>(args: {
  funis: readonly T[]
  pedido: string | null | undefined
  lerFunil: (id: string) => Promise<S>
  total: (etapas: S) => number
}): Promise<{ funil: T | undefined; etapas: S | null }> {
  const pedido = args.funis.find(f => f.id === args.pedido)
  if (pedido) return { funil: pedido, etapas: await args.lerFunil(pedido.id) }
  const padrao = args.funis.find(f => f.is_default) ?? args.funis[0]
  if (!padrao) return { funil: undefined, etapas: null }
  const doPadrao = await args.lerFunil(padrao.id)
  if (args.total(doPadrao) > 0) return { funil: padrao, etapas: doPadrao }
  for (const f of args.funis) {
    if (f.id === padrao.id) continue
    const etapas = await args.lerFunil(f.id)
    if (args.total(etapas) > 0) return { funil: f, etapas }
  }
  return { funil: padrao, etapas: doPadrao }
}
