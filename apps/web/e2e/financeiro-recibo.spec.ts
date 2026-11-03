import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * ven-06 da revisão das decisões (2026-11-02; o Heitor: "Um recibo simples em
 * PDF, pelo app ou impresso"). "A Carla pede recibo e a Bruna não tem o que
 * imprimir." Agora o lançamento PAGO tem "Recibo" (PDF) na lista do
 * Financeiro, e a cliente baixa o dela no app. A rota se defende sozinha
 * (§6): sessão, quem recebe ou vê o financeiro da unidade, a rede e a unidade
 * — ou, para a cliente, ser o pagamento DELA. Do que não foi pago, ou foi
 * estornado, não sai recibo. Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let outra: OutraRede
let caixa: MembroDeTeste
let alheio: MembroDeTeste
let cliente: ClienteDeTeste
let slug = ''
let pago = ''
let aberto = ''
let deOutraCliente = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function lancar(clientId: string, campos: Record<string, unknown>) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: clientId, type: 'INCOME', category: 'Serviços', created_by: 'e2e', ...campos,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}
const textoDoPdf = (b: Buffer) => b.toString('latin1')

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`rcb${marca}`)
  outra = await criarOutraRede(`rcbo${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`rcb${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  await db().from('clients').update({ name: `${PREFIXO} Carla Recibo ${marca}`, document: '52998224725' }).eq('id', cliente.clientId)
  const outraCliente = await rede.criarCliente('Outra do recibo')
  pago = await lancar(cliente.clientId, { description: `Limpeza de pele ${marca}`, amount: 180, payment_method: 'CREDIT_CARD', cartao_vezes: 3, is_paid: true, paid_at: new Date().toISOString() })
  aberto = await lancar(cliente.clientId, { description: `Parcela ${marca}`, amount: 90, is_paid: false })
  deOutraCliente = await lancar(outraCliente, { description: `Peeling ${marca}`, amount: 250, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString() })
  caixa = await criarMembro(`rcb${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'VIEW' }],
  })
  alheio = await criarMembro(`rcba${marca}`, {
    tenant: outra.tenantId, rotulo: 'Financeiro de outra rede', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (rede) await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  await caixa?.limpar(); await alheio?.limpar(); await cliente?.limpar()
  await rede?.limpar(); await outra?.limpar()
})

test('a recepção tira o recibo do pagamento pela lista do Financeiro: um PDF com quem pagou, quanto, o quê e como', async ({ browser }) => {
  await como(browser, caixa.estado, async p => {
    await p.goto(`/${slug}/financeiro`)
    const link = p.locator(`[data-lancamento="${pago}"]`).getByRole('link', { name: 'Recibo' })
    await expect(link).toHaveAttribute('href', `/api/recibos/${pago}`)
    await expect(p.locator(`[data-lancamento="${aberto}"]`).getByRole('link', { name: 'Recibo' }), 'do a receber, não').toHaveCount(0)
    const r = await p.request.get(`/api/recibos/${pago}`)
    expect(r.status()).toBe(200)
    expect(r.headers()['content-type']).toContain('application/pdf')
    const pdf = textoDoPdf(await r.body())
    expect(pdf.startsWith('%PDF-')).toBe(true)
    for (const t of ['Recibo', `Carla Recibo ${marca}`, '529.982.247-25', 'R$ 180,00', `Limpeza de pele ${marca}`, 'Crédito 3x', 'não substitui a nota fiscal']) {
      expect(pdf, `o recibo diz "${t}"`).toContain(t)
    }
    expect((await p.request.get(`/api/recibos/${aberto}`)).status(), 'do que não foi pago, não sai recibo').toBe(404)
  })
})

test('quem é de outra rede não tira o recibo', async ({ browser }) => {
  await como(browser, alheio.estado, async p => {
    await p.goto('/admin/financeiro')
    expect((await p.request.get(`/api/recibos/${pago}`)).status()).toBe(404)
  })
})

test('a cliente baixa o recibo dela no app — e não o de outra cliente', async ({ browser }) => {
  await como(browser, cliente.estado, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    await expect(p.getByRole('link', { name: 'Recibo' })).toHaveAttribute('href', `/api/recibos/${pago}`)
    const r = await p.request.get(`/api/recibos/${pago}`)
    expect(r.status()).toBe(200)
    expect(textoDoPdf(await r.body())).toContain(`Limpeza de pele ${marca}`)
    expect((await p.request.get(`/api/recibos/${deOutraCliente}`)).status()).toBe(404)
  })
})
