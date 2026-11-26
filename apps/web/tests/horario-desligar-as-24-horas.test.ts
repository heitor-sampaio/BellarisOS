import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HORARIO_PADRAO, type Horario } from '@/lib/agenda/horario'
import { aoDesligarAs24Horas } from '@/lib/unidades/horario-no-editor'

/**
 * A24 da 34ª simulação (princípio 7): no horário de atendimento da pessoa, numa
 * unidade aberta 24 horas, o horário próprio nasce em 24 h (o da unidade).
 * Desligar o "Aberta 24 horas, todos os dias" devolvia o da unidade — 24 h de
 * novo, nada mudava —, e o único jeito era o "Escolher o horário" de cada dia
 * (a segunda virava 08:00–20:00, os outros seguiam 24 h). Desligar vale para
 * todos os dias que estavam em 24 h; o dia fechado na base segue fechado.
 */
const INTEIRO = [{ de: '00:00', ate: '24:00' }]
const UNIDADE_24H: Horario = { dias: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map(d => [d, INTEIRO])) }

describe('A24: desligar as 24 horas vale para todos os dias', () => {
  it('a base em 24 h: todos os dias saem das 24 h', () => {
    const dias = aoDesligarAs24Horas(UNIDADE_24H)
    for (const d of ['0', '1', '2', '3', '4', '5', '6']) expect(dias[d], d).toEqual([{ de: '08:00', ate: '20:00' }])
  })
  it('a base com horário: volta a ela, e o dia fechado nela fica fechado', () => {
    expect(aoDesligarAs24Horas(HORARIO_PADRAO)).toEqual(Object.fromEntries(
      ['1', '2', '3', '4', '5', '6', '0'].map(d => [d, (HORARIO_PADRAO.dias[d] ?? []).map(i => ({ ...i }))])))
    const misto: Horario = { dias: { ...UNIDADE_24H.dias, 0: [], 6: [{ de: '09:00', ate: '13:00' }] } }
    const dias = aoDesligarAs24Horas(misto)
    expect(dias['0']).toEqual([])
    expect(dias['6']).toEqual([{ de: '09:00', ate: '13:00' }])
    expect(dias['1']).toEqual([{ de: '08:00', ate: '20:00' }])
  })
  it('sem base, o padrão', () => {
    expect(aoDesligarAs24Horas(null)['1']).toEqual(HORARIO_PADRAO.dias['1'])
  })
  it('o editor usa a conta ao desligar sem o horário de antes', () => {
    const f = readFileSync(join(__dirname, '..', 'components/shared/editor-de-horario.tsx'), 'utf8')
    expect(f).toMatch(/setDias\(antesDas24 \?\? aoDesligarAs24Horas\(base\)\)/)
  })
})
