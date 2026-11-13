import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { minutosDesenhados, liberouOHorario, ladoALado } from '@/lib/agenda/desenho'

// A17 da 14ª simulação (F75): a Cliente 02 das 19:00 foi concluída às 18:10
// (adiantada), e a Bianca das 18:45 coube no horário pela regra (fimDaOcupacao,
// A31 da 5ª). A grade desenhava a Cliente 02 até as 20:00, por cima da Bianca:
// no celular, o toque caía no outro cartão. Toda grade desenha até a OCUPAÇÃO.
const em = (hhmm: string) => new Date(`2026-11-12T${hhmm}:00-04:00`).toISOString()

describe('minutosDesenhados (A17 da 14ª)', () => {
  it('o marcado ocupa a duração inteira', () =>
    expect(minutosDesenhados({ start: em('19:00'), durationMin: 60, status: 'SCHEDULED' })).toBe(60))
  it('o concluído adiantado é desenhado até a conclusão', () => {
    const c = { start: em('19:00'), durationMin: 60, status: 'COMPLETED', completedAt: em('19:20') }
    expect(minutosDesenhados(c)).toBe(20)
    expect(liberouOHorario(c)).toBe(true)
  })
  it('o concluído antes de começar não ocupa nada', () =>
    expect(minutosDesenhados({ start: em('19:00'), durationMin: 60, status: 'COMPLETED', completedAt: em('18:10') })).toBe(0))
  it('o concluído depois do fim marcado ocupa a duração marcada', () => {
    const c = { start: em('19:00'), durationMin: 60, status: 'COMPLETED', completedAt: em('20:30') }
    expect(minutosDesenhados(c)).toBe(60)
    expect(liberouOHorario(c)).toBe(false)
  })
})

describe('ladoALado (A17 da 14ª)', () => {
  const px = (x: { t: number; h: number }) => x
  it('quem se cruza na tela divide a largura; quem não se cruza fica inteiro', () => {
    const itens = [
      { id: 'cliente02', ...px({ t: 100, h: 32 }) },   // o concluído antes de começar, com a altura mínima
      { id: 'bianca', ...px({ t: 80, h: 80 }) },       // 18:45–19:45
      { id: 'depois', ...px({ t: 300, h: 40 }) },
    ]
    const l = ladoALado(itens, x => x.t, x => x.h)
    expect(l.get('bianca')).toEqual({ col: 0, total: 2 })
    expect(l.get('cliente02')).toEqual({ col: 1, total: 2 })
    expect(l.get('depois')).toEqual({ col: 0, total: 1 })
  })
  it('o que encosta (o fim de um é o início do outro) não divide', () => {
    const l = ladoALado([{ id: 'a', t: 0, h: 50 }, { id: 'b', t: 50, h: 50 }], x => x.t, x => x.h)
    expect(l.get('a')).toEqual({ col: 0, total: 1 })
    expect(l.get('b')).toEqual({ col: 0, total: 1 })
  })
})

// A trava: as três grades (unidade, rede e "Minha agenda" — o celular é a
// mesma grade da unidade) desenham pela régua da ocupação, não pela duração
// marcada. Refazer a altura por `durationMin / 60` traz o A17 de volta.
describe('as grades desenham até a ocupação (A17 da 14ª)', () => {
  const grades = [
    'components/branch/agenda-day-view.tsx',
    'components/admin/admin-agenda-view.tsx',
    'components/branch/professional-agenda.tsx',
  ]
  for (const arquivo of grades) {
    it(arquivo, () => {
      const fonte = readFileSync(join(__dirname, '..', arquivo), 'utf8')
      expect(fonte).toContain('minutosDesenhados')
      expect(fonte).not.toMatch(/durationMin \/ 60\) \* HOUR_PX|ev\.durationMin \/ 60 \* PX_PER_HOUR|apptDuration\(a\) \/ 60\) \* HOUR_H/)
    })
  }
})
