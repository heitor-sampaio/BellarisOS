import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as ultimaVisita from '@/lib/clientes/ultima-visita'

/**
 * O "Reativar clientes" dos dashboards conta em DIAS DE CALENDÁRIO no fuso do
 * portal, como a "Última visita" da lista de Clientes (o mesmo defeito do D9 da
 * 33ª simulação; CLAUDE.md §14, princípio 3): o `differenceInDays(now, visita)`
 * contava blocos de 24 h, e a cliente que a lista dizia "há 20 dias" o
 * dashboard dizia 19 de manhã e 20 à tarde.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const SP = 'America/Sao_Paulo'

type Dias = (iso: string | null, agora?: Date, fuso?: string) => number | null
const dias = () => (ultimaVisita as unknown as { diasDesdeAUltimaVisita?: Dias }).diasDesdeAUltimaVisita

describe('os dias sem vir do Reativar clientes', () => {
  it('dias de calendário no fuso: a mesma conta de manhã e à tarde', () => {
    const f = dias()
    expect(f, 'diasDesdeAUltimaVisita em lib/clientes/ultima-visita.ts').toBeTypeOf('function')
    // A visita às 17h de 05/11 (SP); de manhã e à tarde de 25/11, 20 dias.
    const visita = '2026-11-05T20:00:00.000Z'
    expect(f!(visita, new Date('2026-11-25T11:00:00.000Z'), SP)).toBe(20)
    expect(f!(visita, new Date('2026-11-25T22:00:00.000Z'), SP)).toBe(20)
    // Ontem às 22h (SP), hoje às 8h: 1 dia, com menos de 24 horas.
    expect(f!('2026-11-25T01:00:00.000Z', new Date('2026-11-25T11:00:00.000Z'), SP)).toBe(1)
    expect(f!(null, new Date(), SP)).toBeNull()
  })

  it('a lista e os dashboards leem pela mesma conta', () => {
    expect(fonte('lib/clientes/ultima-visita.ts')).toMatch(/const dias = diasDesdeAUltimaVisita\(/)
    for (const arquivo of ['app/admin/dashboard/page.tsx', 'app/[slug]/dashboard/page.tsx']) {
      const s = fonte(arquivo)
      expect(s, arquivo).toMatch(/diasDesdeAUltimaVisita\(c\.ultimaVisita, now, fuso\)/)
      expect(s, arquivo).not.toMatch(/differenceInDays\(now, new Date\(c\.ultimaVisita\)\)/)
    }
  })
})
