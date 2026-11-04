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

/** As parcelas do estoque no resultado, por fatia (`metrics_series_do_resultado`). */
/**
 * As parcelas do resultado por fatia: as do estoque (`metrics_series_do_resultado`)
 * e, desde 2026-11-04, as taxas da maquininha, as comissões lançadas e a despesa
 * do fechamento delas (`metrics_series_dos_custos_da_venda`).
 */
export interface FatiaDoResultado {
  bucket: string; compraDeEstoque: number; consumoDeInsumo: number
  taxasDaMaquininha?: number; comissoes?: number; despesaDeComissoes?: number
}

/**
 * Os pontos do gráfico de evolução (Relatórios e dashboard da rede), a partir
 * da série do banco (`metrics_series`, a mesma regra do KPI: pago, sem
 * estorno, eixo em `paid_at`, fuso do negócio). Puro: só põe cada fatia no seu
 * lugar do eixo — a tela não soma nada (§13.1).
 *
 * O CUSTO é o do LUCRO (decisão do Heitor, 2026-10-29; `resultadoDoPeriodo`):
 * a despesa paga SEM a compra de estoque (que fica no caixa) mais o insumo
 * consumido — `doResultado`, de `metrics_series_do_resultado`. Assim a linha
 * do lucro soma o cartão de lucro. Sem `doResultado`, o custo é a despesa paga
 * (era a regra de 2026-10-27, D2, quando o consumo era só informativo).
 */
export function pontosDaEvolucao(
  serie: SeriesPoint[],
  janela: { granularidade: 'hour' | 'day'; de: Date; ate: Date },
  doResultado: FatiaDoResultado[] = [],
): PontoDaEvolucao[] {
  const chave = (bucket: string) =>
    janela.granularidade === 'hour' ? String(partsInTZ(new Date(bucket)).hour) : dayKeyTZ(bucket)
  const porFatia = new Map(serie.map(p => [chave(p.bucket), p]))
  const estoquePorFatia = new Map(doResultado.map(p => [chave(p.bucket), p]))
  const ponto = (k: string, day: number): PontoDaEvolucao => {
    const p       = porFatia.get(k)
    const e       = estoquePorFatia.get(k)
    const revenue = p?.revenue ?? 0
    // O custo do LUCRO: a despesa sem a compra de estoque e sem o fechamento das
    // comissões, mais o insumo, as taxas da maquininha e as comissões lançadas.
    const centavos = (v: number | undefined) => Math.round((v ?? 0) * 100)
    const cost    = (centavos(p?.expenses) - centavos(e?.compraDeEstoque) - centavos(e?.despesaDeComissoes)
      + centavos(e?.consumoDeInsumo) + centavos(e?.taxasDaMaquininha) + centavos(e?.comissoes)) / 100
    return { day, revenue, cost, profit: revenue - cost }
  }

  if (janela.granularidade === 'hour') {
    return Array.from({ length: 24 }, (_, h) => ponto(String(h), h))
  }
  const MS_DIA = 86_400_000
  const dias = Math.max(1, Math.floor((janela.ate.getTime() - janela.de.getTime()) / MS_DIA) + 1)
  return Array.from({ length: dias }, (_, i) => ponto(dayKeyTZ(startOfDayTZ(addDaysTZ(janela.de, i))), i + 1))
}
