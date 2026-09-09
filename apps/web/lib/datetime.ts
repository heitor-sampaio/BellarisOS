/**
 * Datas no fuso do negócio (America/Sao_Paulo).
 *
 * O container de produção roda em UTC, então `new Date(y, m, d)` e o
 * `startOfMonth()` do date-fns produzem 21:00 do dia anterior em horário de
 * Brasília. Isso deslocava toda janela de "hoje" / "este mês" dos indicadores.
 * Todo cálculo de período deve passar por aqui, e não pelo fuso do processo.
 */

export const BUSINESS_TZ = 'America/Sao_Paulo'

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  hour12:   false,
  year:  'numeric', month:  '2-digit', day:    '2-digit',
  hour:  '2-digit', minute: '2-digit', second: '2-digit',
})

/** Componentes de data/hora do instante, lidos no fuso do negócio. */
export function partsInTZ(date: Date): Parts {
  const map: Record<string, string> = {}
  for (const p of partsFormatter.formatToParts(date)) map[p.type] = p.value
  return {
    year:   Number(map.year),
    month:  Number(map.month),
    day:    Number(map.day),
    // 'en-US' com hour12:false emite 24 para a meia-noite
    hour:   Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

/** Quanto o horário do fuso está à frente do UTC, em ms, naquele instante. */
function offsetMs(date: Date): number {
  const p = partsInTZ(date)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
}

/**
 * Instante UTC correspondente a uma data/hora de parede no fuso do negócio.
 * Duas passadas para acertar quando a data cai numa mudança de offset.
 */
export function zonedToUtc(
  year: number, month: number, day: number,
  hour = 0, minute = 0, second = 0, ms = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second, ms)
  let result = new Date(naive - offsetMs(new Date(naive)))
  result = new Date(naive - offsetMs(result))
  return result
}

// ─── Limites de janela ───────────────────────────────────────────────────────

export function startOfDayTZ(date: Date): Date {
  const p = partsInTZ(date)
  return zonedToUtc(p.year, p.month, p.day)
}

export function endOfDayTZ(date: Date): Date {
  const p = partsInTZ(date)
  return zonedToUtc(p.year, p.month, p.day, 23, 59, 59, 999)
}

export function startOfMonthTZ(date: Date): Date {
  const p = partsInTZ(date)
  return zonedToUtc(p.year, p.month, 1)
}

export function endOfMonthTZ(date: Date): Date {
  const p = partsInTZ(date)
  // dia 0 do mês seguinte = último dia deste mês
  const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate()
  return zonedToUtc(p.year, p.month, last, 23, 59, 59, 999)
}

/** Soma dias no calendário do fuso (não 24h fixas), preservando a hora do dia. */
export function addDaysTZ(date: Date, days: number): Date {
  const p = partsInTZ(date)
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return zonedToUtc(
    shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(),
    p.hour, p.minute, p.second,
  )
}

export function addMonthsTZ(date: Date, months: number): Date {
  const p = partsInTZ(date)
  const shifted = new Date(Date.UTC(p.year, p.month - 1 + months, 1))
  return zonedToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1)
}

// ─── Chaves de agrupamento ───────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' no fuso do negócio — chave de agrupamento diário. */
export function dayKeyTZ(date: Date | string): string {
  const p = partsInTZ(typeof date === 'string' ? new Date(date) : date)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** 'YYYY-MM' no fuso do negócio — chave de agrupamento mensal e `period_ref`. */
export function monthKeyTZ(date: Date | string): string {
  const p = partsInTZ(typeof date === 'string' ? new Date(date) : date)
  return `${p.year}-${pad(p.month)}`
}

/** `period_ref` de comissão ('YYYY-MM'), sempre no fuso do negócio. */
export const periodRef = monthKeyTZ

/** Dia da semana (0=domingo) no fuso do negócio. */
export function weekdayTZ(date: Date | string): number {
  const p = partsInTZ(typeof date === 'string' ? new Date(date) : date)
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
}
