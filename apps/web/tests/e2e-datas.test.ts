import { describe, it, expect } from 'vitest'
import { dayKeyTZ } from '@/lib/datetime'
import { haMinutosHoje, cabeHoje } from '../e2e/apoio/datas'

/**
 * "Agora, N minutos atrás" — mas HOJE, em Brasília (F26, 2026-11-05).
 *
 * A 3ª completa rodou à meia-noite de Brasília (03:04 UTC = 00:04): os specs
 * que gravavam o agendamento "8 minutos atrás" o puseram às 23:56 de ONTEM.
 * A agenda de hoje não o mostrava (a janela nunca abria: 5 min de timeout),
 * a chegada recusava ("A chegada só se marca no dia do agendamento") e o
 * relatório "de hoje" contava um só dos dois procedimentos. O sistema estava
 * certo; o teste é que dependia do relógio.
 */
const AS = (iso: string) => new Date(iso)

describe('haMinutosHoje', () => {
  it('no meio do dia é só "agora menos N minutos"', () => {
    const agora = AS('2026-11-05T15:00:00Z') // 12:00 em Brasília
    expect(haMinutosHoje(40, agora)).toBe('2026-11-05T14:20:00.000Z')
  })
  it('logo depois da meia-noite, não volta para ontem: para no começo de hoje', () => {
    const agora = AS('2026-11-05T03:04:00Z') // 00:04 em Brasília
    const quando = haMinutosHoje(8, agora)
    expect(dayKeyTZ(quando)).toBe(dayKeyTZ(agora))
    expect(new Date(quando).getTime()).toBeLessThanOrEqual(agora.getTime())
  })
  it('uma hora atrás às 00:12 também fica hoje', () => {
    const agora = AS('2026-11-05T03:12:00Z')
    expect(dayKeyTZ(haMinutosHoje(60, agora))).toBe('2026-11-05')
  })
})

/**
 * "Daqui a N minutos" ainda é HOJE em Brasília? (sobra da F42, 2026-11-07).
 * `agenda-inicio-adiantado` agenda "daqui a 45 min" e confere a pergunta do
 * início adiantado — das 23:15 às 23:59 o agendamento caía em AMANHÃ, e a tela
 * dizia "A chegada só se marca no dia do agendamento" em vez de perguntar.
 */
describe('cabeHoje', () => {
  it('no meio do dia, 45 min adiante cabe', () => {
    expect(cabeHoje(45, AS('2026-11-05T15:00:00Z'))).toBe(true) // 12:00
  })
  it('às 23:20 de Brasília, 45 min adiante é amanhã', () => {
    expect(cabeHoje(45, AS('2026-11-06T02:20:00Z'))).toBe(false) // 23:20
  })
  it('às 23:20, 10 min adiante ainda cabe; às 23:55, não', () => {
    expect(cabeHoje(10, AS('2026-11-06T02:20:00Z'))).toBe(true)
    expect(cabeHoje(10, AS('2026-11-06T02:55:00Z'))).toBe(false)
  })
})
