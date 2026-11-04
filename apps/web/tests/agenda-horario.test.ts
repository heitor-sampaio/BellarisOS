import { describe, it, expect } from 'vitest'
import {
  HORARIO_PADRAO, normalizarHorario, horarioDeQuemDeixaDeSeguir, textoDosIntervalos, cabeNoHorario, forasDoHorario, intervalosDoDia, slotsDoDia, capacidadeEmMinutos, janelaDaGrade, diaDaSemana, foraDoHorarioDaUnidade,
  type Horario,
} from '@/lib/agenda/horario'

// O horário de funcionamento (2026-10-21, decisão do Heitor: por unidade, dia e
// profissional). Até aqui era fixo em 08–20 nos livres, 07–20 na grade e 8 h
// na ocupação — três contas diferentes (D11/D12 da simulação de um dia de clínica).

const unidade: Horario = { dias: {
  1: [{ de: '09:00', ate: '12:00' }, { de: '13:00', ate: '18:00' }],
  2: [{ de: '09:00', ate: '18:00' }],
  6: [{ de: '08:00', ate: '12:00' }],
} }

describe('o horário de funcionamento', () => {
  it('sem cadastro, o padrão: segunda a sábado, 08 às 20; domingo fechado', () => {
    expect(intervalosDoDia(null, null, 1)).toEqual([{ de: '08:00', ate: '20:00' }])
    expect(intervalosDoDia(null, null, 0)).toEqual([])
    expect(HORARIO_PADRAO.dias[6]).toEqual([{ de: '08:00', ate: '20:00' }])
  })

  it('o dia fechado da unidade não tem horário; a pausa separa os períodos', () => {
    expect(intervalosDoDia(unidade, null, 3)).toEqual([])
    expect(intervalosDoDia(unidade, null, 1)).toEqual([{ de: '09:00', ate: '12:00' }, { de: '13:00', ate: '18:00' }])
  })

  it('o profissional vale DENTRO da unidade (interseção)', () => {
    const prof: Horario = { dias: { 1: [{ de: '10:00', ate: '15:00' }], 2: [] } }
    expect(intervalosDoDia(unidade, prof, 1)).toEqual([{ de: '10:00', ate: '12:00' }, { de: '13:00', ate: '15:00' }])
    expect(intervalosDoDia(unidade, prof, 2), 'o profissional de folga').toEqual([])
    expect(intervalosDoDia(unidade, prof, 6), 'dia sem cadastro do profissional segue a unidade').toEqual([{ de: '08:00', ate: '12:00' }])
  })

  it('os livres cabem inteiros num período — não atravessam a pausa', () => {
    const livres = slotsDoDia([{ de: '09:00', ate: '12:00' }, { de: '13:00', ate: '14:00' }], 60)
    expect(livres).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '13:00'])
  })

  it('a capacidade soma os minutos de cada profissional em cada dia do período', () => {
    // segunda 20/10/2026 a quarta 22/10/2026 (Brasília), um profissional que segue a unidade:
    // seg 8 h, ter 9 h, qua fechado = 1020 min.
    const de = new Date('2026-10-19T03:00:00Z'), ate = new Date('2026-10-22T02:59:59Z')
    expect(capacidadeEmMinutos(unidade, [null], de, ate)).toBe(1020)
    expect(capacidadeEmMinutos(unidade, [null, { dias: { 1: [] } }], de, ate), 'o segundo folga na segunda').toBe(1020 + 540)
  })

  it('a grade da agenda vai da primeira abertura ao último fechamento da semana', () => {
    expect(janelaDaGrade([unidade])).toEqual({ inicio: 8, fim: 18 })
    expect(janelaDaGrade([null])).toEqual({ inicio: 8, fim: 20 })
  })

  it('o dia da semana de uma data AAAA-MM-DD, sem fuso', () => {
    expect(diaDaSemana('2026-10-25')).toBe(0)
    expect(diaDaSemana('2026-10-26')).toBe(1)
  })

  it('o que vem do navegador é conferido', () => {
    expect(normalizarHorario({ dias: { 1: [{ de: '18:00', ate: '09:00' }] } }), 'fim antes do começo').toBeNull()
    expect(normalizarHorario({ dias: { 9: [] } }), 'dia inexistente').toBeNull()
    expect(normalizarHorario({ dias: { 1: [{ de: '25:00', ate: '26:00' }] } })).toBeNull()
    expect(normalizarHorario({ dias: { 1: [{ de: '09:00', ate: '12:00' }, { de: '11:00', ate: '14:00' }] } }), 'sobreposto').toBeNull()
    expect(normalizarHorario(null)).toBeNull()
    expect(normalizarHorario(unidade)).toEqual(unidade)
  })
})

describe('o horário de quem deixa de seguir a unidade (J-9)', () => {
  const daUnidade = { dias: { 0: [], 1: [{ de: '10:00', ate: '18:00' }], 6: [] } }
  it('parte do horário da unidade do membro', () => {
    expect(horarioDeQuemDeixaDeSeguir([{ id: 'a', horario: daUnidade }, { id: 'b', horario: null }], 'a')).toEqual(daUnidade)
  })
  it('unidade sem cadastro: o padrão', () => {
    expect(horarioDeQuemDeixaDeSeguir([{ id: 'a', horario: daUnidade }, { id: 'b', horario: null }], 'b')).toEqual(HORARIO_PADRAO)
  })
  it('o membro da rede parte da unidade quando a rede tem uma só', () => {
    expect(horarioDeQuemDeixaDeSeguir([{ id: 'a', horario: daUnidade }], null)).toEqual(daUnidade)
  })
  // A11 da 6ª simulação: o Dr. Igor (rede) partia de 08–20 com a Boa Viagem em
  // 24 h e a Casa Forte em 06–22 — um horário que nenhuma das duas tem.
  it('com várias unidades, o membro da rede parte da UNIÃO dos horários delas (A11, princípio 4)', () => {
    const vinteEQuatro = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) }
    const seisAsDez = { dias: { 0: [], 1: [{ de: '06:00', ate: '22:00' }], 2: [{ de: '06:00', ate: '22:00' }], 6: [] } }
    expect(horarioDeQuemDeixaDeSeguir([{ id: 'a', horario: vinteEQuatro }, { id: 'b', horario: seisAsDez }], null)).toEqual(vinteEQuatro)
    const manha = { dias: { 0: [], 1: [{ de: '08:00', ate: '12:00' }], 2: [] } }
    const tarde = { dias: { 0: [], 1: [{ de: '11:00', ate: '18:00' }], 2: [{ de: '14:00', ate: '18:00' }] } }
    expect(horarioDeQuemDeixaDeSeguir([{ id: 'a', horario: manha }, { id: 'b', horario: tarde }], null))
      .toEqual({ dias: { 0: [], 1: [{ de: '08:00', ate: '18:00' }], 2: [{ de: '14:00', ate: '18:00' }] } })
    // A unidade sem cadastro conta como o padrão dela (seg a sáb, 08–20).
    expect(horarioDeQuemDeixaDeSeguir([{ id: 'a', horario: seisAsDez }, { id: 'b' }], null).dias[1]).toEqual([{ de: '06:00', ate: '22:00' }])
    expect(horarioDeQuemDeixaDeSeguir([{ id: 'a', horario: seisAsDez }, { id: 'b' }], null).dias[6]).toEqual([{ de: '08:00', ate: '20:00' }])
  })
})

describe('o encaixe fora do horário (J-30)', () => {
  const dela = [{ de: '10:00', ate: '12:00' }, { de: '13:00', ate: '18:00' }]
  it('o texto dos períodos', () => {
    expect(textoDosIntervalos(dela)).toBe('10:00–12:00 e 13:00–18:00')
    expect(textoDosIntervalos([])).toBe('')
  })
  it('cabe inteiro num período — senão é encaixe', () => {
    expect(cabeNoHorario(dela, 10 * 60, 11 * 60)).toBe(true)
    expect(cabeNoHorario(dela, 11 * 60 + 30, 12 * 60 + 30)).toBe(false) // atravessa a pausa
    expect(cabeNoHorario(dela, 8 * 60 + 30, 9 * 60 + 30)).toBe(false)
    expect(cabeNoHorario([], 10 * 60, 11 * 60)).toBe(false)
  })
  it('as faixas fora do horário dentro da janela da grade', () => {
    expect(forasDoHorario(dela, 8 * 60, 20 * 60)).toEqual([
      { de: 480, ate: 600 }, { de: 720, ate: 780 }, { de: 1080, ate: 1200 },
    ])
    expect(forasDoHorario([], 8 * 60, 20 * 60)).toEqual([{ de: 480, ate: 1200 }])
    expect(forasDoHorario([{ de: '08:00', ate: '20:00' }], 8 * 60, 20 * 60)).toEqual([])
  })
})

describe('janelaDoDia — a grade da Minha agenda ("Reforça", item 8)', () => {
  it('das horas cheias que cobrem os intervalos do dia; nulo quando não atende', async () => {
    const { janelaDoDia } = await import('@/lib/agenda/horario')
    expect(janelaDoDia([{ de: '08:00', ate: '12:00' }])).toEqual({ inicio: 8, fim: 12 })
    expect(janelaDoDia([{ de: '07:30', ate: '12:00' }, { de: '18:00', ate: '21:30' }])).toEqual({ inicio: 7, fim: 22 })
    expect(janelaDoDia([])).toBeNull()
  })
})

// A26 da 6ª simulação: o encaixe na agenda da rede, pelo horário DA unidade.
describe('foraDoHorarioDaUnidade', () => {
  const dezADezoito = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '10:00', ate: '18:00' }]])) }
  it('pelo relógio de Brasília, do início ao fim', () => {
    // 03:00 em Brasília = 06:00 UTC.
    expect(foraDoHorarioDaUnidade(dezADezoito, '2026-11-05T06:00:00Z', 30)).toBe(true)
    expect(foraDoHorarioDaUnidade(dezADezoito, '2026-11-05T14:00:00Z', 30)).toBe(false)
    // 17:45 + 30 min passa das 18:00.
    expect(foraDoHorarioDaUnidade(dezADezoito, '2026-11-05T20:45:00Z', 30)).toBe(true)
  })
  it('sem cadastro, o padrão (segunda a sábado, 08–20): domingo é fora', () => {
    expect(foraDoHorarioDaUnidade(null, '2026-11-08T13:00:00Z', 30)).toBe(true)
    expect(foraDoHorarioDaUnidade(null, '2026-11-09T13:00:00Z', 30)).toBe(false)
  })
})
