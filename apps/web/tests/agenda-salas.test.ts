import { describe, it, expect } from 'vitest'
import { salasParaOProcedimento, salaServeAoProcedimento, salaSugerida, nomeDeSala, salasParaOferecer } from '@/lib/agenda/salas'

// D5 (2026-10-30): o procedimento ligado às salas em que é feito — ligação
// opcional, contada por unidade.

const unidade = [{ id: 's1', name: 'Sala 1' }, { id: 'cab', name: 'Cabine laser' }, { id: 's3', name: 'Sala 3' }]

describe('as salas do procedimento', () => {
  it('sem sala ligada, qualquer sala da unidade serve', () => {
    expect(salasParaOProcedimento(unidade, [])).toEqual(unidade)
    expect(salaServeAoProcedimento('s1', unidade, [])).toBe(true)
  })

  it('com sala ligada nesta unidade, só as ligadas', () => {
    expect(salasParaOProcedimento(unidade, ['cab', 's3']).map(s => s.id)).toEqual(['cab', 's3'])
    expect(salaServeAoProcedimento('s1', unidade, ['cab', 's3'])).toBe(false)
    expect(salaServeAoProcedimento('s3', unidade, ['cab', 's3'])).toBe(true)
  })

  it('a ligação conta por unidade: ligada só a salas de OUTRA unidade, aqui vale qualquer uma', () => {
    expect(salasParaOProcedimento(unidade, ['sala-de-outra-unidade'])).toEqual(unidade)
  })

  it('sala que não é da unidade nunca serve', () => {
    expect(salaServeAoProcedimento('alheia', unidade, [])).toBe(false)
  })

  it('a sugerida é a primeira livre', () => {
    expect(salaSugerida([{ id: 'cab', livre: false }, { id: 's3', livre: true }, { id: 's4', livre: true }])).toBe('s3')
    expect(salaSugerida([{ id: 'cab', livre: false }])).toBeNull()
  })

  it('o nome da sala vem limpo, e vazio ou longo é recusado', () => {
    expect(nomeDeSala('  Cabine   laser ')).toEqual({ nome: 'Cabine laser' })
    expect(nomeDeSala('   ')).toEqual({ erro: 'Dê um nome à sala.' })
    expect(nomeDeSala(42)).toEqual({ erro: 'Dê um nome à sala.' })
    expect('erro' in nomeDeSala('x'.repeat(61))).toBe(true)
  })
})

// D10 da 34ª (AG-07; princípio 3; atendimento.md, "O que nunca fazer aqui": a lista
// não oferece o que o servidor recusaria): enquanto a lista do horário novo não
// chega, o Agendar oferecia TODAS as salas da unidade, como livres — a escolhida
// que não serve ao procedimento sumia calada ("Sem sala definida") quando a
// lista chegava, e o agendamento ia sem sala.
describe('as salas que o Agendar oferece', () => {
  const daUnidade = [{ id: 'rosa', name: 'Sala Rosa' }, { id: 'azul', name: 'Sala Azul' }]
  it('com a lista do horário, ela', () => {
    const doServidor = [{ id: 'rosa', name: 'Sala Rosa', livre: false, indisponivel: 'ocupada' as const }]
    expect(salasParaOferecer(daUnidade, doServidor, null)).toEqual(doServidor)
  })
  it('esperando a lista, só a já escolhida (nada que possa sumir depois)', () => {
    expect(salasParaOferecer(daUnidade, null, 'azul')).toEqual([{ id: 'azul', name: 'Sala Azul', livre: true }])
    expect(salasParaOferecer(daUnidade, null, null)).toEqual([])
    expect(salasParaOferecer(daUnidade, null, '')).toEqual([])
  })
})
