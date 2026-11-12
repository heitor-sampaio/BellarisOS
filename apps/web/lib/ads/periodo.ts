import { dayKeyTZ, BUSINESS_TZ } from '@/lib/datetime'
import type { ResolvedPeriod } from '@/lib/metrics/period'
import type { DateRange } from './types'

/**
 * O intervalo que o cartão de marketing do dashboard pede à Meta (C47 da F68):
 * o MESMO período da tela. "Hoje", "7 dias" e "Todo período" têm preset na
 * Meta; o mês, os 15 dias e o personalizado vão com as datas (`since`/`until`,
 * no fuso do recorte) — antes viravam "últimos 30 dias" em silêncio. O
 * `preset` fica como reserva para o provedor que não aceita datas.
 */
export function intervaloDosAnuncios(p: ResolvedPeriod, tz: string = BUSINESS_TZ): DateRange {
  if (p.key === 'today') return { preset: 'today' }
  if (p.key === '7d')    return { preset: '7d' }
  if (p.key === 'all')   return { preset: 'all' }
  return { preset: '30d', since: dayKeyTZ(p.from, tz), until: dayKeyTZ(p.to, tz) }
}
