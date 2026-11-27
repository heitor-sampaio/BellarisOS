import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A49 da 9ª simulação (2026-11-07): a Marina pediu os dados pelo app, e a
 * Beatriz procurou na ficha e no sino — o pedido estava em Configurações →
 * LGPD, e nada apontava para lá. Agora o pedido feito pelo app avisa no sino
 * de quem responde (Configurações em Gerenciar, da clínica toda), com o
 * "Abrir" da aba, e a ficha diz o pedido em aberto e onde responder.
 * Numa rede [e2e] própria.
 */

test.setTimeout(240_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let deClientes: MembroDeTeste
let soConfig: MembroDeTeste
let soProntuario: MembroDeTeste
let cliente: ClienteDeTeste

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`lg9${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`lg9d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  // Revisão de 24/11 (Q09 do catálogo de Clientes): responde quem tem Clientes em Gerenciar.
  deClientes = await criarMembro(`lg9k${marca}`, { tenant: rede.tenantId, permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }] })
  soConfig = await criarMembro(`lg9s${marca}`, { tenant: rede.tenantId, permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
  // D2 da 39ª (LG-06, LG-08): quem libera o prontuário, sem Clientes.
  soProntuario = await criarMembro(`lg9p${marca}`, { tenant: rede.tenantId, permissoes: [{ modulo: 'medical_records', nivel: 'MANAGE' }] })
  cliente = await clienteComSessao(`lg9c${marca}`, { id: rede.branchId, slug: `e2e-un-lg9${marca}` }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  await cliente?.limpar()
  await dona?.limpar()
  await deClientes?.limpar()
  await soConfig?.limpar()
  await soProntuario?.limpar()
  await rede?.limpar()
})

test('A49: o pedido de dados feito pelo app avisa a rede no sino, e a ficha aponta para Configurações → LGPD', async ({ browser }) => {
  await como(browser, cliente.estado, async p => {
    await p.goto(`/${cliente.slug}/cliente/perfil`)
    // Com o prontuário: a parte dele espera a clínica (o pedido segue em aberto).
    await p.locator('input[name="include_medical"]').check()
    await p.getByRole('button', { name: 'Solicitar meus dados' }).click()
    await expect.poll(async () => (await db().from('lgpd_requests').select('id').eq('client_id', cliente.clientId)).data?.length).toBe(1)
  })

  await expect.poll(async () => ((await db().from('user_notifications').select('type, data').eq('user_id', dona.userId)).data ?? [])
    .filter(n => n.type === 'lgpd.pedido').map(n => (n.data as { caminho?: string }).caminho),
  { message: 'a dona é avisada, com o caminho da aba' }).toEqual(['/admin/settings?tab=lgpd'])

  await como(browser, dona.estado, async p => {
    await p.goto(`/admin/clients/${cliente.clientId}`)
    const aviso = p.locator('[data-pedido-lgpd-da-ficha]')
    await expect(aviso).toContainText('Pedido de dados (LGPD) feito pelo app')
    await expect(aviso).toContainText('responder até')
    await expect(aviso.getByRole('link', { name: /Configurações → LGPD/ })).toHaveAttribute('href', '/admin/settings?tab=lgpd')
  })
})

// Revisão de 24/11 (Q09 do catálogo de Clientes): o aviso vai a quem responde —
// Clientes em Gerenciar (a cliente é da rede) —, não a quem tem Configurações em
// Gerenciar ("o critério de antes de 18/11"). Corre depois do A49, que fez o pedido.
test('o aviso do pedido de dados vai a quem tem Clientes em Gerenciar, não a quem só tem Configurações', async () => {
  const avisos = async (userId: string) => ((await db().from('user_notifications').select('type, data').eq('user_id', userId)).data ?? [])
    .filter(n => n.type === 'lgpd.pedido').map(n => (n.data as { caminho?: string }).caminho)
  await expect.poll(() => avisos(deClientes.userId), { message: 'quem tem Clientes em Gerenciar é avisado' }).toEqual(['/admin/settings?tab=lgpd'])
  expect(await avisos(soConfig.userId), 'quem só tem Configurações não').toEqual([])
})

// A aba abre para quem responde (o agente S, catálogo de 24/11; Q09): o aviso e
// a ficha levavam quem tem Clientes em Gerenciar a uma aba que só abria com
// Configurações (ou o Prontuário) em Gerenciar. Quem só tem Configurações não a vê.
test('a aba LGPD abre para quem tem Clientes em Gerenciar, e não para quem só tem Configurações', async ({ browser }) => {
  const nome = (await db().from('clients').select('name').eq('id', cliente.clientId).single<{ name: string }>()).data!.name
  await como(browser, deClientes.estado, async p => {
    await p.goto('/admin/settings?tab=lgpd')
    await expect(p.getByRole('link', { name: /^LGPD/ })).toBeVisible()
    await expect(p.getByText(nome).first()).toBeVisible()
  })
  await como(browser, soConfig.estado, async p => {
    await p.goto('/admin/settings?tab=general')
    await expect(p.getByRole('heading', { name: 'Configurações' })).toBeVisible()
    await expect(p.getByRole('link', { name: /^LGPD/ })).toHaveCount(0)
  })
})

// D2 da 39ª (LG-06, LG-08): o aviso chamava quem tem o Prontuário em Gerenciar, e
// a aba dela, sem Clientes em Ver, escondia o pedido — a rede teve de dar Clientes
// ao cargo. Ela vê o pedido com o prontuário a liberar e o Liberar/Negar. Corre
// depois do A49, que fez o pedido com o prontuário.
test('quem tem o Prontuário em Gerenciar, sem Clientes, vê na aba LGPD o pedido a liberar e o Liberar/Negar', async ({ browser }) => {
  const nome = (await db().from('clients').select('name').eq('id', cliente.clientId).single<{ name: string }>()).data!.name
  await como(browser, soProntuario.estado, async p => {
    await p.goto('/admin/settings?tab=lgpd')
    const pedido = p.locator('[data-pedido-lgpd]', { hasText: nome })
    await expect(pedido).toContainText('Prontuário a liberar')
    await expect(pedido.getByRole('button', { name: 'Liberar' })).toBeVisible()
    await expect(pedido.getByRole('button', { name: 'Negar' })).toBeVisible()
    await expect(p.getByText(/precisa de Clientes \(Ver\)/)).toHaveCount(0)
  })
})
