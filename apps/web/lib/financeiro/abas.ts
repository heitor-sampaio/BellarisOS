/**
 * As abas do Financeiro (FI1 do plano de adaptação — a revisão do Heitor,
 * 2026-11-13: "nada de recurso novo: o que já existe, organizado pelas cinco
 * perguntas de quem cuida do dinheiro"): como foi o período (Resumo), quem me
 * deve (A receber), o que eu devo (A pagar), o extrato (Movimentações) e as
 * comissões. Abre no Resumo.
 *
 * As quatro primeiras são a mesma página (`/financeiro?aba=…`); Comissões é a
 * página dela (`/financeiro/comissoes`). Os links antigos — o "Ver e dar
 * baixa" (`?aberto=todos`), o "Ver as vencidas" (`?aberto=vencidas`) e o "Ver
 * e pagar" (`?aberto=a-pagar`) — levam à aba nova.
 */

export type AbaDoFinanceiro = 'resumo' | 'a-receber' | 'a-pagar' | 'movimentacoes' | 'comissoes'

export const ABAS_DO_FINANCEIRO: readonly { chave: AbaDoFinanceiro; rotulo: string }[] = [
  { chave: 'resumo',        rotulo: 'Resumo' },
  { chave: 'a-receber',     rotulo: 'A receber' },
  { chave: 'a-pagar',       rotulo: 'A pagar' },
  { chave: 'movimentacoes', rotulo: 'Movimentações' },
  { chave: 'comissoes',     rotulo: 'Comissões' },
]

/** As abas da página `/financeiro` (Comissões é outra página). */
const DA_PAGINA: readonly AbaDoFinanceiro[] = ['resumo', 'a-receber', 'a-pagar', 'movimentacoes']

/**
 * O que o link de uma aba leva junto: o período, a unidade (na rede) e as
 * tags (`?tags=`, o filtro das listas — CLAUDE.md §1, Tags).
 */
const MANTIDOS = ['period', 'from', 'to', 'unidade', 'tags'] as const

export interface AbaPedida {
  aba: Exclude<AbaDoFinanceiro, 'comissoes'>
  /** O A receber só com as vencidas (`?aba=a-receber&aberto=vencidas`). */
  soAsVencidas: boolean
  /** O link antigo leva aqui (a busca, com o `?`); nulo = a URL já é a da aba. */
  destino: string | null
}

/** A aba pedida pela URL — ou, num link antigo, para onde ele leva. */
export function abaDoFinanceiro(sp: Record<string, string | undefined>): AbaPedida {
  const pedida = sp.aba as AbaDoFinanceiro | undefined
  if (pedida && DA_PAGINA.includes(pedida)) {
    return { aba: pedida as AbaPedida['aba'], soAsVencidas: pedida === 'a-receber' && sp.aberto === 'vencidas', destino: null }
  }
  const antigo = sp.aberto
  if (!pedida && (antigo === 'todos' || antigo === 'vencidas' || antigo === 'a-pagar')) {
    const q = new URLSearchParams({ aba: antigo === 'a-pagar' ? 'a-pagar' : 'a-receber' })
    if (antigo === 'vencidas') q.set('aberto', 'vencidas')
    for (const [k, v] of Object.entries(sp)) if (k !== 'aba' && k !== 'aberto' && v !== undefined) q.set(k, v)
    return { aba: antigo === 'a-pagar' ? 'a-pagar' : 'a-receber', soAsVencidas: antigo === 'vencidas', destino: `?${q.toString()}` }
  }
  return { aba: 'resumo', soAsVencidas: false, destino: null }
}

/**
 * O link de uma aba, com o período e a unidade da tela. `base` é o
 * `/financeiro` do portal (`/admin/financeiro` ou `/<slug>/financeiro`).
 * Comissões leva a unidade e as tags (o filtro de Tags de lá, Q04 do catálogo
 * das Comissões, revisão de 24/11), não o período: o de lá é o do fechamento.
 */
export function linkDaAba(base: string, aba: AbaDoFinanceiro, manter: Record<string, string | undefined>, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams()
  if (aba === 'comissoes') {
    if (manter.unidade) q.set('unidade', manter.unidade)
    if (manter.tags) q.set('tags', manter.tags)
    const s = q.toString()
    return `${base}/comissoes${s ? `?${s}` : ''}`
  }
  if (aba !== 'resumo') q.set('aba', aba)
  for (const [k, v] of Object.entries(extra)) q.set(k, v)
  for (const k of MANTIDOS) { const v = manter[k]; if (v) q.set(k, v) }
  const s = q.toString()
  return `${base}${s ? `?${s}` : ''}`
}

/**
 * O rótulo do cartão "A receber da cliente" (A9 da 22ª simulação; princípio
 * 3): o número grande é o que VENCE no período, e "R$ 0,00" ao lado de "Em
 * aberto: R$ 296,66" parecia contradição. O rótulo diz qual é o número.
 * A17 da 23ª: "vence no período R$ 0,00" com R$ 700 em aberto seguia confuso —
 * o número grande é o EM ABERTO (todos os vencimentos), e o do período vai na
 * nota ("Vence no período: R$ …").
 */
export const ROTULO_DO_A_RECEBER_DA_CLIENTE = 'A receber da cliente · em aberto'
