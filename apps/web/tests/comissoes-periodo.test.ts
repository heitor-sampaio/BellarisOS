import { describe, it, expect } from 'vitest'
import { periodoDe, periodosRecentes, periodoDaChave } from '@/lib/comissoes/periodo'
import { dayKeyTZ } from '@/lib/datetime'

const em = (iso: string) => new Date(iso)
const dias = (p: { inicio: Date; fim: Date }) => [dayKeyTZ(p.inicio), dayKeyTZ(p.fim)]

describe('períodos de fechamento das comissões', () => {
  it('mensal: do dia 1 ao último dia, no fuso de SP', () => {
    // 01/10 às 01h em UTC ainda é 30/09 em SP.
    const p = periodoDe(em('2026-10-01T01:00:00Z'), 'MENSAL')
    expect(dias(p)).toEqual(['2026-09-01', '2026-09-30'])
    expect(p.chave).toBe('2026-09-01')
    expect(p.rotulo).toBe('set/2026')
    expect(p.inicio.toISOString()).toBe('2026-09-01T03:00:00.000Z')
  })
  it('quinzenal: 1–15 e 16–fim', () => {
    expect(dias(periodoDe(em('2026-02-15T12:00:00-03:00'), 'QUINZENAL'))).toEqual(['2026-02-01', '2026-02-15'])
    expect(dias(periodoDe(em('2026-02-16T00:30:00-03:00'), 'QUINZENAL'))).toEqual(['2026-02-16', '2026-02-28'])
  })
  it('semanal: segunda a domingo, atravessando o mês', () => {
    // 01/10/2026 é quinta.
    expect(dias(periodoDe(em('2026-10-01T12:00:00-03:00'), 'SEMANAL'))).toEqual(['2026-09-28', '2026-10-04'])
    // Domingo fica na semana que começou na segunda anterior.
    expect(dias(periodoDe(em('2026-10-04T22:00:00-03:00'), 'SEMANAL'))).toEqual(['2026-09-28', '2026-10-04'])
  })
  it('os recentes andam para trás sem buraco nem sobreposição', () => {
    const lista = periodosRecentes('QUINZENAL', em('2026-03-10T12:00:00-03:00'), 4)
    expect(lista.map(dias)).toEqual([
      ['2026-03-01', '2026-03-15'], ['2026-02-16', '2026-02-28'], ['2026-02-01', '2026-02-15'], ['2026-01-16', '2026-01-31'],
    ])
    for (let i = 1; i < lista.length; i++) expect(lista[i]!.fim.getTime() + 1).toBe(lista[i - 1]!.inicio.getTime())
  })
  it('a chave da URL só vale se for o início de um período', () => {
    expect(periodoDaChave('2026-09-01', 'MENSAL')?.rotulo).toBe('set/2026')
    expect(periodoDaChave('2026-09-02', 'MENSAL')).toBeNull()
    expect(periodoDaChave('2026-09-28', 'SEMANAL')).not.toBeNull()
    expect(periodoDaChave('2026-13-01', 'MENSAL')).toBeNull()
    expect(periodoDaChave('lixo', 'MENSAL')).toBeNull()
  })
})
