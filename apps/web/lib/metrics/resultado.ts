import { ratio, percent } from './period'
import type { FunnelStage } from './queries'

/**
 * Ticket médio, lucro e margem — as contas que as telas faziam cada uma
 * (Relatórios, o financeiro da unidade e da rede, o dashboard, a ficha). Puro:
 * recebe os números do banco (metrics_core, metrics_gasto_por_cliente) e
 * divide; nenhuma tela soma ou divide por conta própria (§13.1).
 */

/**
 * Ticket médio = receita de serviço ÷ atendimentos concluídos COBRADOS (preço
 * > 0) — decisão do Heitor, 2026-10-27. A avaliação de R$ 0 entrava no
 * denominador e puxava a média para baixo (R$ 90 numa clínica de limpezas de
 * R$ 180). Sem atendimento cobrado, nulo: a tela mostra "—", não R$ 0,00.
 */
export function ticketMedio(n: { serviceRevenue: number; appointmentsCharged: number }): number | null {
  return ratio(n.serviceRevenue, n.appointmentsCharged)
}

/**
 * As médias das TABELAS, que a tela dividia por conta própria (frente F,
 * 2026-10-28). Não são o ticket médio — dividem outro conjunto, e por isso
 * têm outro nome na tela (D11):
 * - "Média por atend." (ranking de clientes do dashboard da rede): o que a
 *   cliente PAGOU no período ÷ os atendimentos concluídos dela
 *   (`metrics_top_clients`); a ficha é que tem o ticket dela.
 * - "Média por execução" (Relatórios → Procedimentos): a receita do
 *   procedimento ÷ as execuções dele (`metrics_relatorio`), e o "% do Total",
 *   a parte dele na receita de serviço do período.
 * Sem denominador, nulo (a tela mostra "—" ou zero, como mostrava).
 */
export function mediaPorAtendimento(c: { totalSpent: number; appointments: number }): number | null {
  return ratio(c.totalSpent, c.appointments)
}

export function mediaPorExecucao(p: { receita: number; execucoes: number }): number | null {
  return ratio(p.receita, p.execucoes)
}

export function participacaoPct(parte: number, total: number): number | null {
  return percent(parte, total)
}

export interface ResultadoDoPeriodo {
  /** Receita paga − despesa paga (as duas pelo caixa, sem estorno). */
  lucro:     number
  /** Lucro ÷ receita, em %. Nulo sem receita: não é 0%. */
  margemPct: number | null
}

/** O resultado do período a partir do núcleo (receita e despesa pagas). */
export function resultadoDoPeriodo(n: { revenueCash: number; expensesCash: number }): ResultadoDoPeriodo {
  const lucro = n.revenueCash - n.expensesCash
  const r = ratio(lucro, n.revenueCash)
  return { lucro, margemPct: r === null ? null : r * 100 }
}

/**
 * A variação da margem, em PONTOS percentuais (20% → 22% é "+2,0 p.p.", não
 * "+10%" — percentual de percentual não existe). Nula sem uma das margens.
 */
export function variacaoDaMargemPp(atual: ResultadoDoPeriodo, anterior: ResultadoDoPeriodo): number | null {
  if (atual.margemPct === null || anterior.margemPct === null) return null
  return atual.margemPct - anterior.margemPct
}

/**
 * A variação percentual contra o período anterior. SEM base de comparação
 * (anterior = 0) não existe variação: nulo, e a tela diz "sem dados
 * anteriores" — antes o dashboard inventava "100%" a partir do zero (A37 da
 * simulação de 2026-10-27), enquanto os Relatórios diziam a verdade.
 */
export function variacaoPercentual(atual: number, anterior: number): { pct: number; up: boolean } | null {
  if (anterior === 0) return null
  const pct = ((atual - anterior) / anterior) * 100
  return { pct: Math.abs(pct), up: pct >= 0 }
}

/**
 * O resumo de UM funil, a partir das etapas que o banco contou
 * (`metrics_lead_funnel`): o total, os que viraram cliente (`converted`), os
 * nas etapas de ganho e de perda, e a conversão = convertidos ÷ total (nula
 * sem lead). É a conta do dashboard, dos Relatórios e do quadro de
 * Oportunidades — o quadro dizia "0% de conversão" ao lado de "2 viraram
 * clientes", contando só a etapa de ganho (D10 da simulação de 2026-10-28).
 */
export function resumoDoFunil(etapas: FunnelStage[]) {
  const soma = (f: (e: FunnelStage) => number) => etapas.reduce((s, e) => s + f(e), 0)
  const total = soma(e => e.leads)
  const convertidos = soma(e => e.converted)
  return {
    total,
    convertidos,
    ganhos:   soma(e => (e.outcome === 'WON' ? e.leads : 0)),
    perdidos: soma(e => (e.outcome === 'LOST' ? e.leads : 0)),
    /** O funil marca etapa de ganho / de perda (senão não há o que mostrar). */
    temGanho: etapas.some(e => e.outcome === 'WON'),
    temPerda: etapas.some(e => e.outcome === 'LOST'),
    conversaoPct: percent(convertidos, total),
  }
}
