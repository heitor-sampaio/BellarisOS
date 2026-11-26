import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pausasDoDia, textoDaPausa } from '@/lib/agenda/intervalos-da-grade'

/**
 * O intervalo de quem atende aparece a quem vê a agenda dela (princípio 3;
 * decisão do Claude, 26/11): filtrando a profissional, a grade não dizia que
 * ela para das 01:20 às 03:20 — no dia, só um sombreado sem nome (o mesmo do
 * fora do horário); na semana, nada. Os horários de trabalho dela (AG-01: "por
 * dia da semana, com pausa") já chegavam à tela.
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

describe('as pausas do dia: o vão entre dois períodos de trabalho', () => {
  it('um período só não tem pausa; dois têm uma', () => {
    expect(pausasDoDia([{ de: '08:00', ate: '20:00' }])).toEqual([])
    expect(pausasDoDia([{ de: '03:20', ate: '23:59' }, { de: '00:00', ate: '01:20' }])).toEqual([{ de: '01:20', ate: '03:20' }])
  })
  it('períodos que se encostam não fazem pausa; sem horário, nada', () => {
    expect(pausasDoDia([{ de: '08:00', ate: '12:00' }, { de: '12:00', ate: '18:00' }])).toEqual([])
    expect(pausasDoDia([])).toEqual([])
  })
  it('o texto', () => {
    expect(textoDaPausa({ de: '01:20', ate: '03:20' })).toBe('Intervalo 01:20–03:20')
  })
})

describe('a grade mostra o intervalo', () => {
  it('na vista do dia, a faixa da pausa diz que é o intervalo', () => {
    const dia = fonte('components/branch/agenda-day-view.tsx')
    expect(dia).toMatch(/pausasDoDia\(horarioDoDia\)/)
    expect(dia).toMatch(/data-intervalo-do-horario/)
  })
  it('na vista da semana, o dia de cada pessoa diz o intervalo dela', () => {
    const semana = fonte('components/branch/agenda-week-view.tsx')
    expect(semana).toMatch(/pausasDoDia\(intervalosDoDia\(/)
    expect(semana).toMatch(/data-intervalo-do-horario/)
    expect(fonte('components/branch/agenda-calendar.tsx')).toMatch(/<AgendaWeekView[\s\S]*?horariosDosProfissionais=\{horariosDosProfissionais\}/)
  })
})
