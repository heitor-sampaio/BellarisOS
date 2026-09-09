import {
  startOfDayTZ, endOfDayTZ, startOfMonthTZ, endOfMonthTZ,
  addDaysTZ, addMonthsTZ, partsInTZ, zonedToUtc, weekdayTZ,
} from '@/lib/datetime'

/**
 * Resolução do período selecionado nos filtros dos indicadores.
 *
 * Duas regras que antes não valiam e distorciam todos os deltas:
 *  1. A janela é montada no fuso do negócio, não no do servidor.
 *  2. O período anterior tem a MESMA duração já decorrida do atual. Antes o
 *     mês corrente parcial era comparado com o mês anterior inteiro, então
 *     todo "% vs. anterior" nascia negativo no começo do mês.
 */

export type PeriodKey =
  | 'today' | 'week' | '7d' | '15d' | '30d' | 'month' | 'last_month'
  | 'quarter' | 'all' | 'custom'

export type ResolvedPeriod = {
  key:         PeriodKey
  from:        Date
  /** Fim da janela realizada: nunca passa de agora. Use para receita e caixa. */
  to:          Date
  /**
   * Fim natural do período (fim do dia/mês escolhido), mesmo no futuro.
   * Use para métricas de agenda, que precisam enxergar o que já está marcado
   * para os próximos dias — com `to` elas cresciam ao longo do dia sozinhas.
   */
  fullTo:      Date
  prevFrom:    Date
  prevTo:      Date
  /** Há base de comparação? 'all' não tem período anterior. */
  comparable:  boolean
  label:       string
  granularity: 'hour' | 'day' | 'month'
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const fmtDay = (d: Date) => {
  const p = partsInTZ(d)
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`
}

const PERIOD_KEYS: readonly string[] = [
  'today', 'week', '7d', '15d', '30d', 'month', 'last_month', 'quarter', 'all', 'custom',
]

export function isPeriodKey(v: string | undefined): v is PeriodKey {
  return v !== undefined && PERIOD_KEYS.includes(v)
}

export function resolvePeriod(
  rawPeriod?: string,
  rawFrom?: string,
  rawTo?: string,
  now: Date = new Date(),
): ResolvedPeriod {
  const key: PeriodKey = isPeriodKey(rawPeriod) ? rawPeriod : 'month'
  const p = partsInTZ(now)

  let from: Date
  let to = now
  let fullTo: Date | null = null
  let label: string
  let granularity: ResolvedPeriod['granularity'] = 'day'

  switch (key) {
    case 'today':
      from   = startOfDayTZ(now)
      fullTo = endOfDayTZ(now)
      granularity = 'hour'
      label = `Hoje, ${p.day} de ${MONTHS[p.month - 1]}`
      break

    case '7d':
    case '15d':
    case '30d': {
      const days = key === '7d' ? 7 : key === '15d' ? 15 : 30
      // "últimos N dias" = hoje + os N-1 dias anteriores; antes eram N+1 dias.
      from  = startOfDayTZ(addDaysTZ(now, -(days - 1)))
      label = `Últimos ${days} dias`
      break
    }

    case 'quarter':
      from  = startOfDayTZ(addDaysTZ(now, -89))
      label = 'Últimos 90 dias'
      break

    case 'week': {
      // Semana começa na segunda-feira.
      const wd = weekdayTZ(now)
      from  = startOfDayTZ(addDaysTZ(now, -((wd + 6) % 7)))
      label = 'Esta semana'
      break
    }

    case 'last_month': {
      const ref = addMonthsTZ(now, -1)
      from  = startOfMonthTZ(ref)
      to    = endOfMonthTZ(ref)
      label = `${MONTHS[partsInTZ(ref).month - 1]!.replace(/^\w/, c => c.toUpperCase())} de ${partsInTZ(ref).year}`
      break
    }

    case 'all':
      from        = zonedToUtc(2000, 1, 1)
      granularity = 'month'
      label       = 'Todo período'
      break

    case 'custom': {
      if (rawFrom && rawTo) {
        const [fy, fm, fd] = rawFrom.split('-').map(Number)
        const [ty, tm, td] = rawTo.split('-').map(Number)
        from  = zonedToUtc(fy!, fm!, fd!)
        to    = zonedToUtc(ty!, tm!, td!, 23, 59, 59, 999)
        label = `${fmtDay(from)} – ${fmtDay(to)}`
      } else {
        from  = startOfMonthTZ(now)
        label = `${MONTHS[p.month - 1]!.replace(/^\w/, c => c.toUpperCase())} de ${p.year}`
      }
      break
    }

    case 'month':
    default:
      from   = startOfMonthTZ(now)
      fullTo = endOfMonthTZ(now)
      label  = `${MONTHS[p.month - 1]!.replace(/^\w/, c => c.toUpperCase())} de ${p.year}`
      break
  }

  // Janela anterior de mesma duração decorrida, para o delta ser comparável.
  const elapsed = to.getTime() - from.getTime()
  let prevFrom: Date
  let prevTo:   Date

  if (key === 'last_month') {
    // Período fechado: compara com o mês inteiro anterior a ele.
    const ref = addMonthsTZ(now, -2)
    prevFrom  = startOfMonthTZ(ref)
    prevTo    = endOfMonthTZ(ref)
  } else if (key === 'month') {
    prevFrom = startOfMonthTZ(addMonthsTZ(now, -1))
    // Mesmo trecho do mês anterior, sem estourar o fim dele.
    prevTo   = new Date(Math.min(prevFrom.getTime() + elapsed, endOfMonthTZ(prevFrom).getTime()))
  } else if (key === 'today') {
    const yesterday = addDaysTZ(now, -1)
    prevFrom = startOfDayTZ(yesterday)
    prevTo   = new Date(Math.min(prevFrom.getTime() + elapsed, endOfDayTZ(yesterday).getTime()))
  } else {
    prevTo   = new Date(from.getTime() - 1)
    prevFrom = new Date(prevTo.getTime() - elapsed)
  }

  return {
    key, from, to,
    // Sem fim natural definido, o período já é fechado ou aberto até agora.
    fullTo: fullTo ?? (to > now ? to : endOfDayTZ(now)),
    prevFrom, prevTo, comparable: key !== 'all', label, granularity,
  }
}

/**
 * Variação percentual entre dois períodos.
 * Retorna null quando não há base (antes isso virava "▲ 100%" inventado).
 */
export function delta(current: number, previous: number): { value: number; up: boolean } | null {
  if (!previous) return null
  const d = ((current - previous) / previous) * 100
  return { value: Math.abs(d), up: d >= 0 }
}

/** Divisão segura: null quando não há denominador, para a UI mostrar "—". */
export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return numerator / denominator
}

/** Percentual seguro (0–100), null sem denominador. */
export function percent(numerator: number, denominator: number): number | null {
  const r = ratio(numerator, denominator)
  return r === null ? null : r * 100
}
