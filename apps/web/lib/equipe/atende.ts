/**
 * O "Atende" por unidade (decisão 2 do Heitor sobre a 8ª simulação,
 * 2026-11-06: "o atende vira um checklist com todas as unidades, as que
 * estiverem marcadas ficam disponiveis"). Puro: a tela e o servidor dividem.
 */

/** "A, B e C" — a lista de nomes da Equipe ("Atende em A e B"). */
export function listaDeUnidades(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('')
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

/**
 * As unidades na linha da Equipe (A28 da 18ª simulação): a principal — a do
 * login, a que o "pin" do cadastro escolhe — com "(principal)"; sozinha, só o
 * nome. "Derby (principal) e Casa Forte".
 */
export function unidadesDaLinhaDaEquipe(principal: string, outras: string[]): string {
  return outras.length ? listaDeUnidades([`${principal} (principal)`, ...outras]) : principal
}

/**
 * A lista que veio do checklist (`_atendeEm=1` + `atendeEm`, ids separados por
 * vírgula), ou null quando o formulário é o de antes (só `providesServices`).
 */
export function atendeDoFormulario(dados: FormData): string[] | null {
  if (dados.get('_atendeEm') !== '1') return null
  return String(dados.get('atendeEm') ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * O que grava: só unidades ATIVAS da rede (a marca numa unidade desativada,
 * que a tela não mostra, fica como estava); e quem tem unidade fixa (a gerente
 * da unidade) muda só a DELA — as outras marcas ficam como estavam (H7: "gerente
 * de uma unidade só mexe no que é da unidade").
 */
export function atendeQueGrava(args: {
  pedido: string[]; antes: string[]; ativas: string[]
  /** As unidades de quem edita (EQ1a: podem ser várias); null = a rede inteira. */
  unidadeDeQuemEdita: string | string[] | null
}): string[] {
  const ativas = new Set(args.ativas)
  const pedido = args.pedido.filter(u => ativas.has(u))
  const inativas = args.antes.filter(u => !ativas.has(u))
  if (args.unidadeDeQuemEdita === null) return [...new Set([...inativas, ...pedido])].sort()
  const minhas = new Set(typeof args.unidadeDeQuemEdita === 'string' ? [args.unidadeDeQuemEdita] : args.unidadeDeQuemEdita)
  const fora = args.antes.filter(u => !minhas.has(u))
  return [...new Set([...fora, ...pedido.filter(u => minhas.has(u))])].sort()
}

/**
 * O selo "Atende" da linha da Equipe (A24 da 20ª simulação; princípio 3): o
 * membro desativado seguia com "Atende em Tulipa Nazaré e Tulipa Umarizal". O
 * "Atende" fica guardado (reativar devolve), mas quem está desativado não
 * atende: sem selo.
 */
export function seloDoAtende(m: { ativo: boolean; atende: boolean; onde: readonly string[]; variasUnidades: boolean }): string | null {
  if (!m.ativo || !m.atende) return null
  return m.variasUnidades && m.onde.length ? `Atende em ${listaDeUnidades([...m.onde])}` : 'Atende'
}
