// Métricas de atendimento do CRM (tempo de resposta, tempo sem interação, aging).
// Funções puras: o "agora" é passado como nowMs para não quebrar pureza de render.

export type AgingLevel = 'ok' | 'warn' | 'alert'

export interface AgingThresholds {
  /** segundos a partir dos quais fica "atenção" (amarelo) */
  warn:  number
  /** segundos a partir dos quais fica "atrasado" (vermelho) */
  alert: number
}

/** Cliente aguardando resposta: 1h = atenção, 4h = atrasado. */
export const AWAITING_THRESHOLDS: AgingThresholds = { warn: 3600, alert: 4 * 3600 }
/** Lead sem nenhuma interação: 3 dias = esfriando, 7 dias = frio. */
export const STALE_THRESHOLDS: AgingThresholds = { warn: 3 * 86400, alert: 7 * 86400 }

export const AGING_STYLE: Record<AgingLevel, { bg: string; color: string }> = {
  ok:    { bg: '#e8f5ec', color: '#1a7a3a' },
  warn:  { bg: '#fbeed6', color: '#8a5a1a' },
  alert: { bg: '#fde8e8', color: '#c0392b' },
}

export function secondsSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  return Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000))
}

export function agingLevel(seconds: number | null | undefined, t: AgingThresholds): AgingLevel {
  if (seconds == null) return 'ok'
  if (seconds >= t.alert) return 'alert'
  if (seconds >= t.warn)  return 'warn'
  return 'ok'
}

/** Duração curta pt-BR: "agora", "12min", "3h", "5d". */
export function formatDurationShort(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  if (seconds < 60) return 'agora'
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

/** Duração legível pt-BR: "2h 15min", "1 dia", "45min". Para tempo de resposta. */
export function formatDurationLong(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  if (seconds < 60) return 'menos de 1min'
  const totalMin = Math.floor(seconds / 60)
  if (totalMin < 60) return `${totalMin}min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d} ${d === 1 ? 'dia' : 'dias'}`
}
