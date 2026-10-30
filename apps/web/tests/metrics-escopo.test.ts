import { describe, it, expect } from 'vitest'
import type { TenantContext } from '@estetica-os/types'
import { recorteDosModulos, juntarNucleos, juntarPorNome, NINGUEM } from '@/lib/metrics/escopo'
import { EMPTY_CORE, type MetricsCore } from '@/lib/metrics/queries'

/**
 * Cada número segue o escopo do SEU módulo (decisão do Heitor, 2026-10-29):
 * agenda e clientes pelo escopo da agenda, dinheiro pelo do financeiro, funil
 * pelo do CRM. "Com a agenda ALL e o financeiro OWN, os atendimentos são os
 * da clínica e o faturamento é o dela."
 */
const ctx = (scopes: Partial<TenantContext['scopes']>, internalUserId: string | null = 'ela') =>
  ({ scopes: { agenda: 'ALL', financial: 'ALL', crm: 'ALL', medical_records: 'ALL', reports: 'ALL', ...scopes }, internalUserId }) as unknown as TenantContext

describe('recorteDosModulos', () => {
  it('agenda de todos e financeiro "só os meus": só o dinheiro é recortado', () => {
    expect(recorteDosModulos(ctx({ financial: 'OWN' }))).toEqual({ agenda: null, financeiro: 'ela', crm: null })
  })
  it('agenda "só os meus" e financeiro de todos: só a agenda é recortada', () => {
    expect(recorteDosModulos(ctx({ agenda: 'OWN' }))).toEqual({ agenda: 'ela', financeiro: null, crm: null })
  })
  it('o CRM tem o seu recorte, e "só os meus" sem membro não acha ninguém (nunca a rede)', () => {
    expect(recorteDosModulos(ctx({ crm: 'OWN', agenda: 'OWN' }, null))).toEqual({ agenda: NINGUEM, financeiro: null, crm: NINGUEM })
  })
})

describe('juntarNucleos — o dinheiro de um núcleo, a agenda e as clientes do outro', () => {
  const nucleo = (x: Partial<MetricsCore>): MetricsCore => ({ ...EMPTY_CORE, ...x })
  it('com a agenda de todos e o financeiro dela', () => {
    const daAgenda = nucleo({ revenueCash: 470, appointmentsCompleted: 3, appointmentsTotal: 3, newClients: 3, serviceRevenue: 470, appointmentsCharged: 3 })
    const doDinheiro = nucleo({ revenueCash: 120, revenuePending: 10, expensesCash: 0, appointmentsCompleted: 1, newClients: 1, serviceRevenue: 120, commissionsOpen: 12, commissionsPaid: 3 })
    const j = juntarNucleos(daAgenda, doDinheiro)
    expect([j.revenueCash, j.revenuePending, j.serviceRevenue, j.commissionsOpen, j.commissionsPaid]).toEqual([120, 10, 120, 12, 3])
    expect([j.appointmentsCompleted, j.appointmentsTotal, j.newClients, j.appointmentsCharged]).toEqual([3, 3, 3, 3])
  })
})

describe('juntarPorNome — a tabela que mistura contagem e dinheiro', () => {
  it('a contagem vem da agenda e a receita do dinheiro, casadas pelo nome', () => {
    const daAgenda = [{ nome: 'Limpeza', receita: 470, execucoes: 3 }, { nome: 'Peeling', receita: 90, execucoes: 1 }]
    const doDinheiro = [{ nome: 'Limpeza', receita: 120, execucoes: 1 }]
    expect(juntarPorNome(daAgenda, doDinheiro, ['receita'])).toEqual([
      { nome: 'Limpeza', receita: 120, execucoes: 3 },
      { nome: 'Peeling', receita: 0, execucoes: 1 },
    ])
  })
  it('com a agenda dela e o dinheiro de todos, o procedimento que ela não fez entra com zero execuções', () => {
    const daAgenda = [{ nome: 'Limpeza', receita: 120, execucoes: 1 }]
    const doDinheiro = [{ nome: 'Limpeza', receita: 470, execucoes: 3 }, { nome: 'Toxina', receita: 900, execucoes: 1 }]
    expect(juntarPorNome(daAgenda, doDinheiro, ['receita'])).toEqual([
      { nome: 'Limpeza', receita: 470, execucoes: 1 },
      { nome: 'Toxina', receita: 900, execucoes: 0 },
    ])
  })
})
