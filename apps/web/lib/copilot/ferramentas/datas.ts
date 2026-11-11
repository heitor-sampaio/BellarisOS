import { zonedToUtc, BUSINESS_TZ } from '@/lib/datetime'
import { nomeDoFuso } from '@/lib/unidades/fuso'

/**
 * As datas do Copilot no relógio da UNIDADE (F62b): o "hoje", o dia inteiro,
 * o "agende às 14:30" e o "qui., 09/10 às 14:30" que ele lê e grava. Puro —
 * quem chama resolve o fuso (`fusoDe`, em `comum.ts`); sem fuso, o de
 * Brasília, e nada muda para quem não mexeu no fuso.
 */

export function partesDaData(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number)
  return [a!, m!, d!]
}

/** O dia inteiro (00:00 a 23:59:59.999) no fuso, em UTC. */
export function janelaDoDia(iso: string, fuso: string = BUSINESS_TZ): { inicio: Date; fim: Date } {
  const [a, m, d] = partesDaData(iso)
  return { inicio: zonedToUtc(a, m, d, 0, 0, 0, 0, fuso), fim: zonedToUtc(a, m, d, 23, 59, 59, 999, fuso) }
}

/** Um instante de parede ("2026-10-09" + "14:30") no fuso, em UTC. */
export function instanteDe(data: string, hora: string, fuso: string = BUSINESS_TZ): Date {
  const [a, m, d] = partesDaData(data)
  const [h, min] = hora.split(':').map(Number)
  return zonedToUtc(a, m, d, h!, min!, 0, 0, fuso)
}

/** O dia de hoje no fuso ("AAAA-MM-DD"). */
export function hojeNoFuso(fuso: string = BUSINESS_TZ, agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

/** A hora de agora no fuso ("HH:MM", 24 h). */
export function horaAgoraNoFuso(fuso: string = BUSINESS_TZ, agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(agora)
}

/** "qui., 09/10 às 14:30" — o horário legível para o modelo e para o cartão. */
export function quandoLegivel(iso: string | Date, fuso: string = BUSINESS_TZ): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, weekday: 'short', day: '2-digit', month: '2-digit' }).format(d)
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' }).format(d)
  return `${dia} às ${hora}`
}

/** O "Agora:" do prompt — a data, a hora e o dia ISO no fuso, com o nome dele. */
export function agoraLegivel(agora: Date = new Date(), fuso: string = BUSINESS_TZ): string {
  const data = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }).format(agora)
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' }).format(agora)
  return `${data}, ${hora} (${nomeDoFuso(fuso)}; hoje em ISO: ${hojeNoFuso(fuso, agora)})`
}
