import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Atritos de formulário vistos na simulação de um dia de clínica (2026-10-20):
 * - rótulos soltos dos campos (o cadastro, o lançamento financeiro, a ficha de
 *   saúde): o leitor de tela e o clique no rótulo não chegavam ao campo;
 * - a validação do navegador em inglês ("Please fill out this field");
 * - o telefone sem máscara (a unidade; o cadastro rápido da agenda);
 * - a despesa sem forma de pagamento;
 * - a ficha de saúde em duas colunas no celular.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: estado, ...(viewport ? { viewport } : {}) })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fa${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  await db().from('tenants').update({ pre_atendimento_envio: true }).eq('id', rede.tenantId)
  gestor = await criarMembro(`fag${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  cliente = await clienteComSessao(`fac${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})
test.afterAll(async () => {
  if (rede) await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  await cliente?.limpar(); await gestor?.limpar(); await rede?.limpar()
})

test('o cadastro de cliente: o rótulo leva ao campo, o telefone ganha máscara, e a validação fala português', async ({ browser }) => {
  await como(browser, gestor!.estado, async p => {
    await p.goto('/admin/clients/new')
    const nome = p.getByLabel('Nome completo *')
    await expect(nome).toBeVisible()
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect.poll(() => nome.evaluate((el: HTMLInputElement) => el.validationMessage)).toBe('Preencha este campo.')
    const tel = p.getByLabel('Telefone *')
    await expect(async () => {
      await tel.fill('')
      await tel.pressSequentially('48991234567')
      await expect(tel).toHaveValue('(48) 99123-4567', { timeout: 1000 })
    }).toPass()
  })
})

test('o telefone da unidade tem máscara — no campo e no cartão', async ({ browser }) => {
  expect((await db().from('branches').update({ phone: '4833334444' }).eq('id', rede!.branchId)).error).toBeNull()
  await como(browser, gestor!.estado, async p => {
    await p.goto('/admin/settings?tab=unidades')
    await expect(p.getByText('(48) 3333-4444')).toBeVisible()
    await p.goto(`/admin/branches/${rede!.branchId}`)
    const tel = p.getByLabel('Telefone')
    await expect(async () => {
      await tel.fill('')
      await tel.pressSequentially('48991234567')
      await expect(tel).toHaveValue('(48) 99123-4567', { timeout: 1000 })
    }).toPass()
  })
})

test('o lançamento financeiro: o rótulo leva ao campo, e a despesa tem forma de pagamento', async ({ browser }) => {
  await como(browser, gestor!.estado, async p => {
    await p.goto(`/${slug}/financeiro`)
    await expect(async () => {
      await p.getByRole('button', { name: 'Novo lançamento' }).first().click({ timeout: 1000 })
      await expect(p.getByLabel('Descrição *')).toBeVisible({ timeout: 1000 })
    }).toPass()
    await expect(p.getByLabel('Forma de pagamento')).toBeVisible()
  })
})

test('a ficha de saúde no celular: uma coluna, e o rótulo leva ao campo', async ({ browser }) => {
  const { error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente!.clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  })
  expect(error).toBeNull()
  await como(browser, cliente!.estado, async p => {
    await p.goto(`/${slug}/cliente/pre-atendimento`)
    const linha = p.locator('.anamnesis-row:not([data-cols="1"])').first()
    await expect(linha).toBeVisible()
    const colunas = await linha.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(colunas, 'uma coluna no celular').toBe(1)
    await expect(p.locator('[data-campo="allergies"]').getByLabel(/Alergia/i)).toBeVisible()
  }, { width: 390, height: 844 })
})
