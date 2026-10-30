import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D-18 (decisão do Heitor, 2026-10-30): o plano PROPOSTO aparece no app com
 * os procedimentos, o valor e a validade, e o botão "Falar com a clínica". O
 * aceite continua na clínica — o app não aceita. A anotação do profissional
 * no plano é dado clínico e não vai à cliente.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let segundo = ''
let plano = ''
const SEGREDO = `[e2e] anotação clínica ${marca}`

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('branches').update({ phone: '(41) 99876-5432' }).eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('tenants').update({ plano_validade_dias: 10 }).eq('id', rede.tenantId)).error).toBeNull()
  cliente = await clienteComSessao(`ppc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  const { data: pr2, error: ePr } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Drenagem ${marca}`, category: 'e2e', duration_min: 30, price: 200 })
    .select('id').single<{ id: string }>()
  expect(ePr).toBeNull()
  segundo = pr2!.id
  const { data: pl, error: ePl } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, professional_id: rede.professionalId,
    status: 'PROPOSED', name: `[e2e] Plano ${marca}`, professional_notes: SEGREDO,
    created_at: '2026-10-20T15:00:00Z',
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  plano = pl!.id
  const { data: sessoes, error: eS } = await db().from('treatment_plan_sessions')
    .insert([{ plan_id: plano, sort_order: 0, notes: SEGREDO }, { plan_id: plano, sort_order: 1 }]).select('id, sort_order')
  expect(eS).toBeNull()
  const s = (o: number) => sessoes!.find(x => x.sort_order === o)!.id
  expect((await db().from('treatment_plan_session_procedures').insert([
    { session_id: s(0), procedure_id: rede.procedureId, price: 300 },
    { session_id: s(1), procedure_id: segundo, price: 200 },
  ])).error).toBeNull()
})
test.afterAll(async () => {
  if (plano) await db().from('treatment_plans').delete().eq('id', plano)
  await cliente?.limpar(); await rede?.limpar()
})

test('o plano proposto mostra procedimentos, valor e validade, e leva a falar com a clínica', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const cartao = p.locator('[data-plano-proposto]')
    await expect(cartao).toContainText(`Proc pp${marca}`)
    await expect(cartao).toContainText(`Drenagem ${marca}`)
    await expect(cartao).toContainText('R$ 500,00')
    await expect(cartao).toContainText('2 sessões')
    // Proposto em 20/10 (Brasília), válido por 10 dias.
    await expect(cartao).toContainText('30/10/2026')
    await expect(cartao).toContainText('O aceite é feito na clínica')
    const falar = cartao.getByRole('link', { name: /Falar com a clínica/ })
    await expect(falar).toHaveAttribute('href', /wa\.me\/5541998765432/)
    // Nem a anotação do plano nem a da sessão vão à cliente; e o app não aceita.
    await expect(p.getByText(SEGREDO)).toHaveCount(0)
    expect(await p.content()).not.toContain(SEGREDO)
    await expect(cartao.getByRole('button', { name: /Aceitar/ })).toHaveCount(0)
  })
})
