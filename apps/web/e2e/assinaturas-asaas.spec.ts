import { test, expect, request, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'
import { subirAsaasFalso, type AsaasFalso } from './apoio/asaas-falso'

/**
 * A cobrança das assinaturas pelo ASAAS, de ponta a ponta — contra o BUILD,
 * com o Asaas FALSO numa porta fixa (o servidor lê `ASAAS_BASE_URL_TESTE` ao
 * subir: playwright.build.config.ts e o workflow). No `next dev`, se pula.
 *
 * - ligar a cobrança cria o cliente (com o CPF/CNPJ e a rede como
 *   referência) e a assinatura mensal no Asaas;
 * - o webhook se defende pelo token; o evento repetido não processa duas vezes;
 * - fatura vencida → em atraso, com o aviso e o "Pagar" para quem administra;
 * - paga → em dia, sozinha; cancelar encerra a assinatura no Asaas.
 */
test.skip(!process.env.ASAAS_BASE_URL_TESTE || !plataformaNoAr(), 'só contra o build: o sistema precisa subir com ASAAS_BASE_URL_TESTE')

const PORTA = 3198
const marca = Date.now().toString(36)
const db = () => banco()
const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN ?? ''
const DOCUMENTO = `8${String(Date.now()).slice(-10)}`
const FATURA = `https://asaas.invalid/i/${marca}`

let asaas: AsaasFalso
let admin: AtendenteDeTeste
let outra: OutraRede
let gestor: MembroDeTeste
let assinaturaId = ''

test.beforeAll(async () => {
  test.setTimeout(600_000)
  asaas = await subirAsaasFalso(PORTA)
  admin = await criarAtendente(`asad${marca}`, { papel: 'ADMIN' })
  outra = await criarOutraRede(`as${marca}`)
  gestor = await criarMembro(`asgest${marca}`, {
    tenant: outra.tenantId, rotulo: 'Gestor', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const b = db()
  const falhas: string[] = []
  const anote = (o: string, e: { message: string } | null) => { if (e) falhas.push(`${o}: ${e.message}`) }
  if (outra) {
    anote('eventos', (await b.from('asaas_events').delete().like('id', `evt_${marca}%`)).error)
    anote('faturas', (await b.from('subscription_invoices').delete().eq('tenant_id', outra.tenantId)).error)
    anote('assinatura', (await b.from('tenant_subscriptions').delete().eq('tenant_id', outra.tenantId)).error)
    anote('registro', (await b.from('platform_audit_log').delete().eq('tenant_id', outra.tenantId)).error)
  }
  if (gestor) {
    anote('notificações', (await b.from('user_notifications').delete().eq('user_id', gestor.userId)).error)
    await gestor.limpar()
  }
  if (outra) await outra.limpar()
  if (admin) await admin.limpar()
  if (asaas) await asaas.fechar()
  expect(falhas).toEqual([])
})

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O Asaas chamando o webhook: sem sessão nenhuma (é o token que vale). */
async function webhook(corpo: Record<string, unknown>, token = TOKEN) {
  // O webhook mora no SISTEMA (2026-10-06), não na clínica.
  const ctx = await request.newContext({ baseURL: urlDaPlataforma('sistema') })
  try {
    const r = await ctx.post('/api/webhooks/asaas', { headers: { 'asaas-access-token': token }, data: corpo })
    return { status: r.status(), json: await r.json().catch(() => ({})) as Record<string, unknown> }
  } finally { await ctx.dispose() }
}

async function situacao() {
  const { data } = await db().from('tenants').select('plan_status, em_atraso_desde').eq('id', outra.tenantId)
    .single<{ plan_status: string; em_atraso_desde: string | null }>()
  return data!
}

const ontem = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - 2 * 86_400_000))

test.describe.serial('cobrança pelo Asaas', () => {
  test('ligar a cobrança cria o cliente e a assinatura no Asaas', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      const rota = `${urlDaPlataforma('sistema')}/redes/${outra.tenantId}`
      const { data: t } = await db().from('tenants').select('name, email').eq('id', outra.tenantId).single<{ name: string; email: string }>()
      expect((await chamarAcao(p, 'actions/sistema.ts', 'editarRede', rota,
        [outra.tenantId, { nome: t!.name, documento: DOCUMENTO, email: t!.email, telefone: null }])).texto).toContain('"ok":true')
      expect((await chamarAcao(p, 'actions/sistema.ts', 'definirAssinatura', rota,
        [outra.tenantId, { planoId: null, valorCentavos: 19990 }])).texto).toContain('"ok":true')
      const vencimento = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 5 * 86_400_000))
      expect((await chamarAcao(p, 'actions/sistema.ts', 'ativarCobrancaNoAsaas', rota, [outra.tenantId, vencimento])).texto).toContain('"ok":true')
    })
    const cliente = asaas.chamadas.find(c => c.metodo === 'POST' && c.caminho === '/customers')
    expect(cliente?.corpo).toMatchObject({ cpfCnpj: DOCUMENTO, externalReference: outra.tenantId })
    expect(cliente?.chave).toBeTruthy()
    const sub = asaas.chamadas.find(c => c.metodo === 'POST' && c.caminho === '/subscriptions')
    expect(sub?.corpo).toMatchObject({ billingType: 'UNDEFINED', cycle: 'MONTHLY', value: 199.9, externalReference: outra.tenantId })
    const { data: s } = await db().from('tenant_subscriptions').select('asaas_subscription_id, cobranca').eq('tenant_id', outra.tenantId)
      .single<{ asaas_subscription_id: string; cobranca: string }>()
    expect(s!.cobranca).toBe('ativa')
    assinaturaId = s!.asaas_subscription_id
    expect(assinaturaId).toMatch(/^sub_falsa_/)
  })

  test('o webhook se defende pelo token', async () => {
    const r = await webhook({ id: `evt_${marca}_x`, event: 'PAYMENT_RECEIVED', payment: {} }, 'token-errado-'.padEnd(40, 'x'))
    expect(r.status).toBe(401)
    expect((await db().from('asaas_events').select('id').eq('id', `evt_${marca}_x`)).data ?? []).toHaveLength(0)
  })

  test('fatura vencida: em atraso, com o aviso e o "Pagar" para quem administra', async ({ browser }) => {
    const pagamento = { id: `pay_${marca}`, subscription: assinaturaId, value: 199.9, dueDate: ontem(), status: 'OVERDUE', invoiceUrl: FATURA }
    const r = await webhook({ id: `evt_${marca}_1`, event: 'PAYMENT_OVERDUE', payment: pagamento })
    expect(r.status).toBe(200)
    await expect.poll(async () => (await situacao()).plan_status, { timeout: 20_000 }).toBe('past_due')
    // O mesmo evento de novo: já recebido, nada se repete.
    const r2 = await webhook({ id: `evt_${marca}_1`, event: 'PAYMENT_OVERDUE', payment: pagamento })
    expect(r2.json).toMatchObject({ repetido: true })

    await comSessao(browser, gestor.estado, async p => {
      await p.goto('/admin/dashboard')
      await expect(p.getByText(/Pagamento em atraso/)).toBeVisible({ timeout: 30_000 })
      await p.goto('/admin/settings?tab=assinatura')
      await expect(p.getByRole('link', { name: 'Pagar' })).toHaveAttribute('href', FATURA)
    })
  })

  test('paga: volta a ficar em dia sozinha', async () => {
    const r = await webhook({ id: `evt_${marca}_2`, event: 'PAYMENT_RECEIVED', payment: {
      id: `pay_${marca}`, subscription: assinaturaId, value: 199.9, dueDate: ontem(), status: 'RECEIVED', paymentDate: ontem(), invoiceUrl: FATURA,
    } })
    expect(r.status).toBe(200)
    await expect.poll(async () => (await situacao()), { timeout: 20_000 }).toEqual({ plan_status: 'active', em_atraso_desde: null })
    const { data: f } = await db().from('subscription_invoices').select('situacao, pago_em').eq('asaas_payment_id', `pay_${marca}`).single()
    expect(f!.situacao).toBe('RECEIVED')
    expect(f!.pago_em).not.toBeNull()
  })

  test('evento atrasado não tira do "em dia" quem já pagou', async () => {
    // O OVERDUE da MESMA cobrança, chegando (ou reprocessado) depois do RECEIVED.
    const r = await webhook({ id: `evt_${marca}_3`, event: 'PAYMENT_OVERDUE', payment: {
      id: `pay_${marca}`, subscription: assinaturaId, value: 199.9, dueDate: ontem(), status: 'OVERDUE', invoiceUrl: FATURA,
    } })
    expect(r.status).toBe(200)
    await expect.poll(async () => (await db().from('asaas_events').select('processado_em').eq('id', `evt_${marca}_3`).single()).data?.processado_em,
      { timeout: 20_000 }).not.toBeNull()
    expect((await situacao()).plan_status).toBe('active')
    const { data: f } = await db().from('subscription_invoices').select('situacao').eq('asaas_payment_id', `pay_${marca}`).single()
    expect(f!.situacao).toBe('RECEIVED')
  })

  test('a cobrança que chega antes do id da assinatura é achada pelo cliente', async () => {
    const { data: s } = await db().from('tenant_subscriptions').select('asaas_customer_id').eq('tenant_id', outra.tenantId)
      .single<{ asaas_customer_id: string }>()
    const r = await webhook({ id: `evt_${marca}_4`, event: 'PAYMENT_CREATED', payment: {
      id: `pay_${marca}_b`, subscription: 'sub_ainda_desconhecida', customer: s!.asaas_customer_id, value: 199.9,
      dueDate: '2099-01-10', status: 'PENDING', invoiceUrl: `${FATURA}-b`,
    } })
    expect(r.status).toBe(200)
    await expect.poll(async () => (await db().from('subscription_invoices').select('tenant_id').eq('asaas_payment_id', `pay_${marca}_b`)).data ?? [],
      { timeout: 20_000 }).toEqual([{ tenant_id: outra.tenantId }])
  })

  test('cancelar encerra a assinatura no Asaas e bloqueia a rede', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      const r = await chamarAcao(p, 'actions/sistema.ts', 'cancelarAssinatura', `${urlDaPlataforma('sistema')}/redes/${outra.tenantId}`, [outra.tenantId, 'Teste de cancelamento'])
      expect(r.texto).toContain('"ok":true')
    })
    expect(asaas.chamadas.some(c => c.metodo === 'DELETE' && c.caminho === `/subscriptions/${assinaturaId}`)).toBe(true)
    expect((await situacao()).plan_status).toBe('canceled')
    await comSessao(browser, gestor.estado, async p => {
      await p.goto('/admin/dashboard')
      await expect(p).toHaveURL(/\/conta-suspensa/, { timeout: 30_000 })
      await expect(p.getByRole('heading', { name: 'Assinatura cancelada' })).toBeVisible()
    })
  })
})
