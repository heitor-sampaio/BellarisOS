import { describe, it, expect } from 'vitest'
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
