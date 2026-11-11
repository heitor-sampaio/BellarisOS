import { addDaysTZ, dayKeyTZ, partsInTZ, startOfDayTZ } from '@/lib/datetime'
import type { SeriesPoint } from '@/lib/metrics/queries'

/** Um ponto do gráfico "Evolução do Período", pronto para desenhar. */
export interface PontoDaEvolucao {
  /** A hora (0–23) ou o dia do período (1…n): o eixo do gráfico. */
  day:     number
  /**
   * O que o ponto É, para o tooltip e o eixo (A44 da 6ª simulação: o hover
   * dizia "Dia 3" para as 03h do "Hoje"): "03h" por hora; a DATA ("04/11"),
   * no fuso do negócio, por dia.
   */
  rotulo:  string
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
  /** O fuso do recorte (F62): o mesmo em que o banco montou as barras. Sem ele, o de Brasília. */
  fuso?: string,
): PontoDaEvolucao[] {
  const chave = (bucket: string) =>
    janela.granularidade === 'hour' ? String(partsInTZ(new Date(bucket), fuso).hour) : dayKeyTZ(bucket, fuso)
  const porFatia = new Map(serie.map(p => [chave(p.bucket), p]))
  const estoquePorFatia = new Map(doResultado.map(p => [chave(p.bucket), p]))
  const ponto = (k: string, day: number, rotulo: string): PontoDaEvolucao => {
    const p       = porFatia.get(k)
    const e       = estoquePorFatia.get(k)
    const revenue = p?.revenue ?? 0
    // O custo do LUCRO: a despesa sem a compra de estoque e sem o fechamento das
    // comissões, mais o insumo, as taxas da maquininha e as comissões lançadas.
    const centavos = (v: number | undefined) => Math.round((v ?? 0) * 100)
    const cost    = (centavos(p?.expenses) - centavos(e?.compraDeEstoque) - centavos(e?.despesaDeComissoes)
      + centavos(e?.consumoDeInsumo) + centavos(e?.taxasDaMaquininha) + centavos(e?.comissoes)) / 100
    return { day, rotulo, revenue, cost, profit: revenue - cost }
  }

  if (janela.granularidade === 'hour') {
    return Array.from({ length: 24 }, (_, h) => ponto(String(h), h, `${String(h).padStart(2, '0')}h`))
  }
  const MS_DIA = 86_400_000
  const dias = Math.max(1, Math.floor((janela.ate.getTime() - janela.de.getTime()) / MS_DIA) + 1)
  return Array.from({ length: dias }, (_, i) => {
    const k = dayKeyTZ(startOfDayTZ(addDaysTZ(janela.de, i, fuso), fuso), fuso)
    return ponto(k, i + 1, `${k.slice(8, 10)}/${k.slice(5, 7)}`)
  })
}
