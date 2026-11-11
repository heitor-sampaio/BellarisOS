/**
 * Datas no fuso do negócio.
 *
 * O container de produção roda em UTC, então `new Date(y, m, d)` e o
 * `startOfMonth()` do date-fns produzem 21:00 do dia anterior em horário de
 * Brasília. Isso deslocava toda janela de "hoje" / "este mês" dos indicadores.
 * Todo cálculo de período deve passar por aqui, e não pelo fuso do processo.
 *
 * O fuso é o da UNIDADE (F62, o Heitor, 2026-11-11: "Não, deixa a clinica
 * configurar o seu fuso"): `branches.fuso`, com o horário de Brasília como
 * padrão. As funções de sempre (`dayKeyTZ`, `startOfDayTZ`…) seguem no de
 * Brasília; quem conhece a unidade usa `noFuso(fuso)` ou passa o fuso no
 * último argumento.
 */

export const BUSINESS_TZ = 'America/Sao_Paulo'

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

const formatadores = new Map<string, Intl.DateTimeFormat>()
function formatadorDasPartes(tz: string): Intl.DateTimeFormat {
  let f = formatadores.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12:   false,
      year:  'numeric', month:  '2-digit', day:    '2-digit',
      hour:  '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatadores.set(tz, f)
  }
  return f
}

/** Componentes de data/hora do instante, lidos no fuso (o do negócio, sem fuso). */
export function partsInTZ(date: Date, tz: string = BUSINESS_TZ): Parts {
  const map: Record<string, string> = {}
  for (const p of formatadorDasPartes(tz).formatToParts(date)) map[p.type] = p.value
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
function offsetMs(date: Date, tz: string): number {
  const p = partsInTZ(date, tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
}

/**
 * Instante UTC correspondente a uma data/hora de parede no fuso.
 * Duas passadas para acertar quando a data cai numa mudança de offset.
 */
export function zonedToUtc(
  year: number, month: number, day: number,
  hour = 0, minute = 0, second = 0, ms = 0,
  tz: string = BUSINESS_TZ,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second, ms)
  let result = new Date(naive - offsetMs(new Date(naive), tz))
  result = new Date(naive - offsetMs(result, tz))
  return result
}

// ─── Limites de janela ───────────────────────────────────────────────────────

export function startOfDayTZ(date: Date, tz: string = BUSINESS_TZ): Date {
  const p = partsInTZ(date, tz)
  return zonedToUtc(p.year, p.month, p.day, 0, 0, 0, 0, tz)
}

export function endOfDayTZ(date: Date, tz: string = BUSINESS_TZ): Date {
  const p = partsInTZ(date, tz)
  return zonedToUtc(p.year, p.month, p.day, 23, 59, 59, 999, tz)
}

export function startOfMonthTZ(date: Date, tz: string = BUSINESS_TZ): Date {
  const p = partsInTZ(date, tz)
  return zonedToUtc(p.year, p.month, 1, 0, 0, 0, 0, tz)
}

export function endOfMonthTZ(date: Date, tz: string = BUSINESS_TZ): Date {
  const p = partsInTZ(date, tz)
  // dia 0 do mês seguinte = último dia deste mês
  const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate()
  return zonedToUtc(p.year, p.month, last, 23, 59, 59, 999, tz)
}

/** Soma dias no calendário do fuso (não 24h fixas), preservando a hora do dia. */
export function addDaysTZ(date: Date, days: number, tz: string = BUSINESS_TZ): Date {
  const p = partsInTZ(date, tz)
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return zonedToUtc(
    shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(),
    p.hour, p.minute, p.second, 0, tz,
  )
}

export function addMonthsTZ(date: Date, months: number, tz: string = BUSINESS_TZ): Date {
  const p = partsInTZ(date, tz)
  const shifted = new Date(Date.UTC(p.year, p.month - 1 + months, 1))
  return zonedToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1, 0, 0, 0, 0, tz)
}

// ─── Chaves de agrupamento ───────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' no fuso (o do negócio, sem fuso) — chave de agrupamento diário. */
export function dayKeyTZ(date: Date | string, tz: string = BUSINESS_TZ): string {
  const p = partsInTZ(typeof date === 'string' ? new Date(date) : date, tz)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** 'YYYY-MM' no fuso — chave de agrupamento mensal e `period_ref`. */
export function monthKeyTZ(date: Date | string, tz: string = BUSINESS_TZ): string {
  const p = partsInTZ(typeof date === 'string' ? new Date(date) : date, tz)
  return `${p.year}-${pad(p.month)}`
}

/** `period_ref` de comissão ('YYYY-MM'), sempre no fuso do negócio. */
export const periodRef = monthKeyTZ

/** Dia da semana (0=domingo) no fuso. */
export function weekdayTZ(date: Date | string, tz: string = BUSINESS_TZ): number {
  const p = partsInTZ(typeof date === 'string' ? new Date(date) : date, tz)
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
}

// ─── Hora de parede ──────────────────────────────────────────────────────────

/**
 * O instante de uma data ('AAAA-MM-DD') e hora ('HH:MM') de PAREDE no fuso.
 * É o que `new Date(`${dia}T${hora}:00-03:00`)` fazia, preso a Brasília: o
 * 09:00 de uma unidade de Manaus é 13:00 UTC, não 12:00.
 */
export function instanteNoFuso(dia: string, hora = '00:00', tz: string = BUSINESS_TZ): Date {
  const [y, m, d] = dia.slice(0, 10).split('-').map(Number)
  const [h, mi, s] = hora.split(':').map(Number)
  if (!y || !m || !d) return new Date(NaN)
  return zonedToUtc(y, m, d, h ?? 0, mi ?? 0, s ?? 0, 0, tz)
}

/** 'HH:MM' do instante no fuso. */
export function horaNoFuso(date: Date | string, tz: string = BUSINESS_TZ): string {
  const p = partsInTZ(typeof date === 'string' ? new Date(date) : date, tz)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** As mesmas funções, presas a um fuso — `noFuso(unidade.fuso).dayKey(agora)`. */
export function noFuso(tz: string = BUSINESS_TZ) {
  return {
    tz,
    parts:        (d: Date) => partsInTZ(d, tz),
    zonedToUtc:   (y: number, m: number, d: number, h = 0, mi = 0, s = 0, ms = 0) => zonedToUtc(y, m, d, h, mi, s, ms, tz),
    startOfDay:   (d: Date) => startOfDayTZ(d, tz),
    endOfDay:     (d: Date) => endOfDayTZ(d, tz),
    startOfMonth: (d: Date) => startOfMonthTZ(d, tz),
    endOfMonth:   (d: Date) => endOfMonthTZ(d, tz),
    addDays:      (d: Date, n: number) => addDaysTZ(d, n, tz),
    addMonths:    (d: Date, n: number) => addMonthsTZ(d, n, tz),
    dayKey:       (d: Date | string) => dayKeyTZ(d, tz),
    monthKey:     (d: Date | string) => monthKeyTZ(d, tz),
    weekday:      (d: Date | string) => weekdayTZ(d, tz),
    instante:     (dia: string, hora = '00:00') => instanteNoFuso(dia, hora, tz),
    hora:         (d: Date | string) => horaNoFuso(d, tz),
  }
}
