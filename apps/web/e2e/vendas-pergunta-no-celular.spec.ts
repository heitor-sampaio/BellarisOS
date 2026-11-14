import { test, expect, devices, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { abrirVendaNoPdv } from './apoio/vender'

/**
 * A1 da 10ª simulação (2026-11-10), da F49: no Vender a 412 px, tocar em
 * "Vender por R$ 220,00" sem "Quem vendeu" abria a pergunta "Ninguém foi
 * marcado… Vender assim?" fora da tela, no fim da janela — o botão parecia
 * morto. A pergunta (a mesma do checkout do plano) aparece à vista, com o
 * "Vender assim" ao alcance.
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let cliente = ''

async function noCelular(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const px = devices['Pixel 7']
  const ctx = await browser.newContext({
    storageState: quem.estado, viewport: { width: 412, height: 839 },
    deviceScaleFactor: px.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: px.userAgent,
  })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`vp10${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('procedures').update({ price: 220 }).eq('id', rede.procedureId)).error).toBeNull()
  dona = await criarMembro(`vp10d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  cliente = await rede.criarCliente('Marina')
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('A1: sem "Quem vendeu", a pergunta do Vender aparece inteira na tela do celular, e "Vender assim" vende', async ({ browser }) => {
  await noCelular(browser, dona!, async p => {
    const dlg = await abrirVendaNoPdv(p, `/${slug}`, cliente)
    await dlg.getByRole('radio', { name: 'Pix', exact: true }).click()
    await expect(dlg.getByLabel('Quem vendeu')).toHaveValue('')
    await dlg.getByRole('button', { name: /^Vender por R\$\s220,00/ }).click()
    const pergunta = dlg.getByRole('alertdialog', { name: 'Confirmar a venda' })
    await expect(pergunta).toContainText('Ninguém foi marcado')
    await expect(pergunta, 'a pergunta inteira na tela').toBeInViewport({ ratio: 1 })
    const vender = pergunta.getByRole('button', { name: 'Vender assim' })
    await expect(vender).toBeFocused()
    await vender.click()
    await expect(p.getByText(/Venda registrada/)).toBeVisible({ timeout: 15_000 })
  })
  const { count } = await db().from('financial_transactions').select('id', { count: 'exact', head: true }).eq('client_id', cliente)
  expect(count).toBeGreaterThan(0)
})
