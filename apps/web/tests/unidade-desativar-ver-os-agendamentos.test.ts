import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { caminhosDoQueFica, NADA_FICA, type OQueFicaNaUnidade } from '@/lib/unidades/o-que-fica'

/**
 * D11 da 32ª simulação (2026-11-26): na janela de desativar Passo Fundo, "Os 2
 * agendamentos continuam marcados" levava à agenda de UM dia (27/11) — o outro
 * era em 28/11. UN-10 (princípio 3): a janela leva a resolver o que conta. Os
 * agendamentos em dias diferentes abrem a SEMANA do primeiro, e o texto diz
 * os dias; num dia só, o link de sempre.
 */
const com = (o: Partial<OQueFicaNaUnidade>): OQueFicaNaUnidade => ({ ...NADA_FICA, ...o })
const daAgenda = (o: OQueFicaNaUnidade) => caminhosDoQueFica('u1', o).find(c => c.chave === 'agenda')!

describe('D11: "Ver os agendamentos" leva a todos os que a janela conta', () => {
  it('em 27 e 28/11 (a mesma semana): a agenda da semana, e o texto diz os dias', () => {
    const c = daAgenda(com({ agendamentos: 2, diaDoPrimeiro: '2026-11-27', diaDoUltimo: '2026-11-28' }))
    expect(c.href).toBe('/admin/agenda?unidade=u1&date=2026-11-27&view=week')
    expect(c.texto).toContain('de 27/11 a 28/11')
  })

  it('num dia só: o link do dia, como antes', () => {
    const c = daAgenda(com({ agendamentos: 2, diaDoPrimeiro: '2026-11-27', diaDoUltimo: '2026-11-27' }))
    expect(c.href).toBe('/admin/agenda?unidade=u1&date=2026-11-27')
    expect(c.texto).toContain('em 27/11')
  })

  it('em semanas diferentes: a semana do primeiro, e o texto diz até quando vão', () => {
    const c = daAgenda(com({ agendamentos: 3, diaDoPrimeiro: '2026-11-27', diaDoUltimo: '2026-12-10' }))
    expect(c.href).toBe('/admin/agenda?unidade=u1&date=2026-11-27&view=week')
    expect(c.texto).toContain('de 27/11 a 10/12')
    expect(c.texto).toMatch(/avance a semana/)
  })

  it('a leitura do banco acha também o ÚLTIMO agendamento marcado', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'lib/unidades/desativar.ts'), 'utf8')
    expect(fonte).toMatch(/diaDoUltimo/)
    expect(fonte).toMatch(/ascending: false/)
  })
})
