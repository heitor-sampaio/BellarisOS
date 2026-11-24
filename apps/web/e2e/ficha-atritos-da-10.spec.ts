import { test, expect, devices, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A ficha da cliente na 10ª simulação (2026-11-10), da F49:
 * - D6: a ficha dizia "Cliente desde nov 2026" (o cadastro) para a Ana Clara,
 *   que a planilha importada diz cliente desde 2021 (`clients.cliente_desde`).
 * - D7: a tabela de Transações rolava de lado no celular (695 px num espaço de
 *   378), escondendo o valor, a forma e o "Vencida em"; e as linhas vinham fora
 *   de ordem (3/3, 1/3, 2/3, entrada).
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let ana = ''
const DIA = 86_400_000
const meioDia = (deslocamentoEmDias: number) => {
  const dia = new Date(Date.now() + deslocamentoEmDias * DIA).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return new Date(`${dia}T12:00:00-03:00`).toISOString()
}
const ids: Record<string, string> = {}

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
  rede = await criarOutraRede(`fi10${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`fi10d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  ana = await rede.criarCliente('Ana Clara')
  expect((await b.from('clients').update({ cliente_desde: '2021-03-12' }).eq('id', ana)).error).toBeNull()
  // O plano em 3 parcelas e a entrada paga, gravados no mesmo instante (como o
  // checkout grava) e em ordem embaralhada.
  const criado = new Date().toISOString()
  const base = {
    branch_id: rede.branchId, client_id: ana, type: 'INCOME', category: 'Plano de tratamento',
    amount: 100, created_by: 'e2e', created_at: criado,
  }
  const parcela = (n: number) => ({ ...base, description: `Plano de tratamento — parcela ${n}/3`, is_paid: false, due_date: meioDia(30 * n), parcela_numero: n, parcela_total: 3 })
  const { data, error } = await b.from('financial_transactions').insert([
    parcela(3), parcela(1),
    { ...base, description: 'Plano de tratamento — entrada', is_paid: true, paid_at: criado, payment_method: 'PIX' },
    parcela(2),
  ]).select('id, description')
  expect(error).toBeNull()
  for (const t of data as { id: string; description: string }[]) ids[t.description.split('— ')[1]!] = t.id
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('D6: a ficha diz "Cliente desde" da planilha importada', async ({ browser }) => {
  await noCelular(browser, dona!, async p => {
    await p.goto(`/${slug}/clients/${ana}`)
    await expect(p.getByText(/Cliente desde/).first()).toContainText('Cliente desde mar 2021')
  })
})

test('D7: no celular, as Transações viram cartões com valor, forma e situação à vista, em ordem de data', async ({ browser }) => {
  await noCelular(browser, dona!, async p => {
    await p.goto(`/${slug}/clients/${ana}?aba=financeiro`)
    const linhas = p.locator('[data-transacao-da-ficha]')
    await expect(linhas).toHaveCount(4)
    // O em aberto vem primeiro, pelo vencimento (1/3, 2/3, 3/3); depois o pago,
    // pela data que a linha mostra (a entrada, hoje).
    expect(await linhas.evaluateAll(ls => ls.map(l => l.getAttribute('data-lancamento'))))
      .toEqual([ids['parcela 1/3'], ids['parcela 2/3'], ids['parcela 3/3'], ids['entrada']])
    // Nada rola de lado: a tabela cabe na largura, e o valor e a forma de cada linha estão na tela.
    const tabela = p.locator('table:has([data-transacao-da-ficha])')
    const larguras = await tabela.evaluate(t => ({ tabela: t.scrollWidth, pai: t.parentElement!.clientWidth }))
    expect(larguras.tabela, 'a tabela cabe no cartão').toBeLessThanOrEqual(larguras.pai)
    const entrada = p.locator(`[data-lancamento="${ids['entrada']}"]`)
    await entrada.scrollIntoViewIfNeeded()
    await expect(entrada.getByText('R$ 100,00')).toBeInViewport({ ratio: 1 })
    await expect(entrada.locator('[data-forma-do-lancamento]')).toBeInViewport({ ratio: 1 })
    await expect(entrada.getByText('Pago', { exact: true })).toBeInViewport({ ratio: 1 })
  })
})

/**
 * As parcelas na ficha (vendas-financeiro.md, a aba Financeiro da ficha; o
 * Heitor, 18/11: "ok"): o que está em aberto vem primeiro, em ordem de
 * vencimento — a vencida, ou a mais próxima, primeiro —, e a vencida não paga
 * fica em destaque (o fundo de alerta) com "Vencida há N dias". O pago vem
 * depois, do mais novo ao mais antigo (D7). Uma cliente só deste caso, na
 * mesma rede.
 */
test.describe('as parcelas da ficha em ordem de vencimento', () => {
  let membro: MembroDeTeste | null = null
  let cliente = ''
  const parcelas: Record<string, string> = {}

  async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
    const ctx = await browser.newContext({ storageState: m.estado })
    try { await fn(await ctx.newPage()) } finally { await ctx.close() }
  }

  test.beforeAll(async () => {
    membro = await criarMembro(`fpvm${marca}`, {
      tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Financeiro',
      permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
    })
    cliente = await rede!.criarCliente(`Parcelas ${marca}`)
    const base = { branch_id: rede!.branchId, client_id: cliente, type: 'INCOME', category: 'Pacote', amount: 300, created_by: 'e2e', parcela_total: 3 }
    // Gravadas fora de ordem: a 3ª, a paga, a 1ª (vencida há 4 dias), a 2ª.
    const { data, error } = await db().from('financial_transactions').insert([
      { ...base, description: 'Pacote — parcela 3/3', is_paid: false, due_date: meioDia(56), parcela_numero: 3 },
      { ...base, description: 'Pacote — entrada', is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX', parcela_numero: null, parcela_total: null },
      { ...base, description: 'Pacote — parcela 1/3', is_paid: false, due_date: meioDia(-4), parcela_numero: 1 },
      { ...base, description: 'Pacote — parcela 2/3', is_paid: false, due_date: meioDia(26), parcela_numero: 2 },
    ]).select('id, description')
    expect(error).toBeNull()
    for (const l of data ?? []) parcelas[(l.description as string).replace('Pacote — ', '')] = l.id as string
  })
  test.afterAll(async () => { await membro?.limpar() })

  test('o em aberto pelo vencimento, a vencida primeiro e em destaque, "Vencida há 4 dias"', async ({ browser }) => {
    await como(membro!, browser, async p => {
      await p.goto(`/${slug}/clients/${cliente}?aba=financeiro`)
      const linhas = p.locator('[data-transacao-da-ficha]')
      await expect(linhas).toHaveCount(4)
      expect(await linhas.evaluateAll(ls => ls.map(l => l.getAttribute('data-lancamento'))))
        .toEqual([parcelas['parcela 1/3'], parcelas['parcela 2/3'], parcelas['parcela 3/3'], parcelas['entrada']])
      const vencida = p.locator(`[data-lancamento="${parcelas['parcela 1/3']}"]`)
      await expect(vencida).toHaveAttribute('data-vencida-da-ficha', '')
      await expect(vencida.locator('[data-vencida]')).toHaveText(/Vencida há 4 dias/)
      // A que ainda vai vencer não fica em destaque.
      await expect(p.locator(`[data-lancamento="${parcelas['parcela 2/3']}"]`)).not.toHaveAttribute('data-vencida-da-ficha', '')
      await expect(p.locator(`[data-lancamento="${parcelas['parcela 2/3']}"]`)).toContainText('Pendente')
    })
  })
})
