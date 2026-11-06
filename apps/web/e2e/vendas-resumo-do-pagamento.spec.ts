import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A46 e A47 da 5ª simulação:
 * - a venda de pacote com "Entrada + parcelas" não mostrava o resumo
 *   ("entrada R$ 300 + 3× R$ 1.000"), só "Vender por R$ 3.300,00";
 * - no crédito, a tela não dizia "até 4x" (D-15) nem o valor da parcela.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
let slug = ''
let cliente = ''
let pacoteId = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`vrp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('procedures').update({ price: 600 }).eq('id', rede.procedureId)).error).toBeNull()
  // A clínica parcela no crédito até 4x (D-15).
  expect((await db().from('tenants').update({ cartao_max_vezes: 4 }).eq('id', rede.tenantId)).error).toBeNull()
  const { data: pac, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `[e2e] Pacote ${marca}`, p_preco: 3300, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 6 }],
  })
  expect(error).toBeNull()
  pacoteId = pac as string
  cliente = await rede.criarCliente('Venda')
  gestor = await criarMembro(`vrpg${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  await db().from('service_package_items').delete().eq('package_id', pacoteId)
  await db().from('service_packages').delete().eq('id', pacoteId)
  await gestor?.limpar(); await rede?.limpar()
})

test('A46: "Entrada + parcelas" mostra o resumo antes de vender; A47: o crédito diz "até 4x" e o valor da parcela', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await p.getByRole('button', { name: 'Vender', exact: true }).click()
    const dlg = p.getByRole('dialog', { name: 'Vender' })
    await dlg.getByRole('button', { name: 'Pacote', exact: true }).click()
    await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacoteId)

    await dlg.getByRole('button', { name: 'Entrada + parcelas' }).click()
    await dlg.getByLabel('Entrada').fill('300')
    await dlg.getByLabel('Parcelas').selectOption('3')
    await expect(dlg.locator('[data-resumo-do-pagamento]')).toHaveText(/Entrada R\$\s300,00 \+ 3× R\$\s1\.000,00/)

    await dlg.getByRole('button', { name: 'À vista' }).click()
    await dlg.getByLabel('Meio de pagamento').selectOption('CREDIT_CARD')
    const vezes = dlg.getByLabel('Vezes no cartão')
    await expect(vezes.locator('option')).toHaveCount(4)
    // A40 da 8ª: à vista, a linha diz para que serve.
    await expect(dlg.locator('[data-valor-da-parcela]')).toHaveText('À vista · parcela até 4x no crédito em “Vezes no cartão”')
    await vezes.selectOption('3')
    await expect(dlg.locator('[data-valor-da-parcela]')).toHaveText(/Até 4x no crédito · 3× R\$\s1\.100,00/)
  })
})
