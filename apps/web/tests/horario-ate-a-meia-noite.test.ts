import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizarHorario, slotsDoDia, intervalosDoDia, resumoDoHorario } from '@/lib/agenda/horario'

/**
 * O fim do dia num formato só (princípios 3 e 7; A4 da 29ª). O campo de hora
 * não aceita "24:00": quem atende até a meia-noite digitava 23:59, e o resto
 * do sistema (o "24 horas" da unidade, os textos, a grade) dizia 24:00 — e o
 * horário das 23:30 de 30 min cabia na unidade e não cabia na profissional.
 * Decisão do Claude, 25/11: o fim às 23:59 é a meia-noite, gravado 24:00; o
 * campo mostra 23:59 e diz "meia-noite (24:00)".
 */
describe('o fim às 23:59 é a meia-noite', () => {
  it('normalizarHorario grava o fim às 23:59 como 24:00', () => {
    expect(normalizarHorario({ dias: { 1: [{ de: '18:00', ate: '23:59' }] } }))
      .toEqual({ dias: { 1: [{ de: '18:00', ate: '24:00' }] } })
  })

  it('o início às 23:59 não muda (só o fim é a meia-noite)', () => {
    expect(normalizarHorario({ dias: { 1: [{ de: '23:00', ate: '23:30' }] } }))
      .toEqual({ dias: { 1: [{ de: '23:00', ate: '23:30' }] } })
  })

  it('a profissional até a meia-noite tem o mesmo último horário da unidade 24 h', () => {
    const unidade = normalizarHorario({ dias: { 1: [{ de: '00:00', ate: '24:00' }] } })
    const prof = normalizarHorario({ dias: { 1: [{ de: '18:00', ate: '23:59' }] } })
    const ints = intervalosDoDia(unidade, prof, 1)
    expect(slotsDoDia(ints, 30).at(-1)).toBe('23:30')
    expect(resumoDoHorario(unidade, prof)).toEqual(['Seg, 18:00–24:00'])
  })

  it('o editor mostra o fim à meia-noite como 23:59, dizendo que é a meia-noite', () => {
    const t = readFileSync(join(__dirname, '..', 'components/shared/editor-de-horario.tsx'), 'utf8')
    expect(t).toContain("value={noCampo(i.ate)}")
    expect(t).toContain('data-ate-a-meia-noite')
  })
})
