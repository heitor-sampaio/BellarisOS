import { describe, it, expect } from 'vitest'
import { ocupanteDoHorario, livresEntre, blocosDosBloqueios, livresDaGrade } from '@/lib/agenda/horario-livre'
import { capacidadeEmMinutos, type Horario } from '@/lib/agenda/horario'

// D5 e D15 da 8ª simulação (2026-11-06): uma régua só de horário livre — o
// intervalo INTEIRO [início, início + duração) contra os agendamentos e os
// bloqueios.
const em = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00-03:00`)
const ocupados = [{ scheduledAt: em('10:30').toISOString(), durationMin: 30, clientName: 'Rafaela' }]
const bloqueios = [{ inicio: em('14:00').toISOString(), fim: em('15:00').toISOString(), motivo: 'Curso' }]

describe('ocupanteDoHorario (D5)', () => {
  it('60 min às 10:00 batem no das 10:30 (o início sozinho não basta)', () =>
    expect(ocupanteDoHorario(em('10:00'), 60, ocupados, bloqueios)).toEqual({ clientName: 'Rafaela' }))
  it('30 min às 10:00 cabem', () =>
    expect(ocupanteDoHorario(em('10:00'), 30, ocupados, bloqueios)).toBeNull())
  it('60 min às 13:30 batem no bloqueio', () =>
    expect(ocupanteDoHorario(em('13:30'), 60, ocupados, bloqueios)).toEqual({ clientName: null, rotulo: 'Bloqueado · Curso' }))
  it('às 15:00, livre', () =>
    expect(ocupanteDoHorario(em('15:00'), 60, ocupados, bloqueios)).toBeNull())
  it('encostar não é bater: 11:00 depois do das 10:30', () =>
    expect(ocupanteDoHorario(em('11:00'), 60, ocupados, bloqueios)).toBeNull())
})

describe('livresEntre (D15: o "Horário livre" da Minha agenda)', () => {
  const ms = (hhmm: string) => em(hhmm).getTime()
  it('o bloqueio parte o vão', () =>
    expect(livresEntre(ms('10:30'), ms('16:00'), bloqueios)).toEqual([[ms('10:30'), ms('14:00')], [ms('15:00'), ms('16:00')]]))
  it('o pedaço menor que 30 min some', () =>
    expect(livresEntre(ms('13:45'), ms('15:10'), bloqueios)).toEqual([]))
  it('sem bloqueio, o vão inteiro', () =>
    expect(livresEntre(ms('10:30'), ms('12:00'), [])).toEqual([[ms('10:30'), ms('12:00')]]))
})

describe('blocosDosBloqueios (D15: a ocupação desconta o bloqueado)', () => {
  const todoDia: Horario = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) } as Horario
  it('6 h bloqueadas saem das 24 h do dia', () => {
    const dia = new Date('2026-11-18T12:00:00-03:00')
    const blocos = blocosDosBloqueios([{ inicio: em('00:00').toISOString(), fim: em('06:00').toISOString(), motivo: 'x' }])
    expect(capacidadeEmMinutos(todoDia, [null], dia, dia, [blocos])).toBe(18 * 60)
  })
})

// A16 da 10ª simulação (2026-11-10): a grade do checkout marcou 03:30, 04:00 e
// 05:00 como ocupados e deixou 03:00, 04:30 e 05:30 livres. Os atendimentos da
// Daniela (03:00, 04:15, 05:30) foram CONCLUÍDOS às 02:38, antes da hora: o
// concluído ocupa só até a conclusão (A31 da 5ª), e `getSchedulingDaySlots`
// os mandava com 0 minutos — um ponto, que a régua contava como ocupado
// quando caía DENTRO do intervalo testado (e não quando caía na borda).
describe('ocupanteDoHorario: o concluído antes da hora não ocupa nada (A16 da 10ª)', () => {
  const concluidosAntes = ['03:00', '04:15', '05:30'].map(h => ({ scheduledAt: em(h).toISOString(), durationMin: 0, clientName: 'Daniela' }))
  for (const h of ['03:00', '03:30', '04:00', '04:30', '05:00', '05:30'])
    it(`60 min às ${h}: livre`, () => expect(ocupanteDoHorario(em(h), 60, concluidosAntes)).toBeNull())
})

// D11 da 34ª (docs/regras/design.md; princípio 3): na Minha agenda, o "Horário
// livre" ficava cortado e por cima dos cartões — o vão era contado do fim do
// cartão ANTERIOR na lista (e não do último que ainda ocupa), e o desenho
// começava no fim de verdade, dentro do cartão curto (a altura mínima passa dele).
describe('livresDaGrade: o "Horário livre" da Minha agenda', () => {
  const ms = (hhmm: string) => em(hhmm).getTime()
  const cartao = (de: string, ate: string, ateNoDesenho = ate) => ({ de: ms(de), ate: ms(ate), ateNoDesenho: ms(ateNoDesenho) })
  it('o vão conta do último que ainda ocupa: dentro do atendimento longo não há horário livre', () => {
    const livres = livresDaGrade([cartao('09:00', '12:00'), cartao('10:00', '10:30'), cartao('13:00', '14:00')], (de, ate) => livresEntre(de, ate, []))
    expect(livres.map(l => [l.de, l.ate])).toEqual([[ms('12:00'), ms('13:00')]])
  })
  it('o texto diz o vão de verdade; o desenho começa abaixo do cartão curto', () => {
    const [livre] = livresDaGrade([cartao('10:00', '10:15', '10:33'), cartao('11:00', '12:00')], (de, ate) => livresEntre(de, ate, []))
    expect(livre).toEqual({ de: ms('10:15'), ate: ms('11:00'), desenhoDe: ms('10:33') })
  })
  it('o vão passa pelos cortes (o bloqueio parte o livre)', () => {
    const livres = livresDaGrade([cartao('10:00', '10:30'), cartao('16:00', '17:00')], (de, ate) => livresEntre(de, ate, bloqueios))
    expect(livres.map(l => [l.de, l.ate])).toEqual([[ms('10:30'), ms('14:00')], [ms('15:00'), ms('16:00')]])
  })
  it('sem dois cartões, nada', () => expect(livresDaGrade([cartao('10:00', '11:00')], (de, ate) => livresEntre(de, ate, []))).toEqual([]))
})
