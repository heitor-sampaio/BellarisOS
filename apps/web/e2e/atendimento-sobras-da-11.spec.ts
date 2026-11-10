import { test, expect, devices, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { responderAnamnese } from './apoio/anamnese'

/**
 * A31 da 11ª simulação (2026-11-10), sobra da D1 da 10ª: no celular o
 * "Finalizar atendimento" é a barra presa no RODAPÉ, e o texto da tela dizia
 * "use 'Finalizar atendimento', no alto da tela". Princípio 3: o texto diz
 * onde o botão está — no alto no computador, no rodapé no celular.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let profissional: MembroDeTeste | null = null
const PIXEL_7 = devices['Pixel 7']

async function abrir(browser: Browser, celular: boolean, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext(celular
    ? { storageState: profissional!.estado, viewport: { width: 412, height: 839 }, deviceScaleFactor: PIXEL_7.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: PIXEL_7.userAgent }
    : { storageState: profissional!.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`as11${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`as11p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await rede?.limpar()
})

test('A31: o texto diz onde está o "Finalizar atendimento" — no alto no computador, no rodapé no celular', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Rodape')
  await responderAnamnese(cliente, rede!.tenantId)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const textoVisivel = async (p: Page) => p.locator('[data-dica-do-avulso]').evaluate(e => (e as HTMLElement).innerText)

  await abrir(browser, true, async p => {
    await p.goto(`/${slug}/agenda/${data!.id}`)
    await expect(p.locator('[data-dica-do-avulso]')).toBeVisible()
    const t = await textoVisivel(p)
    expect(t).toContain('na barra do rodapé')
    expect(t).not.toContain('no alto da tela')
  })
  await abrir(browser, false, async p => {
    await p.goto(`/${slug}/agenda/${data!.id}`)
    await expect(p.locator('[data-dica-do-avulso]')).toBeVisible()
    const t = await textoVisivel(p)
    expect(t).toContain('no alto da tela')
    expect(t).not.toContain('rodapé')
  })
})
