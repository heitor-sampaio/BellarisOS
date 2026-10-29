import { describe, it, expect } from 'vitest'
import { occupancyPct } from '@/lib/metrics'
import { ocupacaoDoDia } from '@/lib/metrics/ocupacao'
import { zonedToUtc } from '@/lib/datetime'

// A ocupação usa a capacidade do HORÁRIO de funcionamento (2026-10-21): até
// aqui era 8 h por profissional no dashboard e 12 h na agenda, e as duas telas
// davam números diferentes (D12 da simulação de um dia de clínica).

const seg = zonedToUtc(2026, 10, 19)  // segunda, 19/10/2026 (o mês de zonedToUtc começa em 1)
const dom = zonedToUtc(2026, 10, 25)  // domingo
const fimDaSeg = new Date(seg.getTime() + 86_399_000)
const padrao = { unidade: null, profissionais: [null] }   // seg–sáb, 08–20: 720 min/dia

describe('occupancyPct', () => {
  it('minutos agendados sobre a capacidade do horário', () => {
    expect(occupancyPct(360, padrao, seg, fimDaSeg)).toBe(50)
  })

  it('o domingo fechado não conta capacidade', () => {
    expect(occupancyPct(6 * 720, padrao, seg, dom)).toBe(100)
  })

  it('o horário da unidade decide a capacidade', () => {
    const meioPeriodo = { unidade: { dias: { 1: [{ de: '08:00', ate: '12:00' }] } }, profissionais: [null] }
    expect(occupancyPct(120, meioPeriodo, seg, fimDaSeg)).toBe(50)
  })

  it('sem profissional devolve null — 0% seria lido como "ninguém atendeu"', () => {
    expect(occupancyPct(300, { unidade: null, profissionais: [] }, seg, dom)).toBeNull()
  })

  it('não passa de 100%', () => {
    expect(occupancyPct(999_999, padrao, seg, dom)).toBe(100)
  })

  it('mais profissionais, mais capacidade — a mesma agenda ocupa menos', () => {
    expect(occupancyPct(720, { unidade: null, profissionais: [null, null] }, seg, fimDaSeg)).toBe(50)
  })

  it('percentual inteiro (a tela mostrava "6.25")', () => {
    expect(occupancyPct(45, padrao, seg, fimDaSeg)).toBe(6)
  })

  it('zero agendado é 0%, não null', () => {
    expect(occupancyPct(0, padrao, seg, dom)).toBe(0)
  })
})

// A profissional da REDE atende em todas as unidades (D1): na capacidade de
// uma, entra o horário dela MENOS o que já está agendado em outra (decisão do
// Heitor, 2026-10-28). Sem isso ela aparecia livre em duas unidades ao mesmo
// tempo, e somadas as unidades a capacidade dela entrava em dobro.
describe('occupancyPct com o que a profissional tem agendado em OUTRA unidade', () => {
  const as = (hhmm: string, min: number, dia = '2026-10-19') => ({ inicio: `${dia}T${hhmm}:00-03:00`, minutos: min })

  it('desconta da capacidade o tempo agendado fora', () => {
    // 720 − 120 = 600 de capacidade; 300 agendados aqui = 50%.
    expect(occupancyPct(300, { ...padrao, ocupadoFora: [[as('10:00', 120)]] }, seg, fimDaSeg)).toBe(50)
  })

  it('agendamentos sobrepostos fora contam uma vez', () => {
    // 10:00–11:00 e 10:30–11:30 = 90 min; 720 − 90 = 630; 315 = 50%.
    expect(occupancyPct(315, { ...padrao, ocupadoFora: [[as('10:00', 60), as('10:30', 60)]] }, seg, fimDaSeg)).toBe(50)
  })

  it('o que está fora do horário dela NESTA unidade não desconta', () => {
    const manha = { unidade: { dias: { 1: [{ de: '08:00', ate: '12:00' }] } }, profissionais: [null] }
    // 240 de capacidade; o de 14h na outra unidade não tira nada; 11:00–13:00 tira 60.
    expect(occupancyPct(120, { ...manha, ocupadoFora: [[as('14:00', 60)]] }, seg, fimDaSeg)).toBe(50)
    expect(occupancyPct(90, { ...manha, ocupadoFora: [[as('11:00', 120)]] }, seg, fimDaSeg)).toBe(50)
  })

  it('cada bloco desconta só da profissional dele, e no dia dele', () => {
    // Duas profissionais (1440); a segunda tem 240 fora na terça — fora da janela de segunda.
    expect(occupancyPct(720, { unidade: null, profissionais: [null, null], ocupadoFora: [[], [as('09:00', 240, '2026-10-20')]] }, seg, fimDaSeg)).toBe(50)
    // Na semana inteira (6 × 720 × 2 = 8640), os 240 da terça descontam: 8400.
    expect(occupancyPct(4200, { unidade: null, profissionais: [null, null], ocupadoFora: [[], [as('09:00', 240, '2026-10-20')]] }, seg, dom)).toBe(50)
  })

  it('toda a agenda dela fora: sem capacidade aqui', () => {
    expect(occupancyPct(0, { ...padrao, ocupadoFora: [[as('08:00', 720)]] }, seg, fimDaSeg)).toBeNull()
  })
})

// D11 da simulação de 2026-10-29: a "Minha agenda" dividia por um dia fixo de
// 8 h, na tela. A Camila atende 18:00–23:30 (330 min) e tinha 155 min: 47%, não 32%.
describe('ocupacaoDoDia (a "Minha agenda")', () => {
  const noite = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '18:00', ate: '23:30' }]])) }
  const unidade = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '08:00', ate: '23:30' }]])) }
  const ev = (hhmm: string, min: number, status = 'SCHEDULED') =>
    ({ start: new Date(`2026-10-28T${hhmm}:00-03:00`).toISOString(), durationMin: min, status })
  const dia = new Date('2026-10-28T15:00:00-03:00')

  it('sobre o horário dela, no dia de Brasília', () => {
    expect(ocupacaoDoDia([ev('18:00', 90), ev('20:00', 65)], { unidade, profissional: noite }, dia)).toBe(47)
  })
  it('cancelado e falta não ocupam; outro dia não entra', () => {
    const lista = [ev('18:00', 90), ev('20:00', 65), ev('22:00', 60, 'CANCELLED'), ev('22:30', 30, 'NO_SHOW'),
      { start: new Date('2026-10-29T18:00:00-03:00').toISOString(), durationMin: 120, status: 'SCHEDULED' }]
    expect(ocupacaoDoDia(lista, { unidade, profissional: noite }, dia)).toBe(47)
  })
  it('o agendado dela em outra unidade sai da capacidade', () => {
    // 330 − 30 = 300; 150 ÷ 300 = 50%.
    expect(ocupacaoDoDia([ev('18:00', 150)], {
      unidade, profissional: noite, ocupadoFora: [{ inicio: new Date('2026-10-28T23:00:00-03:00').toISOString(), minutos: 30 }],
    }, dia)).toBe(50)
  })
  it('dia em que ela não atende: sem capacidade (a tela mostra "—")', () => {
    // 28/10/2026 é quarta (3): folga marcada no horário dela.
    const soSegunda = { dias: { 1: [{ de: '18:00', ate: '23:30' }], 3: [] } }
    expect(ocupacaoDoDia([], { unidade, profissional: soSegunda }, dia)).toBeNull()
  })
})
