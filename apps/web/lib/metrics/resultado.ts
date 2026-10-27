import { ratio } from './period'

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
