import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { addDaysTZ, dayKeyTZ } from '../lib/datetime'

/**
 * Os atritos do Financeiro e do Fechamento da 8ª simulação (2026-11-06), da F38:
 * - A38: as parcelas do crediário de outros meses não apareciam em
 *   Lançamentos, só no "Em aberto" do cartão, e não se via onde dar baixa.
 * - A42: o Fechamento não mostrava o estorno do dia (a venda e o estorno se
 *   anulavam: "Saídas R$ 0").
 * - A44: não havia CSV das movimentações para a contadora.
 * - A45: o Fechamento da rede abria na primeira unidade em ordem alfabética
 *   (sem movimento), uma por vez, sem o total da clínica.
 * - A48: no Fechamento de um dia passado, o "a receber" não dizia que é o de
 *   hoje, de qualquer dia (a regra D5 de 27/10).
 *
 * Numa rede [e2e] própria, de duas unidades: o movimento é só na que vem
 * DEPOIS em ordem alfabética.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let slug = ''
let unidadeNome = ''
let cliente = ''
const BATEL = `${PREFIXO} Batel ${marca}`
const ontem = dayKeyTZ(addDaysTZ(new Date(), -1))

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, acceptDownloads: true })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function lancar(l: Record<string, unknown>) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: cliente, type: 'INCOME', category: 'Procedimento', created_by: 'e2e', ...l,
  }).select('id').single<{ id: string }>()
  expect(error, 'lançar').toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`fa8${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const u = await b.from('branches').select('slug, name').eq('id', rede.branchId).single<{ slug: string; name: string }>()
  slug = u.data!.slug
  unidadeNome = u.data!.name
  // "[e2e] Batel …" vem antes de "[e2e] Unidade …": a primeira, sem movimento.
  expect((await b.from('branches').insert({ tenant_id: rede.tenantId, name: BATEL, slug: `e2e-batel-fa8${marca}` })).error).toBeNull()
  cliente = await rede.criarCliente('Karina')
  dona = await criarMembro(`fa8d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })

  const agora = new Date().toISOString()
  await lancar({ description: `${PREFIXO} Hidratante ${marca}`, amount: 89, is_paid: true, paid_at: agora, payment_method: 'PIX' })
  // A42: uma venda de hoje estornada hoje.
  const vendida = await lancar({ description: `${PREFIXO} Sérum devolvido ${marca}`, amount: 397, is_paid: true, paid_at: agora, payment_method: 'CASH' })
  expect((await b.rpc('estornar_transacao', { p_transacao: vendida, p_tenant: rede.tenantId, p_ator: 'e2e', p_motivo: 'A cliente devolveu lacrado' })).error).toBeNull()
  // A38: a 2ª parcela do crediário vence daqui a 40 dias (fora do mês).
  await lancar({
    description: `${PREFIXO} Plano de tratamento — parcela 2/2 ${marca}`, amount: 750, is_paid: false,
    due_date: new Date(Date.now() + 40 * 86_400_000).toISOString(), parcela_numero: 2, parcela_total: 2,
  })
  // A48: um atendimento concluído ontem, a receber.
  expect((await b.from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(`${ontem}T10:00:00-03:00`).toISOString(), completed_at: new Date(`${ontem}T11:00:00-03:00`).toISOString(),
    duration_min: 60, price: 160, status: 'COMPLETED', source: 'INTERNAL',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A45: o Fechamento da rede abre na unidade com movimento e mostra a clínica toda', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/fechamento')
    const daRede = p.locator('[data-fechamento-da-rede]')
    await expect(daRede).toContainText(BATEL)
    await expect(daRede).toContainText(unidadeNome)
    await expect(daRede).toContainText('Total da clínica')
    await expect(daRede.locator('[aria-current="true"]'), 'abre na unidade que teve movimento').toContainText(unidadeNome)
  })
})

test('A42: o Fechamento mostra o estorno do dia', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/fechamento`)
    const estornos = p.locator('[data-estornos-do-dia]')
    await expect(estornos).toContainText('R$ 397,00')
    await expect(estornos).toContainText('A cliente devolveu lacrado')
    await expect(estornos).toContainText('Dinheiro')
  })
})

test('A48: no Fechamento de um dia passado, o "a receber" diz que é o de hoje, de qualquer dia', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/fechamento?dia=${ontem}`)
    await expect(p.locator('[data-a-receber-de-qualquer-dia]')).toContainText('de qualquer dia')
  })
})

test('A38: o "Em aberto" leva às parcelas, com a baixa na linha', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro`)
    await expect(p.getByText(`parcela 2/2 ${marca}`)).toHaveCount(0)
    await p.locator('[data-em-aberto]').getByRole('link', { name: 'Ver e dar baixa' }).first().click()
    await expect(p.locator('[data-so-o-em-aberto]')).toBeVisible()
    const linha = p.locator('tr', { hasText: `parcela 2/2 ${marca}` })
    await expect(linha).toBeVisible()
    await expect(linha.getByRole('button', { name: /Pagar|Receber/ }).first()).toBeVisible()
  })
})

test('A44: o Financeiro exporta as movimentações em CSV', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro`)
    const [arquivo] = await Promise.all([
      p.waitForEvent('download'),
      p.getByRole('button', { name: 'Exportar CSV' }).first().click(),
    ])
    expect(arquivo.suggestedFilename()).toMatch(/^lancamentos-.*\.csv$/)
    const fs = await import('node:fs/promises')
    const texto = await fs.readFile((await arquivo.path())!, 'utf8')
    // A44 da 12ª: a Unidade, a Profissional e a Bandeira entraram no cabeçalho.
    expect(texto).toContain('Data;Descrição;Cliente;Unidade;Profissional;Categoria;Tipo;Forma;Bandeira;Situação;Valor')
    expect(texto).toContain(`Hidratante ${marca}`)
    expect(texto).toContain('89,00')
  })
})
