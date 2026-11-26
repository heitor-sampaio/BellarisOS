import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { marcarOsDeAntes } from '@/lib/clientes/proximos-da-ficha'

/**
 * Os "Próximos agendamentos" da ficha são de hoje em diante (AG-55, a regra
 * dos próximos do app: "o de hoje fica até a conclusão, e o de ontem em aberto
 * vai ao histórico"; princípio 3). O avulso de ONTEM, ainda "Confirmado",
 * seguia na lista de próximos. Ele não some: fica à parte, "Em aberto de dias
 * anteriores", até a equipe fechá-lo na agenda (decisão do Claude, 26/11 — o
 * "Histórico de procedimentos" da ficha é o que ela FEZ, J-26).
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')
const SP = 'America/Sao_Paulo'
// 26/11/2026, 10:00 em Brasília.
const AGORA = new Date('2026-11-26T13:00:00Z')

describe('marcarOsDeAntes', () => {
  const lista = [
    { id: 'ontem', scheduledAt: '2026-11-25T18:00:00Z', status: 'CONFIRMED' },
    { id: 'hoje-cedo', scheduledAt: '2026-11-26T11:00:00Z', status: 'SCHEDULED' },
    { id: 'amanha', scheduledAt: '2026-11-27T13:00:00Z', status: 'SCHEDULED' },
  ]
  it('o de ontem em aberto é de antes; o de hoje (mesmo que já passou da hora) e o de amanhã, não', () => {
    const r = marcarOsDeAntes(lista, AGORA, SP)
    expect(r.map(a => [a.id, a.emAbertoDeAntes])).toEqual([['ontem', true], ['hoje-cedo', false], ['amanha', false]])
  })
  it('o "hoje" é o da unidade do agendamento', () => {
    // 26/11 04:00 UTC = 26/11 01:00 em Brasília, mas ainda 25/11 23:00 no Acre.
    const agora = new Date('2026-11-26T04:00:00Z')
    // 25/11 22:00 UTC = 25/11 17:00 no Acre: é de hoje lá (no relógio de Brasília seria de ontem).
    const r = marcarOsDeAntes([
      { id: 'acre', scheduledAt: '2026-11-25T22:00:00Z', status: 'CONFIRMED', fuso: 'America/Rio_Branco' },
      { id: 'sp', scheduledAt: '2026-11-25T22:00:00Z', status: 'CONFIRMED', fuso: SP },
    ], agora, SP)
    expect(r.map(a => [a.id, a.emAbertoDeAntes])).toEqual([['acre', false], ['sp', true]])
  })
  it('o que está em atendimento segue nos próximos', () => {
    const r = marcarOsDeAntes([{ id: 'y', scheduledAt: '2026-11-25T18:00:00Z', status: 'IN_PROGRESS' }], AGORA, SP)
    expect(r[0]!.emAbertoDeAntes).toBe(false)
  })
})

describe('a ficha separa os de antes', () => {
  it('as duas páginas marcam os próximos', () => {
    for (const pagina of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      expect(fonte(pagina), pagina).toMatch(/marcarOsDeAntes\(/)
    }
  })
  it('a ficha lista os próximos sem os de antes, e os de antes à parte', () => {
    const ficha = fonte('components/branch/client-profile.tsx')
    expect(ficha).toMatch(/upcomingAppointments\.filter\(a => !a\.emAbertoDeAntes\)/)
    expect(ficha).toMatch(/data-em-aberto-de-antes/)
    expect(ficha).toContain('Em aberto de dias anteriores')
  })
})
