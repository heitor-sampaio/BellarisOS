import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { estenderJanela } from '@/lib/agenda/grade'
import { janelaDaGrade, type Horario } from '@/lib/agenda/horario'

/**
 * D5 da simulação de 2026-10-28: a grade da "Minha agenda" e a da rede
 * começavam fixas às 07:00. A regra é uma só (§9.1): abre no horário de
 * funcionamento e se estende pelos agendamentos de fora dele.
 */
const todoDia = (de: string, ate: string): Horario => ({ dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de, ate }]])) }) as Horario
// Hora de Brasília escrita com o offset, para não depender do fuso da máquina.
const em = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00-03:00`)

describe('estenderJanela', () => {
  it('sem agendamento fora do horário, a janela é a da unidade', () => {
    expect(estenderJanela({ inicio: 10, fim: 18 }, [{ start: em('12:00'), durationMin: 60 }], 'America/Sao_Paulo'))
      .toEqual({ inicio: 10, fim: 18 })
  })
  it('um atendimento de madrugada abre a grade na hora dele', () => {
    expect(estenderJanela({ inicio: 10, fim: 18 }, [{ start: em('02:30'), durationMin: 30 }], 'America/Sao_Paulo').inicio).toBe(2)
  })
  it('um encaixe que termina depois do fechamento estende o fim (e arredonda para cima)', () => {
    expect(estenderJanela({ inicio: 10, fim: 18 }, [{ start: em('21:30'), durationMin: 45 }], 'America/Sao_Paulo').fim).toBe(23)
  })
  it('a rede abre no mais cedo e fecha no mais tarde entre as unidades', () => {
    const j = janelaDaGrade([todoDia('09:00', '17:00'), todoDia('08:00', '20:00')])
    expect(j).toEqual({ inicio: 8, fim: 20 })
    expect(estenderJanela(j, [{ start: em('06:15'), durationMin: 30 }], 'America/Sao_Paulo')).toEqual({ inicio: 6, fim: 20 })
  })
})

// D12 da 42ª (AG-03): a unidade aberta 24 h de segunda a sexta e só até 09:30 no
// sábado abria a grade do SÁBADO de 00:00 a 24:00 — a janela era a da semana. A
// grade do dia é o horário da unidade NAQUELE dia; no dia fechado, a da semana
// (decisão do Claude, 28/11: o encaixe no dia fechado ainda tem onde cair).
describe('a grade do dia é o horário da unidade naquele dia (AG-03)', () => {
  const inteiro = [{ de: '00:00', ate: '24:00' }]
  const cambuci = { dias: { 0: [{ de: '08:00', ate: '12:00' }], 1: inteiro, 2: inteiro, 3: inteiro, 4: inteiro, 5: inteiro, 6: [{ de: '00:00', ate: '09:30' }] } } as unknown as Horario
  it('no sábado, 00:00–09:30 abre a grade de 0 a 10; na segunda, o dia inteiro; no domingo, 8 a 12', () => {
    expect(janelaDaGrade([cambuci], 6)).toEqual({ inicio: 0, fim: 10 })
    expect(janelaDaGrade([cambuci], 1)).toEqual({ inicio: 0, fim: 24 })
    expect(janelaDaGrade([cambuci], 0)).toEqual({ inicio: 8, fim: 12 })
  })
  it('o agendamento depois do fim ainda estende a grade do dia', () => {
    expect(estenderJanela(janelaDaGrade([cambuci], 6), [{ start: new Date('2026-11-28T09:00:00-03:00'), durationMin: 60 }], 'America/Sao_Paulo'))
      .toEqual({ inicio: 0, fim: 10 })
    expect(estenderJanela(janelaDaGrade([cambuci], 6), [{ start: new Date('2026-11-28T10:00:00-03:00'), durationMin: 60 }], 'America/Sao_Paulo'))
      .toEqual({ inicio: 0, fim: 11 })
  })
  it('na rede, o mais cedo e o mais tarde entre as unidades NAQUELE dia', () => {
    expect(janelaDaGrade([cambuci, todoDia('07:00', '18:00')], 6)).toEqual({ inicio: 0, fim: 18 })
  })
  it('no dia fechado em todas, a janela da semana', () => {
    const semDomingo = { dias: { 0: [], 1: [{ de: '09:00', ate: '18:00' }], 6: [{ de: '08:00', ate: '12:00' }] } } as unknown as Horario
    expect(janelaDaGrade([semDomingo], 0)).toEqual(janelaDaGrade([semDomingo]))
    expect(janelaDaGrade([semDomingo], 0)).toEqual({ inicio: 8, fim: 18 })
  })
  it('a agenda da unidade, a Minha agenda e a da rede pedem a janela do dia mostrado', () => {
    const ler = (arq: string) => readFileSync(resolve(__dirname, '..', arq), 'utf8')
    expect(ler('components/branch/agenda-calendar.tsx')).toMatch(/janela=\{janelaDaGrade\(\[horarioDaUnidade\], diaDaSemana\(diaNaUrl\)\)\}/)
    expect(ler('components/branch/professional-agenda.tsx')).toMatch(/janelaDoDia\(intervalosDela\) \?\? janelaDaGrade\(\[horarioDaUnidade\], diaDaSemana\(/)
    expect(ler('components/admin/admin-agenda-view.tsx')).toMatch(/janelaDaGrade\(branches\.map\(b => b\.horario \?\? null\), diaDaSemana\(dia\)\)/)
  })
})
