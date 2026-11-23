import { describe, it, expect } from 'vitest'
import type { TenantContext } from '@estetica-os/types'
import { recortePessoal, juntarNucleos, juntarPorNome } from '@/lib/metrics/escopo'
import { EMPTY_CORE, type MetricsCore } from '@/lib/metrics/queries'
import { NO_PERMISSIONS } from '@/lib/permissions'

/**
 * Cada número segue o SEU módulo (decisão do Heitor, 2026-10-29): agenda e
 * clientes pela Agenda, dinheiro pelo Financeiro. Sem o "só os meus" (SM1/SM2,
 * o Heitor, 2026-11-23): quem tem o módulo vê os de todos; quem atende sem ele
 * vê os dela (a vista pessoal). O CRM não tem vista pessoal (SM3).
 */
const ctx = (over: Partial<TenantContext> = {}) =>
  ({ permissions: { ...NO_PERMISSIONS }, internalUserId: 'ela', providesServices: true, isClient: false, ...over }) as unknown as TenantContext

describe('recortePessoal', () => {
  it('com a Agenda e sem o Financeiro, quem atende: só o dinheiro é recortado', () => {
    expect(recortePessoal(ctx({ permissions: { ...NO_PERMISSIONS, agenda: 'VIEW' } }))).toEqual({ agenda: null, financeiro: 'ela', crm: null })
  })
  it('com o Financeiro e sem a Agenda, quem atende: só a agenda é recortada', () => {
    expect(recortePessoal(ctx({ permissions: { ...NO_PERMISSIONS, financial: 'VIEW' } }))).toEqual({ agenda: 'ela', financeiro: null, crm: null })
  })
  it('com os dois módulos, nada é recortado: o módulo dá tudo', () => {
    expect(recortePessoal(ctx({ permissions: { ...NO_PERMISSIONS, agenda: 'MANAGE', financial: 'VIEW', crm: 'VIEW' } })))
      .toEqual({ agenda: null, financeiro: null, crm: null })
  })
  it('a comissão de venda, sem atender: o dinheiro é dela, a agenda não', () => {
    expect(recortePessoal(ctx({ providesServices: false, comissaoDeVenda: true }))).toEqual({ agenda: null, financeiro: 'ela', crm: null })
  })
  it('o CRM não tem vista pessoal: sempre todos', () => {
    expect(recortePessoal(ctx()).crm).toBeNull()
  })
  it('fora do plano, nem a vista', () => {
    const plano = { funcionalidades: [] as string[], limites: { unidades: null, membros: null, whatsapp: null } }
    expect(recortePessoal(ctx({ plano }))).toEqual({ agenda: null, financeiro: null, crm: null })
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
