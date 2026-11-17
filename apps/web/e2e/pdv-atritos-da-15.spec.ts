import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'

/**
 * Os atritos do PDV na 15ª simulação (2026-11-15).
 *
 * - A1/A17 (princípio 3): a comanda do crediário dizia "Paga · Crediário ·
 *   R$ 300,00 recebidos" e não dizia o que falta. A regra "a venda nasce
 *   paga" (PDV8) fica; a linha e a comanda dizem o que está em aberto, com as
 *   parcelas e a primeira.
 * - A2 (princípios 3 e 7): a comanda paga não dizia quem estorna. A frase da
 *   ficha ("é de quem tem o Financeiro em Gerenciar: …") vai também à comanda,
 *   para quem não tem o Financeiro em Gerenciar.
 * - A3: a linha da comanda do atendimento dizia só o procedimento, sem o
 *   produto que ela leva ("Limpeza de pele + 1 produto").
 * - A4: a forma da entrada do crediário dizia "Cartão de crédito" e a lista
 *   ao lado "Crédito" — um nome só.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let balcao: MembroDeTeste | null = null
let financeiro: MembroDeTeste | null = null
let nomeDoFinanceiro = ''
let slug = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const daqui30 = () => new Date(Date.now() + 30 * 86_400_000)

test.beforeAll(async () => {
  rede = await criarOutraRede(`pdva${marca}`)
  expect((await db().from('procedures').update({ price: 200 }).eq('id', rede.procedureId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  balcao = await criarMembro(`pdvab${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  financeiro = await criarMembro(`pdvaf${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Financeiro',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  nomeDoFinanceiro = (await db().from('users').select('name').eq('id', financeiro.userId).single<{ name: string }>()).data!.name
})
test.afterAll(async () => {
  if (!rede) return
  const b = db()
  const { data: vendas } = await b.from('procedure_sales').select('id').eq('tenant_id', rede.tenantId)
  const ids = (vendas ?? []).map(v => v.id as string)
  if (ids.length) {
    await b.from('financial_transactions').update({ procedure_sale_id: null }).in('procedure_sale_id', ids)
    await b.from('commission_lines').update({ procedure_sale_id: null }).in('procedure_sale_id', ids)
    await b.from('procedure_sales').delete().in('id', ids)
  }
  await balcao?.limpar()
  await financeiro?.limpar()
  await rede.limpar()
})

test('A1/A17/A2/A4: a comanda do crediário diz o que está em aberto e quem estorna; a entrada tem os nomes da lista', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Crediario ${marca}`)
  const primeira = daqui30()
  const dia = primeira.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  await como(balcao!, browser, async p => {
    // A4: com entrada, as formas dela dizem "Débito" e "Crédito", como a lista ao lado.
    await p.goto(`/${slug}/pdv?nova=1&cliente=${cliente}`)
    const venda = p.getByRole('region', { name: 'Vender' })
    await venda.getByLabel('Procedimento', { exact: true }).selectOption(rede!.procedureId)
    await venda.getByRole('radiogroup', { name: /Forma de pagamento/ }).getByRole('radio', { name: 'Crediário', exact: true }).click()
    await venda.getByLabel('Entrada', { exact: true }).fill('50')
    const formas = await venda.getByLabel('Forma da entrada').locator('option').allTextContents()
    expect(formas).toContain('Crédito')
    expect(formas).toContain('Débito')
    expect(formas.join('|')).not.toMatch(/Cartão de/)

    // A venda: 3 × R$ 200 no crediário, sem entrada (pela action, como a tela).
    const r = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/${slug}/pdv`, [
      cliente, rede!.procedureId, rede!.branchId, 3, null,
      { forma: 'PARCELADO', entrada: 0, parcelas: 3, primeiroVencimento: primeira.toISOString() }, null, null, null,
    ])
    expect(r.texto, 'a venda no crediário passou').toContain('saleId')

    await p.goto(`/${slug}/pdv?ver=PAGAS`)
    const linha = p.locator('[data-lista-de-comandas] .pdv-linha', { hasText: `Crediario ${marca}` })
    await expect(linha).toContainText(/Crediário · R\$\s600,00 em aberto/)
    await expect(linha, 'o selo não diz "Paga" com dinheiro em aberto').not.toContainText('Paga')
    await expect(linha).toContainText('A receber')

    await linha.click()
    const comanda = p.locator('[data-comanda-aberta]')
    await expect(comanda.locator('[data-comanda-em-aberto]')).toContainText(new RegExp(`R\\$\\s600,00 em aberto \\(3 parcelas, a 1ª em ${dia}\\)`))
    // A2: quem estorna, com o nome — ela (só o PDV) não estorna. Mora na dica (2026-11-16).
    await comanda.getByRole('button', { name: 'Quem estorna esta comanda' }).hover()
    const quem = comanda.locator('[data-quem-estorna]')
    await expect(quem).toContainText('é de quem tem o Financeiro em Gerenciar')
    await expect(quem).toContainText(nomeDoFinanceiro)
  })
  // Quem tem o Financeiro em Gerenciar não lê a quem pedir.
  await como(financeiro!, browser, async p => {
    await p.goto(`/${slug}/pdv?ver=PAGAS`)
    await p.locator('[data-lista-de-comandas] .pdv-linha', { hasText: `Crediario ${marca}` }).click()
    await expect(p.locator('[data-comanda-aberta] [data-comanda-em-aberto]')).toBeVisible()
    // A frase mora na dica: sem ela, não há nem o botão da dica.
    await expect(p.locator('[data-comanda-aberta]').getByRole('button', { name: 'Quem estorna esta comanda' })).toHaveCount(0)
    await expect(p.locator('[data-comanda-aberta] [data-quem-estorna]')).toHaveCount(0)
  })
})

test('A3: a linha da comanda do atendimento diz o produto que ela leva', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Comanda ${marca}`)
  const produto = (await db().from('products')
    .insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} Sérum ${marca}`, unit: 'un', uso: 'REVENDA', sale_price: 120 })
    .select('id').single<{ id: string }>()).data!.id
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 200,
    scheduled_at: haMinutosHoje(5), started_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'iniciar o atendimento').toBeNull()
  const comanda = (await db().from('comandas').select('id').eq('appointment_id', ag!.id).single<{ id: string }>()).data!.id
  expect((await db().from('comanda_itens').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, comanda_id: comanda, product_id: produto, quantidade: 1,
  })).error).toBeNull()
  const nomeDoProcedimento = (await db().from('procedures').select('name').eq('id', rede!.procedureId).single<{ name: string }>()).data!.name

  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    const linha = p.locator('[data-lista-de-comandas] .pdv-linha', { hasText: `Comanda ${marca}` })
    await expect(linha).toContainText(`${nomeDoProcedimento} + 1 produto`)
  })
})
