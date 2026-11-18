interface FunilAtivo { id: string; is_default: boolean }

/**
 * O funil que o bloco do Dashboard abre (A30 da 20ª simulação; princípio 7):
 * abria no "Funil de vendas" padrão, vazio ("0 de 0"), com as 4 oportunidades
 * no "Corporal". O pedido no endereço (`?funil=`) vale sempre; sem ele, o
 * padrão — e, vazio no período, o primeiro funil que tem oportunidade. Todos
 * vazios, o padrão. Lê o funil uma vez só (devolve as etapas lidas).
 *
 * Desde a 23ª é também o funil do quadro de Oportunidades e da aba Comercial
 * dos Relatórios (A28: abriam no padrão vazio), e o último funil ESCOLHIDO no
 * seletor (`lembrado`, o cookie de `lib/crm/funil-lembrado.ts` — A34: voltar
 * pelo menu abria no padrão) vem logo depois do pedido. O lembrado que não
 * está entre os ativos (arquivado, apagado, de outra rede) não conta.
 */
export async function funilDoDashboard<T extends FunilAtivo, S>(args: {
  funis: readonly T[]
  pedido: string | null | undefined
  lembrado?: string | null
  lerFunil: (id: string) => Promise<S>
  total: (etapas: S) => number
}): Promise<{ funil: T | undefined; etapas: S | null }> {
  const pedido = args.funis.find(f => f.id === args.pedido) ?? args.funis.find(f => f.id === args.lembrado)
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
