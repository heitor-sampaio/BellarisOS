import { describe, it, expect } from 'vitest'
import { ehODiaDoAgendamento } from '@/lib/agenda/chegada'
import { atendimentosPorExtenso, rolagemDaGrade } from '@/lib/agenda/grade'
import { proximoHorarioLivre } from '@/lib/agenda/proximo-livre'
import { eventosDeConfirmacaoEChegada } from '@/lib/clients/historico-do-agendamento'

// A frente "agenda" da simulação de 2026-10-27 (D8, A17, A18, A20, A23).

describe('A17: o plural dos atendimentos', () => {
  it('um atendimento, dois atendimentos, zero atendimentos', () => {
    expect(atendimentosPorExtenso(1)).toBe('atendimento')
    expect(atendimentosPorExtenso(2)).toBe('atendimentos')
    expect(atendimentosPorExtenso(0)).toBe('atendimentos')
  })
})

describe('A18: "Chegou" só no dia do agendamento (Brasília)', () => {
  const agendado = '2026-10-27T13:00:00.000Z' // 10:00 em Brasília
  it('a virada do dia é a de Brasília, não a de UTC', () => {
    // 26/10 23:30 em Brasília já é 27/10 02:30 UTC: ainda é a véspera.
    expect(ehODiaDoAgendamento(agendado, new Date('2026-10-27T02:30:00.000Z'))).toBe(false)
    // 27/10 22:30 em Brasília é 28/10 01:30 UTC: ainda é o dia.
    expect(ehODiaDoAgendamento(agendado, new Date('2026-10-28T01:30:00.000Z'))).toBe(true)
    expect(ehODiaDoAgendamento(agendado, new Date('2026-10-27T12:00:00.000Z'))).toBe(true)
  })
  it('amanhã e ontem não', () => {
    expect(ehODiaDoAgendamento(agendado, new Date('2026-10-26T15:00:00.000Z'))).toBe(false)
    expect(ehODiaDoAgendamento(agendado, new Date('2026-10-28T15:00:00.000Z'))).toBe(false)
  })
})

describe('D8: onde a grade rola ao trocar de dia', () => {
  const base = { startHour: 7, hourPx: 80 }
  it('hoje: uma hora antes de agora', () => {
    expect(rolagemDaGrade({ ...base, ehHoje: true, horaAgora: 14, aberturaEmMin: 8 * 60, primeiroEmMin: 10 * 60 })).toBe((14 - 1 - 7) * 80)
  })
  it('hoje de madrugada não passa do topo', () => {
    expect(rolagemDaGrade({ ...base, ehHoje: true, horaAgora: 5, aberturaEmMin: 8 * 60, primeiroEmMin: null })).toBe(0)
  })
  it('outro dia: a abertura da unidade, quando vem antes do primeiro atendimento', () => {
    expect(rolagemDaGrade({ ...base, ehHoje: false, horaAgora: 12, aberturaEmMin: 8 * 60, primeiroEmMin: 10 * 60 })).toBe(80)
  })
  it('outro dia: o primeiro atendimento, quando vem antes da abertura', () => {
    expect(rolagemDaGrade({ ...base, ehHoje: false, horaAgora: 12, aberturaEmMin: 9 * 60, primeiroEmMin: 8 * 60 + 30 })).toBe(120)
  })
  it('outro dia sem atendimento: a abertura; sem abertura (fechado): o topo', () => {
    expect(rolagemDaGrade({ ...base, ehHoje: false, horaAgora: 12, aberturaEmMin: 9 * 60, primeiroEmMin: null })).toBe(160)
    expect(rolagemDaGrade({ ...base, ehHoje: false, horaAgora: 12, aberturaEmMin: null, primeiroEmMin: null })).toBe(0)
  })
  it('nunca fica negativa', () => {
    expect(rolagemDaGrade({ ...base, ehHoje: false, horaAgora: 12, aberturaEmMin: 6 * 60, primeiroEmMin: null })).toBe(0)
  })
})

describe('A20: o próximo horário livre', () => {
  it('é o primeiro livre do dia pedido', async () => {
    const r = await proximoHorarioLivre('2026-10-27', async d => (d === '2026-10-27' ? ['14:00', '14:30'] : []))
    expect(r).toEqual({ data: '2026-10-27', hora: '14:00' })
  })
  it('sem livre no dia, procura nos seguintes', async () => {
    const r = await proximoHorarioLivre('2026-10-27', async d => (d === '2026-10-29' ? ['08:00'] : []))
    expect(r).toEqual({ data: '2026-10-29', hora: '08:00' })
  })
  it('desiste depois de duas semanas sem nada', async () => {
    expect(await proximoHorarioLivre('2026-10-27', async () => [])).toBeNull()
  })
})

describe('A23: a confirmação e a chegada na linha do tempo da cliente', () => {
  const a = { id: 'x', procedureName: 'Limpeza', confirmed_at: '2026-10-27T12:00:00Z', arrived_at: '2026-10-27T13:00:00Z', status: 'ARRIVED' }
  it('registra os dois, com o link do agendamento', () => {
    const ev = eventosDeConfirmacaoEChegada(a, '/c/agenda/x')
    expect(ev.map(e => e.type)).toEqual(['APPOINTMENT_CONFIRMED', 'APPOINTMENT_ARRIVED'])
    expect(ev[0]).toMatchObject({ date: a.confirmed_at, title: 'Confirmado: Limpeza', link: '/c/agenda/x' })
    expect(ev[1]).toMatchObject({ date: a.arrived_at, title: 'Chegou: Limpeza' })
  })
  it('sem a data, sem o evento', () => {
    expect(eventosDeConfirmacaoEChegada({ ...a, arrived_at: null }, null).map(e => e.type)).toEqual(['APPOINTMENT_CONFIRMED'])
    expect(eventosDeConfirmacaoEChegada({ ...a, confirmed_at: null, arrived_at: null }, null)).toEqual([])
  })
})
