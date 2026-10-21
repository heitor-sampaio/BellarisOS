/**
 * As barras do gráfico do financeiro da unidade (receita × despesa no
 * período). Os VALORES vêm de `metrics_series` (lib/metrics, a regra de
 * metrics_core: pago, eixo em paid_at, estorno fora dos dois lados); aqui só
 * se posiciona cada um no seu intervalo e se completam os vazios com zero.
 * Até 2026-10-21 a tela somava a lista de lançamentos (§13.1) — sem tirar o
 * estorno e com o fuso do navegador.
 *
 * Puro: roda no navegador.
 */

export interface BarDatum { label: string; income: number; expense: number }
export interface PontoDaSerie { bucket: string; revenue: number; expenses: number }

const FUSO = 'America/Sao_Paulo'
const diaDe   = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d)
const horaDe  = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hour12: false }).format(d)) % 24
const rotuloDoDia = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

/** A granularidade que a série pede para cada período. */
export function granularidadeDoPeriodo(period: string): 'hour' | 'week' | 'day' {
  return period === 'today' ? 'hour' : period === 'quarter' ? 'week' : 'day'
}

export function montarBarras(serie: PontoDaSerie[], period: string, inicioISO: string, agora: Date = new Date()): BarDatum[] {
  const gran = granularidadeDoPeriodo(period)

  if (gran === 'hour') {
    const horas: BarDatum[] = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, income: 0, expense: 0 }))
    for (const p of serie) {
      const h = horaDe(new Date(p.bucket))
      horas[h] = { label: `${h}h`, income: p.revenue, expense: p.expenses }
    }
    return horas
  }

  if (gran === 'week') {
    return [...serie]
      .sort((a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime())
      .map(p => ({ label: rotuloDoDia(diaDe(new Date(p.bucket))), income: p.revenue, expense: p.expenses }))
  }

  const porDia = new Map(serie.map(p => [diaDe(new Date(p.bucket)), p]))
  const saida: BarDatum[] = []
  const hoje = diaDe(agora)
  let dia = diaDe(new Date(inicioISO))
  for (let guarda = 0; dia <= hoje && guarda < 400; guarda++) {
    const p = porDia.get(dia)
    saida.push({ label: rotuloDoDia(dia), income: p?.revenue ?? 0, expense: p?.expenses ?? 0 })
    dia = new Date(new Date(`${dia}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
  }
  return saida
}
