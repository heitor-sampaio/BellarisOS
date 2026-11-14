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

/** O que o link de uma aba leva junto: o período e a unidade (na rede). */
const MANTIDOS = ['period', 'from', 'to', 'unidade'] as const

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
 * Comissões leva só a unidade (o período de lá é o do fechamento).
 */
export function linkDaAba(base: string, aba: AbaDoFinanceiro, manter: Record<string, string | undefined>, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams()
  if (aba === 'comissoes') {
    if (manter.unidade) q.set('unidade', manter.unidade)
    const s = q.toString()
    return `${base}/comissoes${s ? `?${s}` : ''}`
  }
  if (aba !== 'resumo') q.set('aba', aba)
  for (const [k, v] of Object.entries(extra)) q.set(k, v)
  for (const k of MANTIDOS) { const v = manter[k]; if (v) q.set(k, v) }
  const s = q.toString()
  return `${base}${s ? `?${s}` : ''}`
}
