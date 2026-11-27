import { ALL_REPORT_TABS, REPORT_TAB_LABELS } from '@/lib/permissions'
import type { ReportTab } from '@estetica-os/types'

const lista = (nomes: readonly string[]) =>
  nomes.length === 1 ? nomes[0]! : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`

/**
 * A9 da 35ª simulação (princípio 3; decisão do Claude, 27/11): o "Relatórios"
 * do resumo do cargo ("O que essa pessoa vai ver") diz quais abas abrem — como
 * o "Configurações (só …)" das abas das Configurações. Todas: "Relatórios";
 * mais da metade: o que falta ("sem Financeiro"); senão, as marcadas, na ordem
 * da tela.
 */
export function rotuloDosRelatorios(abas: readonly ReportTab[]): string {
  const marcadas = ALL_REPORT_TABS.filter(t => abas.includes(t))
  const faltam = ALL_REPORT_TABS.filter(t => !abas.includes(t))
  if (!faltam.length || !marcadas.length) return 'Relatórios'
  if (faltam.length < marcadas.length) return `Relatórios (sem ${lista(faltam.map(t => REPORT_TAB_LABELS[t]))})`
  return `Relatórios (só ${lista(marcadas.map(t => REPORT_TAB_LABELS[t]))})`
}
