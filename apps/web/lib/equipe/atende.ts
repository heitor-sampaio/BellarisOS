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
  /**
   * As unidades que a PESSOA terá (null = a rede inteira). A marca numa
   * unidade desativada fora delas sai: a tela não a mostra, e o "Atende" só
   * vale nas unidades da pessoa (o Heitor, 2026-11-23). Sem isto, fica.
   */
  unidadesDaPessoa?: string[] | null
}): string[] {
  const ativas = new Set(args.ativas)
  const pedido = args.pedido.filter(u => ativas.has(u))
  const daPessoa = (u: string) => !args.unidadesDaPessoa || args.unidadesDaPessoa.includes(u)
  const inativas = args.antes.filter(u => !ativas.has(u) && daPessoa(u))
  if (args.unidadeDeQuemEdita === null) return [...new Set([...inativas, ...pedido])].sort()
  const minhas = new Set(typeof args.unidadeDeQuemEdita === 'string' ? [args.unidadeDeQuemEdita] : args.unidadeDeQuemEdita)
  const fora = args.antes.filter(u => !minhas.has(u))
  return [...new Set([...fora, ...pedido.filter(u => minhas.has(u))])].sort()
}

/**
 * O "Atende" só vale nas unidades DA PESSOA (o Heitor, 2026-11-23: "uma
 * pessoa só pode atender nas unidades que faz parte, isso é obvio"). Devolve
 * as marcas FORA delas — vazio quando cabe. `unidades` nulo = "A rede
 * inteira": qualquer unidade da rede cabe.
 */
export function atendeForaDasUnidades(atende: readonly string[], unidades: readonly string[] | null): string[] {
  if (unidades === null) return []
  return atende.filter(u => !unidades.includes(u))
}

/**
 * "Mudar a equipe de unidade" (a janela de desativar a unidade, H6): a pessoa
 * sai da unidade `origem` e entra na `destino`. O "Atende" só vale nas
 * unidades dela (o Heitor, 2026-11-23), então a marca na `origem` vai para a
 * `destino` — o que ela fazia na que sai, faz na nova (decisão do Claude,
 * catálogo de 24/11, princípio 3; o resto do "Atende" fica como ela escolheu).
 * Nulo quando a `origem` não está no "Atende": nada a regravar.
 */
export function atendeAoMudarDeUnidade(atende: readonly string[], origem: string, destino: string): string[] | null {
  if (!atende.includes(origem)) return null
  return [...new Set([...atende.filter(u => u !== origem), destino])].sort()
}

/** A recusa de quem marca o "Atende" fora das unidades da pessoa. */
export const ATENDE_SO_NAS_UNIDADES_DA_PESSOA = 'O “Atende” só vale nas unidades da pessoa.'

/**
 * Como marcar o "Atende" — com os nomes que a ficha da Equipe MOSTRA: a caixa “Atende clientes” e, com mais de uma
 * unidade, o “Escolher em quais unidades atende” (o “Atende clientes em” é o título da lista que só aparece depois
 * dele, e quem seguia o aviso procurava um nome que não via). A frase é a da Equipe (o Heitor, 25/11: "ok").
 */
export const O_ATENDE_NA_FICHA = 'o “Atende clientes” (com mais de uma unidade, em “Escolher em quais unidades atende”)'

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

/**
 * O que o "Atende" do cadastro envia (D9 da 32ª, 2026-11-26). A regra é a do
 * Heitor (8ª simulação: "o atende vira um checklist com todas as unidades, as
 * que estiverem marcadas ficam disponiveis"): vale onde está MARCADO. Por isso
 * a caixa fechada só acompanha as "Unidades" da pessoa (`acompanha`) quando
 * isso foi pedido na tela — a caixa ligada agora, no cadastro novo ou na
 * edição, ou "Atender em todas as unidades dela". Na edição de quem já atende,
 * a lista que ela tinha fica: a unidade acrescentada aparece desmarcada, com a
 * lista à vista (`listaAVista`), e a tirada sai (o Heitor, 23/11: "uma pessoa
 * só pode atender nas unidades que faz parte"). Decisão do Claude, 26/11. Puro.
 */
export function estadoDoAtende(o: {
  ligado: boolean
  /** A lista aberta por quem edita ("Escolher em quais unidades atende"). */
  aberto: boolean
  /** Segue as "Unidades" da pessoa (pedido na tela). */
  acompanha: boolean
  marcadas: readonly string[]
  unidadesDela: readonly string[]
}): { efetivo: string[]; listaAVista: boolean; caixa: boolean } {
  const nasDela = o.marcadas.filter(u => o.unidadesDela.includes(u))
  const com = (efetivo: string[], listaAVista: boolean) => ({ efetivo, listaAVista, caixa: efetivo.length > 0 })
  if (o.aberto) return com(nasDela, true)
  if (!o.ligado) return com([], false)
  if (o.acompanha) return com([...o.unidadesDela], false)
  // A lista dela não cobre todas as unidades dela: a tela a mostra, para quem
  // edita ver (e marcar) a unidade nova. A caixa marcada sem unidade nenhuma
  // dela no que se envia aparece desmarcada (princípio 3).
  const falta = o.unidadesDela.some(u => !nasDela.includes(u))
  return com(nasDela, falta && o.unidadesDela.length > 1 && nasDela.length > 0)
}
