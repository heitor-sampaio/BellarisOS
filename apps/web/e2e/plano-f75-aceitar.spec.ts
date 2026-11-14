import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A24 da 14ª simulação (F75), a página do plano:
 * - o erro do "Aceitar plano" aparecia no TOPO da página, longe do botão — a
 *   Débora clicava, nada mudava ali, e ela clicava de novo. O erro do botão
 *   aparece junto dele.
 * - o plano já aceito seguia dizendo "Aceitar plano". Desde a fase 3 do PDV, o
 *   aceito diz que falta receber, e leva ao PDV.
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let slug = ''
let cliente = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function plano(status: 'DRAFT' | 'PROPOSED', comSessao: boolean): Promise<string> {
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente, status, name: `${PREFIXO} Plano A24 ${marca}`,
    professional_notes: 'Observação da profissional.',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  if (comSessao) {
    const { data: s } = await db().from('treatment_plan_sessions').insert({ plan_id: pl!.id, sort_order: 0 }).select('id').single<{ id: string }>()
    expect((await db().from('treatment_plan_session_procedures').insert({ session_id: s!.id, procedure_id: rede.procedureId, price: 200 })).error).toBeNull()
  }
  return pl!.id
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`f75p${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`f75pd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  cliente = await rede.criarCliente('Plano A24')
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A24: o erro do "Aceitar plano" aparece junto do botão', async ({ browser }) => {
  test.setTimeout(120_000)
  const id = await plano('DRAFT', false)
  await como(browser, async p => {
    await p.goto(`/${slug}/planejamentos/${id}`)
    await p.getByRole('button', { name: 'Aceitar plano' }).click()
    const botoes = p.locator('[data-botoes-do-plano]')
    await expect(botoes.locator('[data-erro-do-botao]')).toBeVisible({ timeout: 20_000 })
    await expect(botoes.locator('[data-erro-do-botao]')).toContainText(/sessão/)
  })
})

// Desde a fase 3 do PDV (PT1b, a revisão do Heitor de 2026-11-13) o plano
// proposto é o "a cliente vai pensar" — diz "Aceitar plano" —, e o aceito é o
// que não pede aceite de novo: ele diz onde receber.
test('A24: o plano já aceito não pede aceite de novo — diz que falta receber, no PDV', async ({ browser }) => {
  test.setTimeout(120_000)
  const id = await plano('PROPOSED', true)
  await como(browser, async p => {
    await p.goto(`/${slug}/planejamentos/${id}`)
    await p.getByRole('button', { name: 'Aceitar plano' }).click()
    const falta = p.locator('[data-plano-falta-receber]')
    await expect(falta).toBeVisible({ timeout: 30_000 })
    await expect(falta.getByRole('link', { name: 'Receber no PDV' })).toBeVisible()
    await p.reload()
    await expect(p.locator('[data-plano-falta-receber]')).toBeVisible({ timeout: 30_000 })
    await expect(p.getByRole('button', { name: 'Aceitar plano' })).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Continuar o checkout' })).toHaveCount(0)
  })
  expect((await db().from('treatment_plans').select('status').eq('id', id).single()).data!.status).toBe('ACCEPTED')
})
