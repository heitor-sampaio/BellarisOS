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
 * O membro (a linha de `users`) alcança a unidade? A rede inteira, a principal
 * ou uma das outras (D1 da 17ª simulação: "Quem vendeu" e a trava da venda
 * olhavam só a principal).
 */
export function membroAlcancaAUnidade(
  m: { branch_id: string | null; outras_unidades?: string[] | null }, unidade: string,
): boolean {
  return (unidadesDoMembro({ branchId: m.branch_id, outrasUnidades: m.outras_unidades }) ?? [unidade]).includes(unidade)
}

/**
 * Quem edita (as unidades dela; null = a rede inteira) alcança TODAS as
 * unidades do membro? O cargo e o desativar valem em todas elas (o login é um
 * só): só quem alcança todas mexe (EQ1, plataforma.md). O membro da rede
 * inteira, só quem também a tem. A tela e a action dividem esta regra.
 */
export function alcancaTodasAsDoMembro(
  minhas: string[] | null, membro: { branchId: string | null; outrasUnidades?: string[] | null },
): boolean {
  if (minhas === null) return true
  const dele = unidadesDoMembro(membro)
  if (dele === null) return false
  return dele.every(u => minhas.includes(u))
}

/** A recusa de desativar/reativar quem tem uma unidade fora do alcance (era "Membro não encontrado.", e a pessoa estava na lista). */
export const FORA_DO_ALCANCE_PARA_DESATIVAR =
  'Essa pessoa também está numa unidade fora do seu alcance: desativar e reativar é de quem alcança todas as unidades dela.'

/** O porquê do cargo travado na Equipe (o mesmo motivo da recusa de `updateTeamMember`). */
export const CARGO_DE_QUEM_TEM_OUTRA_UNIDADE =
  'Essa pessoa também está numa unidade fora do seu alcance: o cargo dela só muda quem alcança todas as unidades dela.'

/**
 * O filtro do PostgREST (`.or(…)` sobre `users`) de quem alcança a unidade: a
 * rede inteira (`branch_id` nulo), a principal e as outras (D1 da 17ª). Quem
 * lê "os da unidade" na equipe usa este, nunca `branch_id.eq` sozinho.
 */
export function filtroDosMembrosDaUnidade(unidade: string): string {
  return `branch_id.is.null,branch_id.eq.${unidade},outras_unidades.cs.{${unidade}}`
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

/**
 * A principal que o cadastro vai gravar (A20 da 17ª simulação; princípio 3): a
 * de antes, se ficou marcada (como `unidadesQueGrava`); senão a primeira das
 * marcadas que a tela mostra. É o destino do login
 * (PO1), e a Equipe não dizia qual era.
 */
export function principalDasMarcadas(
  marcadas: readonly string[], naTela: readonly string[], deAntes?: string | null,
): string | null {
  if (deAntes && marcadas.includes(deAntes) && naTela.includes(deAntes)) return deAntes
  return marcadas.find(u => naTela.includes(u)) ?? null
}
