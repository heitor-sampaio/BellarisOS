/**
 * Os filtros da Agenda (o Heitor, 18/11: a agenda só tinha "mostrar cancelados"
 * e dia/semana/mês — "Então precisa arrumar"; e a regra das Tags, CLAUDE.md §1:
 * "onde tiver for passível de filtro, um dos filtros que ela pode usar são as
 * tags"). Puro: as duas agendas (a da unidade e a da rede) dividem.
 *
 * - **Na CONSULTA** (`aplicarFiltrosDaAgenda`), nunca recortando no navegador o
 *   que já veio (CLAUDE.md §14): `?profissional=`, `?sala=` e `?tags=` vão na
 *   URL, como o `?date=`, e o servidor lê só o que passa.
 * - **O pedido não vence a abrangência**: as opções são as da tela (quem
 *   atende nas unidades dela, as salas da unidade, o vocabulário da rede); o
 *   que não está nelas não vira filtro escondido (princípio 3). Na vista
 *   pessoal (a Minha agenda) o filtro de profissional não existe
 *   (`profissionais: null`).
 * - **A tag filtra PESSOAS**: o agendamento entra se a cliente dele tem TODAS as
 *   tags marcadas (E, como a lista de Clientes e o inbox); sem cliente, sai.
 */

import { literalDeArrayDoPostgres, pedacosDaUrl, tagsParaAUrl } from '@/lib/tags/filtro-na-url'

export interface FiltrosDaAgenda {
  profissional: string | null
  sala:         string | null
  tags:         string[]
}

export const SEM_FILTRO: FiltrosDaAgenda = Object.freeze({ profissional: null, sala: null, tags: [] }) as FiltrosDaAgenda

type ValorDaBusca = string | string[] | undefined

export interface BuscaDosFiltros {
  profissional?: ValorDaBusca
  sala?:         ValorDaBusca
  tags?:         ValorDaBusca
}

export interface OpcoesDosFiltros {
  /** Quem a tela oferece; `null` = o filtro não existe (a vista pessoal da agenda). */
  profissionais: readonly string[] | null
  /** As salas da unidade na tela; `null` = sem filtro de sala (a rede sem unidade escolhida). */
  salas:         readonly string[] | null
  /** As tags do filtro: as ativas da rede e as arquivadas que alguém ainda tem (`comAsArquivadasEmUso`, lido no servidor; TG-14). */
  tags:          readonly string[]
}

const primeiro = (v: ValorDaBusca): string => (Array.isArray(v) ? v[0] : v) ?? ''
const chave = (t: string) => t.trim().toLowerCase()

/**
 * As tags marcadas na URL (`?tags=a,b`), com o nome do vocabulário. A vírgula
 * separa, mas a tag com vírgula no nome volta inteira (o pedaço mais longo que
 * é uma tag da rede ganha). O que não é tag da rede sai.
 */
export function lerTagsDaUrl(bruto: string, vocabulario: readonly string[]): string[] {
  // O leitor das outras telas (`pedacosDaUrl`): a vírgula escapada (`%2C`)
  // volta no pedaço; a da URL antiga, sem escape, junta pelo vocabulário.
  const pedacos = pedacosDaUrl(bruto)
  const porChave = new Map(vocabulario.map(v => [chave(v), v]))
  const saida: string[] = []
  let i = 0
  while (i < pedacos.length) {
    let achou = 0
    for (let j = pedacos.length; j > i; j--) {
      const nome = porChave.get(chave(pedacos.slice(i, j).join(',')))
      if (nome) {
        if (!saida.includes(nome)) saida.push(nome)
        achou = j - i
        break
      }
    }
    i += achou || 1
  }
  return saida
}

/** O que vale da URL, entre as opções da tela. */
export function filtrosDaAgenda(busca: BuscaDosFiltros, opcoes: OpcoesDosFiltros): FiltrosDaAgenda {
  const profissional = primeiro(busca.profissional)
  const sala = primeiro(busca.sala)
  return {
    profissional: opcoes.profissionais && opcoes.profissionais.includes(profissional) ? profissional : null,
    sala:         opcoes.salas && opcoes.salas.includes(sala) ? sala : null,
    tags:         lerTagsDaUrl(primeiro(busca.tags), opcoes.tags),
  }
}

export function temFiltro(f: FiltrosDaAgenda): boolean {
  return !!f.profissional || !!f.sala || f.tags.length > 0
}

/**
 * A ocupação é do TEMPO das profissionais (§13.1): com a profissional escolhida,
 * é a dela; com sala ou tag, a conta não é do que a tela mostra (princípio 3) —
 * a tela não a diz, e explica.
 */
export function ocupacaoSeMede(f: FiltrosDaAgenda): boolean {
  return !f.sala && f.tags.length === 0
}

/** O array do Postgres, cada tag entre aspas (a vírgula e o espaço no nome não quebram). */
export const literalDeTags = literalDeArrayDoPostgres

/** O pedaço do construtor do PostgREST que os filtros usam. */
interface ConsultaFiltravel {
  eq(coluna: string, valor: string): ConsultaFiltravel
  contains(coluna: string, valor: string): ConsultaFiltravel
  not(coluna: string, operador: string, valor: null): ConsultaFiltravel
}

/**
 * Os filtros na consulta de `appointments`. A de tags pede a cliente embutida
 * no select (`clients(tags)`, ou `clients(name, tags)`): o filtro vai na cliente
 * embutida e `clients=not.is.null` tira o agendamento cuja cliente não passou
 * (é o `!inner`, sem mudar o select — o tipo do select do supabase-js não
 * aceita select montado). O agendamento sem cliente, ou com a cliente sem
 * todas as tags, não vem.
 */
export function aplicarFiltrosDaAgenda<Q>(q: Q, f: FiltrosDaAgenda, embutida = 'clients'): Q {
  let r = q as unknown as ConsultaFiltravel
  if (f.profissional) r = r.eq('professional_id', f.profissional)
  if (f.sala) r = r.eq('room_id', f.sala)
  if (f.tags.length) r = r.contains(`${embutida}.tags`, literalDeTags(f.tags)).not(embutida, 'is', null)
  return r as unknown as Q
}

/**
 * A busca da URL com o filtro trocado (o resto — `?date=`, `?cancelados=`,
 * `?unidade=` — fica). `null` ou lista vazia tira o parâmetro.
 */
export function buscaComFiltro(busca: string, mudanca: Partial<FiltrosDaAgenda>): string {
  const q = new URLSearchParams(busca)
  if ('profissional' in mudanca) {
    if (mudanca.profissional) q.set('profissional', mudanca.profissional)
    else q.delete('profissional')
  }
  if ('sala' in mudanca) {
    if (mudanca.sala) q.set('sala', mudanca.sala)
    else q.delete('sala')
  }
  if ('tags' in mudanca) {
    if (mudanca.tags?.length) q.set('tags', tagsParaAUrl(mudanca.tags))
    else q.delete('tags')
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

/**
 * O bloqueio na grade filtrada: com a profissional escolhida, só o dela; com a
 * sala, só o da sala. A tag não mexe no bloqueio (ele não é de pessoa nenhuma).
 */
export function bloqueioPassaNoFiltro(b: { professionalId: string | null; roomId: string | null }, f: FiltrosDaAgenda): boolean {
  return (!f.profissional || b.professionalId === f.profissional) && (!f.sala || b.roomId === f.sala)
}
