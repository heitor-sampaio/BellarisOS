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
  pedido: string[]; antes: string[]; ativas: string[]; unidadeDeQuemEdita: string | null
}): string[] {
  const ativas = new Set(args.ativas)
  const pedido = args.pedido.filter(u => ativas.has(u))
  const inativas = args.antes.filter(u => !ativas.has(u))
  if (args.unidadeDeQuemEdita === null) return [...new Set([...inativas, ...pedido])].sort()
  const minha = args.unidadeDeQuemEdita
  const fora = args.antes.filter(u => u !== minha)
  return [...new Set([...fora, ...(pedido.includes(minha) ? [minha] : [])])].sort()
}
