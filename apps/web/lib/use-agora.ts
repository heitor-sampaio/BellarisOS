'use client'

import { useSyncExternalStore } from 'react'

/**
 * O relógio do NAVEGADOR para a tela, de 30 em 30 s — sem erro de hidratação:
 * no servidor (e na hidratação) é `null`, e o navegador troca pelo dele em
 * seguida (o caminho da saudação da topbar, D18 da 9ª). Quem marca algo pela
 * hora (o agendamento que passou do horário, A21) não marca até ter o relógio.
 */
let agora: number | null = null
const ouvintes = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function assinar(avisar: () => void) {
  ouvintes.add(avisar)
  if (!timer) {
    agora = Date.now()
    timer = setInterval(() => { agora = Date.now(); ouvintes.forEach(f => f()) }, 30_000)
  }
  return () => {
    ouvintes.delete(avisar)
    if (!ouvintes.size && timer) { clearInterval(timer); timer = undefined }
  }
}

export function useAgora(): number | null {
  return useSyncExternalStore(assinar, () => agora ?? (agora = Date.now()), () => null)
}

/** O agendamento passou do horário (o fim já foi) e segue em aberto — agendado ou confirmado, sem chegada (A21 da 9ª). */
export function passouSemFechar(ev: { status: string; start: string; durationMin: number }, agoraMs: number | null): boolean {
  if (agoraMs == null || (ev.status !== 'SCHEDULED' && ev.status !== 'CONFIRMED')) return false
  return new Date(ev.start).getTime() + ev.durationMin * 60_000 <= agoraMs
}
