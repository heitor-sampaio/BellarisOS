import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A12 da 20ª simulação (2026-11-17; princípio 3, como a "Foto nova"): a
 * Camila não foi avisada no sino de que um plano tinha sido proposto — ele
 * aparecia só no cartão do Início. O plano proposto avisa a cliente uma vez
 * ("Plano novo", sem nada clínico: o aviso aparece na tela de bloqueio), com
 * o link para o plano no app.
 */

type Linha = Record<string, unknown>
const banco: Record<string, Linha[]> = {}
const valorEm = (l: Linha, c: string) => c.split(/->>|->|\./).reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Linha)[k] : undefined), l)

function construtor(tabela: string) {
  const filtros: ((l: Linha) => boolean)[] = []
  let uma = false
  const b: Record<string, unknown> = {}
  const cadeia = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => { fn(...a); return b }
  b.select = cadeia(() => {})
  b.eq = cadeia((c, v) => filtros.push(l => valorEm(l, c as string) === v))
  b.limit = cadeia(() => {})
  b.maybeSingle = cadeia(() => { uma = true })
  b.then = (ok: (r: unknown) => unknown) => {
    const casam = (banco[tabela] ?? []).filter(l => filtros.every(f => f(l)))
    return Promise.resolve({ data: uma ? (casam[0] ?? null) : casam, error: null }).then(ok)
  }
  return b
}

const notifyClient = vi.fn(async () => {})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/notifications/notify', () => ({ notifyClient }))

function montar(status = 'PROPOSED') {
  for (const k of Object.keys(banco)) delete banco[k]
  banco.treatment_plans = [{ id: 'pl1', client_id: 'cl-camila', status, branches: { tenant_id: 't1', slug: 'atelie-dalia', name: 'Ateliê Dália' } }]
  banco.client_notifications = []
}

describe('A12: o plano proposto avisa a cliente', () => {
  beforeEach(() => notifyClient.mockClear())

  it('avisa, sem nada clínico, com o link para o plano no app', async () => {
    montar()
    const { avisarDoPlanoProposto } = await import('@/lib/plano-de-tratamento/aviso-do-proposto')
    await avisarDoPlanoProposto('t1', 'pl1')
    expect(notifyClient).toHaveBeenCalledTimes(1)
    const [, cliente, aviso] = notifyClient.mock.calls[0] as unknown as [unknown, string, { title: string; body: string; data: Linha }]
    expect(cliente).toBe('cl-camila')
    expect(aviso.title).toBe('Plano novo')
    expect(aviso.body).toBe('Ateliê Dália preparou um plano de tratamento para você.')
    expect(aviso.data.link).toBe('/atelie-dalia/cliente/planos/pl1')
  })

  it('uma vez só: o plano refeito não avisa de novo', async () => {
    montar()
    banco.client_notifications = [{ id: 'n1', client_id: 'cl-camila', type: 'plano_proposto', data: { planoId: 'pl1' } }]
    const { avisarDoPlanoProposto } = await import('@/lib/plano-de-tratamento/aviso-do-proposto')
    await avisarDoPlanoProposto('t1', 'pl1')
    expect(notifyClient).not.toHaveBeenCalled()
  })

  it('o plano de outra rede, ou que não está proposto, não avisa', async () => {
    montar()
    const { avisarDoPlanoProposto } = await import('@/lib/plano-de-tratamento/aviso-do-proposto')
    await avisarDoPlanoProposto('t2', 'pl1')
    montar('DRAFT')
    await avisarDoPlanoProposto('t1', 'pl1')
    expect(notifyClient).not.toHaveBeenCalled()
  })

  it('os dois caminhos que propõem avisam (mandar à cliente e gerar da avaliação)', () => {
    const acoes = readFileSync(join(__dirname, '..', 'actions/treatment-plans.ts'), 'utf8')
    expect(acoes.match(/avisarDoPlanoProposto\(/g)?.length).toBe(2)
  })
})
