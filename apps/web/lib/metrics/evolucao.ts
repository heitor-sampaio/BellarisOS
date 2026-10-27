import { addDaysTZ, dayKeyTZ, partsInTZ, startOfDayTZ } from '@/lib/datetime'
import type { SeriesPoint } from '@/lib/metrics/queries'

/** Um ponto do gráfico "Evolução do Período", pronto para desenhar. */
export interface PontoDaEvolucao {
  /** A hora (0–23) ou o dia do período (1…n): o eixo do gráfico. */
  day:     number
  revenue: number
  cost:    number
  profit:  number
}

/**
 * Os pontos do gráfico de evolução dos relatórios, a partir da série do banco
 * (`metrics_series`, a mesma regra do KPI: pago, sem estorno, eixo em
 * `paid_at`, fuso do negócio). Puro: só põe cada fatia no seu lugar do eixo —
 * a tela não soma nada (§13.1).
 *
 * O CUSTO é a despesa paga, e só ela (D2 da simulação de 2026-10-27). O
 * consumo de insumos NÃO entra: a compra do insumo já é despesa ("Estoque"), e
 * somar os dois contava o mesmo custo duas vezes — o gráfico dizia CUSTO
 * R$ 5.350 ao lado do cartão de despesas de R$ 4.900.
 */
export function pontosDaEvolucao(
  serie: SeriesPoint[],
  janela: { granularidade: 'hour' | 'day'; de: Date; ate: Date },
): PontoDaEvolucao[] {
  const porFatia = new Map(serie.map(p => [
    janela.granularidade === 'hour' ? String(partsInTZ(new Date(p.bucket)).hour) : dayKeyTZ(p.bucket),
    p,
  ]))
  const ponto = (chave: string, day: number): PontoDaEvolucao => {
    const p       = porFatia.get(chave)
    const revenue = p?.revenue ?? 0
    const cost    = p?.expenses ?? 0
    return { day, revenue, cost, profit: revenue - cost }
  }

  if (janela.granularidade === 'hour') {
    return Array.from({ length: 24 }, (_, h) => ponto(String(h), h))
  }
  const MS_DIA = 86_400_000
  const dias = Math.max(1, Math.floor((janela.ate.getTime() - janela.de.getTime()) / MS_DIA) + 1)
  return Array.from({ length: dias }, (_, i) => ponto(dayKeyTZ(startOfDayTZ(addDaysTZ(janela.de, i))), i + 1))
}
