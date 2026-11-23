import type { AppModule, PermissionLevel } from '@estetica-os/types'
import { hasLevel } from '@/lib/permissions'

/**
 * Os cartões da Visão geral dos Relatórios, e quais pedem o Financeiro.
 *
 * O Heitor, 2026-11-23: "financeiro é uma coisa, vendas é outra. financeiro ve
 * entrada/saida/lucro, tudo. vendas é sobre performance de vendas." — e "ok" à
 * proposta: na Visão geral, a ENTRADA, a SAÍDA e o LUCRO (e o que sai só
 * deles) só aparecem com o Financeiro em Ver; o resto continua com a aba.
 *
 * Decisão do Claude, pela fala (princípio 3), de cada cartão:
 *  - só com o Financeiro: o Faturamento (a entrada), as Despesas pagas (a
 *    saída), o Lucro, a Evolução do Período (a receita, o custo do lucro e o
 *    lucro por dia), o Faturamento por Unidade e a Forma de Pagamento (a
 *    entrada por unidade e por forma);
 *  - ficam: os Atendimentos, os Novos Clientes, o Ticket médio (a média por
 *    cliente, também nas abas Clientes e Procedimentos, que não pedem o
 *    Financeiro), os Top 5 por receita dos atendimentos (a produção de cada
 *    procedimento e de cada profissional, como nas abas Procedimentos e
 *    Profissionais) e o Status dos agendamentos.
 *
 * A tela e o servidor leem esta lista: o número que não aparece nem sai do
 * servidor (`reports-bi-section`). O Copilot segue a mesma régua
 * (`veOCaixaNosRelatorios`).
 */
export const CARTOES_DA_VISAO_GERAL = [
  'faturamento', 'despesas', 'lucro', 'atendimentos', 'novosClientes', 'ticketMedio',
  'evolucao', 'faturamentoPorUnidade', 'topProcedimentos', 'topProfissionais',
  'formaDePagamento', 'statusDosAgendamentos',
] as const
export type CartaoDaVisaoGeral = (typeof CARTOES_DA_VISAO_GERAL)[number]

/** Os cartões de entrada, saída e lucro: pedem o Financeiro em Ver. */
export const CARTOES_DO_CAIXA: readonly CartaoDaVisaoGeral[] = [
  'faturamento', 'despesas', 'lucro', 'evolucao', 'faturamentoPorUnidade', 'formaDePagamento',
]

type Niveis = Partial<Record<AppModule, PermissionLevel>>

/** Vê a entrada, a saída e o lucro nos Relatórios e no Copilot: o Financeiro em Ver. */
export function veOCaixaNosRelatorios(niveis: Niveis): boolean {
  return hasLevel(niveis.financial, 'VIEW')
}

/** Os cartões da Visão geral que estes níveis veem, na ordem da tela. */
export function cartoesDaVisaoGeral(niveis: Niveis): CartaoDaVisaoGeral[] {
  const caixa = veOCaixaNosRelatorios(niveis)
  return CARTOES_DA_VISAO_GERAL.filter(c => caixa || !CARTOES_DO_CAIXA.includes(c))
}
