import { ALL_REPORT_TABS } from '@/lib/permissions'
import { comAviso } from '@/lib/aviso-da-url'
import type { ReportTab } from '@estetica-os/types'

/**
 * A21 da 26ª simulação (princípio 3): a aba de Relatórios que a permissão não
 * abre (`?tab=financeiro`, `?tab=agenda`…) abria Vendas calada, com a URL da
 * outra aba. Agora a página leva à primeira aba da permissão, com a URL certa,
 * e o aviso diz por quê (`comAviso`, lib/aviso-da-url).
 *
 * Nulo quando não há o que fazer: nenhuma aba pedida (a tela abre a primeira),
 * a aba pedida está na permissão, ou a permissão não tem aba nenhuma (a tela
 * diz isso). Os filtros que são de outra aba (o tipo e a página das Vendas, o
 * funil das Oportunidades) ficam para trás; o período, a unidade e as tags vão.
 */
const FICAM = ['period', 'from', 'to', 'unidade', 'branch', 'tags'] as const

export function destinoDaAbaPedida(
  caminho: string,
  busca: Partial<Record<string, string | undefined>>,
  abasDaPermissao: readonly string[],
): string | null {
  const pedida = busca.tab
  if (!pedida) return null
  const primeira = ALL_REPORT_TABS.find(t => abasDaPermissao.includes(t))
  if (!primeira) return null
  if (abasDaPermissao.includes(pedida)) return null
  const params = new URLSearchParams({ tab: primeira })
  for (const chave of FICAM) {
    const valor = busca[chave]
    if (valor) params.set(chave, valor)
  }
  const existe = (ALL_REPORT_TABS as readonly string[]).includes(pedida as ReportTab)
  return comAviso(`${caminho}?${params.toString()}`, existe ? 'aba-de-relatorio' : 'aba-de-relatorio-inexistente')
}
