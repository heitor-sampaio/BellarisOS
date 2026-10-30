import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-66 das simulações: nenhuma tela do app trazia o endereço, o telefone, o
 * WhatsApp ou o horário da clínica. Agora o cartão "A clínica", com os dados
 * da unidade do ENDEREÇO (o slug).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ac${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const dia = [{ de: '09:00', ate: '19:00' }]
  expect((await db().from('branches').update({
    phone: '41998765432', address: 'Rua das Flores, 120', city: 'Curitiba', state: 'PR', zip_code: '80000000',
    horario: { dias: { 0: [], 1: dia, 2: dia, 3: dia, 4: dia, 5: dia, 6: [{ de: '09:00', ate: '13:00' }] } },
  }).eq('id', rede.branchId)).error).toBeNull()
  cliente = await clienteComSessao(`acc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})
test.afterAll(async () => {
  await cliente?.limpar(); await rede?.limpar()
})

test('a home do app tem o cartão "A clínica" com endereço, telefone, WhatsApp e horário', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const cartao = p.locator('[data-a-clinica]')
    await expect(cartao).toContainText('A clínica')
    await expect(cartao).toContainText(`Unidade ac${marca}`)
    await expect(cartao).toContainText('Rua das Flores, 120, Curitiba – PR, 80000-000')
    await expect(cartao).toContainText('(41) 99876-5432')
    await expect(cartao).toContainText('Seg a sex, 09:00–19:00')
    await expect(cartao).toContainText('Sáb, 09:00–13:00')
    await expect(cartao.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/5541998765432')
    await expect(cartao.getByRole('link', { name: /Ligar/ })).toHaveAttribute('href', 'tel:+5541998765432')
  })
})
