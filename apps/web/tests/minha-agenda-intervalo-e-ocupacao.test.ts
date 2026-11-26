import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { livresEntre } from '@/lib/agenda/horario-livre'
import { foraDoHorarioComoCortes } from '@/lib/agenda/intervalos-da-grade'

/**
 * A Minha agenda (a vista pessoal, AG-23):
 * - D4: o "Horário livre" entre dois atendimentos não cai dentro da pausa dela
 *   nem fora do horário dela (princípio 3; a grade da equipe já mostra a pausa
 *   como "Intervalo", A8 da 31ª). A Lauriane, com a pausa das 06:00 às 08:00,
 *   via "Horário livre" ali.
 * - D14: a "Ocupação hoje" tem a dica "Como a ocupação é contada" (OC-05), com o
 *   texto da fonte (lib/metrics/definicoes), sem repetir a frase.
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')
const ms = (hhmm: string) => new Date(`2026-11-26T${hhmm}:00`).getTime()
const hora = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

describe('D4: o horário livre da Minha agenda não entra na pausa', () => {
  it('a pausa e o fora do horário viram cortes do dia', () => {
    const cortes = foraDoHorarioComoCortes('2026-11-26', [{ de: '00:00', ate: '06:00' }, { de: '08:00', ate: '24:00' }])
    expect(cortes.map(c => [hora(new Date(c.inicio).getTime()), hora(new Date(c.fim).getTime())])).toEqual([['06:00', '08:00']])
  })
  it('entre um atendimento às 05:00 e outro às 09:00, livre só fora da pausa', () => {
    const cortes = foraDoHorarioComoCortes('2026-11-26', [{ de: '00:00', ate: '06:00' }, { de: '08:00', ate: '24:00' }])
    const livres = livresEntre(ms('05:00'), ms('09:00'), cortes).map(([de, ate]) => `${hora(de)}–${hora(ate)}`)
    expect(livres).toEqual(['05:00–06:00', '08:00–09:00'])
  })
  it('antes da abertura e depois do fechamento também não são livres; no dia em que não atende, nada', () => {
    const cortes = foraDoHorarioComoCortes('2026-11-26', [{ de: '10:00', ate: '18:00' }])
    expect(livresEntre(ms('08:00'), ms('11:00'), cortes).map(([de, ate]) => `${hora(de)}–${hora(ate)}`)).toEqual(['10:00–11:00'])
    expect(livresEntre(ms('08:00'), ms('11:00'), foraDoHorarioComoCortes('2026-11-26', []))).toEqual([])
  })
  it('a Minha agenda corta o livre pelo horário dela e mostra o intervalo pelo nome', () => {
    const f = fonte('components/branch/professional-agenda.tsx')
    expect(f).toMatch(/foraDoHorarioComoCortes\(diaDaGrade, intervalosDoDia\(horarioDaUnidade, horarioDaProfissional, diaDaSemana\(diaDaGrade\)\)\)/)
    expect(f).toMatch(/livresEntre\(endMs, nextMs, \[\.\.\.bloqueios, \.\.\.foraDela\]\)/)
    expect(f).toMatch(/pausasDoDia\(intervalosDela\)/)
    expect(f).toMatch(/data-intervalo-do-horario/)
  })
})

describe('D14: a ocupação da Minha agenda diz como é contada', () => {
  it('a dica da ocupação vem da fonte única', () => {
    const f = fonte('components/branch/professional-agenda.tsx')
    expect(f).toMatch(/import \{ DEFINICOES \} from '@\/lib\/metrics\/definicoes'/)
    expect(f).toMatch(/<Dica rotulo=\{DEFINICOES\.ocupacao\.rotulo\}>/)
    expect(f).toMatch(/\{DEFINICOES\.ocupacao\.texto\}/)
  })
})
