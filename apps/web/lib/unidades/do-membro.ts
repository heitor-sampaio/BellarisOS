/**
 * As UNIDADES do membro (EQ1a/EQ1b do Bloco Equipe, 2026-11-14; o Heitor,
 * 2026-11-13: "permitir linkar a pessoa em mais de uma unidade").
 *
 * No banco: `users.branch_id` nulo = "A rede inteira" (todas, inclusive as que
 * vierem); preenchido = a PRIMEIRA unidade dela (a principal: o destino do
 * login e a claim `branch_id` do token), e `users.outras_unidades` as outras.
 * No contexto: `ctx.unidades` (null = a rede inteira; senão a principal
 * primeiro) e `ctx.branchId`, a unidade em que ela ESTÁ — a do endereço,
 * quando é uma das dela; senão a principal. Nulo só para a rede inteira: é o
 * que deixa `ctx.branchId !== null` querendo dizer "não é da rede" (H7, o
 * portal da rede, a lista de quem abriu o prontuário — EQ1b).
 *
 * Puro de propósito: o contexto, a Equipe (a tela e a action) e o teste
 * dividem as mesmas regras.
 */

/** O cookie da ÚLTIMA unidade usada (PO1): o login volta a ela. Não é segredo — o slug está na URL. */
export const COOKIE_DA_ULTIMA_UNIDADE = 'bellaris-unidade'

/** As unidades do membro, a principal primeiro; null = a rede inteira. */
export function unidadesDoMembro(m: { branchId: string | null; outrasUnidades?: string[] | null }): string[] | null {
  if (m.branchId === null) return null
  return [m.branchId, ...(m.outrasUnidades ?? []).filter(u => u && u !== m.branchId)]
}

/**
 * A unidade em que a pessoa ESTÁ: a do endereço, se é uma das dela; senão a
 * principal. Nulo só para a rede inteira (ela está "na rede" em qualquer
 * portal — `ctx.branchId ?? pedido` segue funcionando para ela).
 */
export function unidadeEmQueEsta(unidades: string[] | null, unidadeDoEndereco: string | null | undefined): string | null {
  if (unidades === null) return null
  if (unidadeDoEndereco && unidades.includes(unidadeDoEndereco)) return unidadeDoEndereco
  return unidades[0] ?? null
}

/** O pedido do formulário da Equipe: a rede inteira, as unidades marcadas, ou nada (não mexe). */
export type PedidoDeUnidades = 'rede' | string[] | null

/**
 * O que o formulário pediu. `_unidades=1` + `unidades` (ids separados por
 * vírgula) é o campo "Unidades" (EQ1a); `scope=network` é "A rede inteira";
 * o formulário de antes (`scope=branch` + `branchId`) pede uma unidade só.
 * Sem nada disso, o formulário não mexe nas unidades (null).
 */
export function unidadesDoFormulario(dados: FormData): PedidoDeUnidades {
  const scope = dados.get('scope')
  if (scope === 'network') return 'rede'
  if (dados.get('_unidades') === '1') {
    return String(dados.get('unidades') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  }
  const unidade = dados.get('branchId')
  if (scope === 'branch' && typeof unidade === 'string' && unidade) return [unidade]
  return null
}

/**
 * As unidades que se gravam no membro — null = a rede inteira.
 *
 * - "A rede inteira" só a dá quem a tem (`deQuemEdita` nulo). Quem tem
 *   unidades dá só as DELAS: a marca numa unidade que não é dela é ignorada,
 *   e a que o membro já tinha fora do alcance de quem edita fica como estava
 *   (H7: "gerente de uma unidade só mexe no que é da unidade").
 * - A unidade que a tela não mostra (desativada, `ativas`) fica como estava.
 * - A principal de antes continua a principal, se ficou; senão, a primeira.
 */
export function unidadesQueGrava(args: {
  pedido: 'rede' | string[]
  /** As de antes (a principal primeiro); null = era a rede inteira; undefined = membro novo. */
  antes?: string[] | null
  /** As de quem edita; null = a rede inteira. */
  deQuemEdita: string[] | null
  /** As unidades ativas da rede (o que a tela mostra); sem isto, todas valem. */
  ativas?: string[]
}): { unidades: string[] | null } | { error: string } {
  const { pedido, deQuemEdita } = args
  const antes = args.antes ?? []
  if (pedido === 'rede') {
    if (deQuemEdita !== null) return { error: 'Só quem tem a rede inteira dá a rede inteira.' }
    return { unidades: null }
  }
  const ativas = args.ativas ? new Set(args.ativas) : null
  const visivel = (u: string) => !ativas || ativas.has(u)
  const pedidas = [...new Set(pedido.filter(Boolean))].filter(visivel)
  const escondidas = antes.filter(u => !visivel(u))
  const alcanca = (u: string) => deQuemEdita === null || deQuemEdita.includes(u)
  const ficam = antes.filter(u => visivel(u) && !alcanca(u))
  const lista = [...new Set([...escondidas, ...ficam, ...pedidas.filter(alcanca)])]
  if (!lista.some(visivel)) {
    return { error: deQuemEdita === null ? 'Marque ao menos uma unidade.' : 'Marque ao menos uma das suas unidades.' }
  }
  const principal = antes[0]
  // A principal é uma unidade que a tela mostra: a desativada só fica de "outra".
  const ordem = principal && lista.includes(principal) && visivel(principal)
    ? [principal, ...lista.filter(u => u !== principal)]
    : [...lista.filter(visivel), ...lista.filter(u => !visivel(u))]
  return { unidades: ordem }
}
