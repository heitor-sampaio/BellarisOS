import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conferirCredito, creditosDoCliente, recusaDoCreditoDoAgendamento, recusaDoCreditoNoDia } from '@/lib/creditos/credito'

/**
 * PP-05 ("Agendar usando o que já foi pago … confere o crédito: é da cliente,
 * da rede, está livre e dentro da validade"). Decisões do Claude, 27/11 (A3 e
 * A6 da 37ª): vale o DIA MARCADO da sessão, e a validade é um DIA no fuso da
 * unidade do crédito. O app aceitou 30/11 num pacote que vence em 29/11 (D1),
 * e o pacote vendido às 05:22 de 29/11 ("válido até 29/11") deixava de se
 * agendar às 10h de 29/11.
 *
 * PP-07 ("o crédito mais antigo já vem escolhido"); decisão do Claude, 27/11
 * (A1 da 37ª): o mais antigo pela data de compra, qualquer tipo; empatando, o
 * que vence antes. Com um pacote de Drenagem antigo e um pré-pago de Drenagem
 * de hoje, o modal trazia o pré-pago (D3).
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const SESSAO = '11111111-1111-4111-8111-111111111111'
const UNIDADE = '22222222-2222-4222-8222-222222222222'
// Studio em Rondonópolis (UTC−4): o pacote vendido às 01:22 de 29/11, hora de lá.
const VENDIDO_AS_05_22 = '2026-11-29T05:22:00Z'

function adminDoCredito(tabelas: Record<string, unknown>) {
  const consulta = (tabela: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'in', 'is', 'not', 'or', 'limit', 'range', 'neq']) q[m] = () => q
    q.maybeSingle = () => q
    q.single = () => q
    q.then = (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: tabelas[tabela] ?? null, error: null }).then(ok)
    return q
  }
  return { from: consulta, rpc: async () => ({ data: [], error: null }) } as unknown as Parameters<typeof conferirCredito>[0]
}

const sessaoDoPacote = (expires_at: string | null) => ({
  status: 'AVAILABLE', appointment_id: null, procedure_id: 'p1', preco: 124.9, client_package_id: 'cp1',
  client_packages: { client_id: 'cli', price: 765, total_sessions: 5, expires_at, branches: { tenant_id: 'rede', fuso: 'America/Cuiaba' }, service_packages: null },
})
const unidadePrePaga = (expires_at: string | null) => ({
  status: 'DISPONIVEL', appointment_id: null, preco: 80,
  procedure_sales: { tenant_id: 'rede', client_id: 'cli', procedure_id: 'p1', expires_at, branches: { fuso: 'America/Cuiaba' } },
})
const regras = { pacote_crediario_libera: true, pacote_vencido_cancela: false }

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-29T14:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

describe('o crédito vale no DIA MARCADO da sessão (PP-05)', () => {
  it('o pacote que vale até 29/11 não se marca para 30/11, e a recusa diz até quando', async () => {
    const r = await conferirCredito(adminDoCredito({ package_sessions: sessaoDoPacote(VENDIDO_AS_05_22), tenants: regras }),
      'rede', 'cli', { tipo: 'PACOTE', id: SESSAO }, { quando: '2026-11-30T13:00:00Z' })
    expect('error' in r && r.error).toBe('Este pacote vale até 29/11/2026: marque a sessão até esse dia.')
  })
  it('no último dia da validade, depois da hora da compra, ainda se marca (a validade é um dia, A6)', async () => {
    const r = await conferirCredito(adminDoCredito({ package_sessions: sessaoDoPacote(VENDIDO_AS_05_22), tenants: regras }),
      'rede', 'cli', { tipo: 'PACOTE', id: SESSAO }, { quando: '2026-11-29T20:00:00Z' })
    expect(r).toEqual({ procedureId: 'p1', preco: 124.9 })
  })
  it('o pré-pago também: depois da validade, recusa; no dia, vale', async () => {
    const depois = await conferirCredito(adminDoCredito({ procedure_sale_units: unidadePrePaga(VENDIDO_AS_05_22) }),
      'rede', 'cli', { tipo: 'PRE_PAGO', id: SESSAO }, { quando: '2026-12-01T13:00:00Z' })
    expect('error' in depois && depois.error).toBe('Este pré-pago vale até 29/11/2026: marque a sessão até esse dia.')
    const noDia = await conferirCredito(adminDoCredito({ procedure_sale_units: unidadePrePaga(VENDIDO_AS_05_22) }),
      'rede', 'cli', { tipo: 'PRE_PAGO', id: SESSAO }, { quando: '2026-11-29T21:00:00Z' })
    expect(noDia).toEqual({ procedureId: 'p1', preco: 80 })
  })
  it('vencido de ontem: "venceu em", com a data', async () => {
    const r = await conferirCredito(adminDoCredito({ package_sessions: sessaoDoPacote('2026-11-28T05:22:00Z'), tenants: regras }),
      'rede', 'cli', { tipo: 'PACOTE', id: SESSAO }, { quando: '2026-11-29T20:00:00Z' })
    expect('error' in r && r.error).toBe('Este pacote venceu em 28/11/2026.')
  })
  it('o núcleo do agendamento confere com o dia marcado', () => {
    expect(fonte('lib/appointments/core.ts')).toMatch(/conferirCredito\(admin, ctx\.tenantId!, input\.clientId, input\.credito, \{ quando: input\.scheduledAt/)
  })
  it('a remarcação recusa levar a sessão do pacote para depois da validade', async () => {
    const admin = adminDoCredito({
      package_sessions: [{ client_packages: { expires_at: VENDIDO_AS_05_22, branches: { fuso: 'America/Cuiaba' } } }],
      procedure_sale_units: [],
    })
    expect(await recusaDoCreditoDoAgendamento(admin, SESSAO, '2026-11-30T13:00:00Z', 'America/Cuiaba'))
      .toBe('Este pacote vale até 29/11/2026: marque a sessão até esse dia.')
    expect(await recusaDoCreditoDoAgendamento(admin, SESSAO, '2026-11-29T20:00:00Z', 'America/Cuiaba')).toBeNull()
    expect(fonte('lib/appointments/alteracoes.ts')).toMatch(/recusaDoCreditoDoAgendamento\(admin, existente\.id, inicio\.toISOString\(\), existente\.fuso\)/)
  })
  it('ligar o pacote a um avulso já marcado confere o dia dele', async () => {
    const admin = adminDoCredito({ procedure_sale_units: unidadePrePaga(VENDIDO_AS_05_22) })
    expect(await recusaDoCreditoNoDia(admin, { tipo: 'PRE_PAGO', id: SESSAO }, '2026-11-30T13:00:00Z', 'America/Cuiaba'))
      .toBe('Este pré-pago vale até 29/11/2026: marque a sessão até esse dia.')
    expect(fonte('actions/creditos.ts')).toMatch(/recusaDoCreditoNoDia\(admin, c, a\.scheduled_at, a\.fuso\)/)
  })
})

describe('o que a cliente tem para agendar', () => {
  const pacote = (extra: Record<string, unknown>) => ({
    id: 'cp1', branch_id: UNIDADE, expires_at: null, price: 650, total_sessions: 5, purchased_at: '2026-10-01T12:00:00Z',
    branches: { tenant_id: 'rede', fuso: 'America/Cuiaba' }, service_packages: { name: '5 drenagens', procedure_id: 'p1' },
    package_sessions: [{ id: 's1', session_number: 1, procedure_id: 'p1', preco: 130, status: 'AVAILABLE', appointment_id: null, procedures: { name: 'Drenagem' } }],
    ...extra,
  })
  const prePago = (extra: Record<string, unknown>) => ({
    procedure_id: 'p1', expires_at: null, sold_at: '2026-11-29T12:00:00Z', branches: { fuso: 'America/Cuiaba' }, procedures: { name: 'Drenagem' },
    procedure_sale_units: [{ id: 'u1', numero: 1, preco: 140, status: 'DISPONIVEL', appointment_id: null }],
    ...extra,
  })
  it('o pacote que vale até hoje (comprado de madrugada) ainda aparece no dia (A6)', async () => {
    const r = await creditosDoCliente(adminDoCredito({ procedure_sales: [], treatment_plans: [], tenants: regras,
      client_packages: [pacote({ expires_at: VENDIDO_AS_05_22 })] }), 'rede', 'cli')
    expect(r.map(c => c.id)).toEqual(['s1'])
  })
  it('o mais antigo pela compra vem primeiro, qualquer tipo: o pacote de outubro antes do pré-pago de hoje (D3)', async () => {
    const r = await creditosDoCliente(adminDoCredito({ treatment_plans: [], tenants: regras,
      procedure_sales: [prePago({})], client_packages: [pacote({})] }), 'rede', 'cli')
    expect(r.map(c => c.tipo)).toEqual(['PACOTE', 'PRE_PAGO'])
  })
  it('comprados no mesmo dia, vem antes o que vence antes', async () => {
    const r = await creditosDoCliente(adminDoCredito({ treatment_plans: [], tenants: regras,
      procedure_sales: [prePago({ sold_at: '2026-10-01T12:00:00Z', expires_at: '2027-01-10T12:00:00Z' })],
      client_packages: [pacote({ expires_at: '2027-03-10T12:00:00Z' })] }), 'rede', 'cli')
    expect(r.map(c => c.tipo)).toEqual(['PRE_PAGO', 'PACOTE'])
  })
})
