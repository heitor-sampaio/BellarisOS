import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'

/**
 * O PDV na 17ª simulação (a regra em `docs/regras/vendas-financeiro.md`, PDV):
 *
 * - D1: "Quem vendeu" traz quem tem a unidade entre as OUTRAS (a principal é
 *   outra), e a venda com ela não é recusada como "de outra unidade".
 * - D3: a comanda do atendimento paga em duas formas diz as duas
 *   ("Dinheiro R$ 180,00 + Pix R$ 120,00"), não só a do atendimento.
 * - A1: a comanda paga mostra o desconto e o total pago; a lista "Pagas" diz
 *   o que foi pago.
 * - A2: quem estorna estorna DENTRO da comanda paga, e a comanda reaberta diz
 *   o estorno de antes ("Estornada às 21:20 — R$ 250,00, Pix, com R$ 30,00 de desconto").
 * - A5: a Entrada do crediário ganha a máscara de dinheiro ao sair do campo.
 */

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let balcao: MembroDeTeste | null = null
let deOutraUnidade: MembroDeTeste | null = null
let slug = ''
let unidadeB = ''
let procLimpeza = ''
let serum = ''
let minutos = 5
const nomeSerum = `${PREFIXO} Sérum D ${marca}`

async function como<T>(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um atendimento iniciado hoje: a comanda nasce (PDV3). */
async function atendimentoIniciado(cliente: string, preco = 180) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: procLimpeza, professional_id: rede!.professionalId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: preco,
    scheduled_at: haMinutosHoje(minutos += 2), started_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'iniciar o atendimento').toBeNull()
  const c = (await db().from('comandas').select('id').eq('appointment_id', data!.id).single<{ id: string }>()).data!
  return { agendamento: data!.id, comanda: c.id }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`p17${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const b = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-p17b-${marca}` })
    .select('id').single<{ id: string }>()
  expect(b.error, 'criar a unidade B').toBeNull()
  unidadeB = b.data!.id
  const pr = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Limpeza ${marca}`, category: 'e2e', duration_min: 30, price: 180 })
    .select('id').single<{ id: string }>()
  expect(pr.error).toBeNull()
  procLimpeza = pr.data!.id
  const p = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: nomeSerum, unit: 'un', uso: 'REVENDA', sale_price: 120 })
    .select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  serum = p.data!.id
  expect((await db().rpc('estoque_entrada', {
    p_produto: serum, p_unidade: rede.branchId, p_quantidade: 5, p_custo: 40, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  balcao = await criarMembro(`p17b${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'financial', nivel: 'MANAGE' }],
  })
  // D1: a principal é a B; a unidade do balcão é uma das OUTRAS.
  deOutraUnidade = await criarMembro(`p17o${marca}`, {
    tenant: rede.tenantId, branchId: unidadeB, outrasUnidades: [rede.branchId], rotulo: 'Duas unidades',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  await balcao?.limpar(); await deOutraUnidade?.limpar()
  await rede?.limpar()
})

test('D3: a comanda paga em duas formas diz as duas; reaberta pelo estorno, diz o estorno de antes', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Duas formas')
  const { agendamento, comanda } = await atendimentoIniciado(cliente)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    await chamarAcao(p, 'actions/pdv.ts', 'acrescentarProdutoNaComanda', `/${slug}/pdv`, [comanda, serum, 1, slug])
  })
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    const detalhe = p.locator('[data-comanda-aberta]')
    await detalhe.getByRole('radio', { name: 'Pix' }).click()
    await detalhe.getByRole('button', { name: /Receber R\$\s?300,00/ }).click()
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda}"]`)).toHaveCount(0)
  })
  const doAtendimento = (await db().from('financial_transactions').select('id').eq('appointment_id', agendamento)
    .single<{ id: string }>()).data!
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/financeiro`)
    await chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', `/${slug}/financeiro`, [doAtendimento.id, slug, 'Cobrou na forma errada'])
  })
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    // A2: a reaberta diz o estorno de antes (o valor e a forma do atendimento).
    await expect(p.locator('[data-estorno-anterior]')).toContainText(/Estornada às \d{2}:\d{2} — R\$\s180,00, Pix/)
    const detalhe = p.locator('[data-comanda-aberta]')
    await detalhe.getByRole('radio', { name: 'Dinheiro' }).click()
    await detalhe.getByRole('button', { name: /Receber R\$\s?180,00/ }).click()
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda}"]`)).toHaveCount(0)
  })
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?ver=PAGAS&comanda=${comanda}`)
    // D3: as duas formas, cada uma com o seu valor; 300 recebidos.
    await expect(p.locator('[data-comanda-paga]')).toContainText(/Dinheiro R\$\s180,00 \+ Pix R\$\s120,00/)
    await expect(p.locator('[data-comanda-paga]')).toContainText(/R\$\s300,00\s*recebidos/)
    await expect(p.locator('[data-estorno-anterior]'), 'paga de novo, o estorno de antes sai').toHaveCount(0)
  })
})

test('A1/A2: a comanda paga com desconto mostra o desconto e o total pago, e se estorna ali mesmo', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Com desconto')
  const { agendamento, comanda } = await atendimentoIniciado(cliente, 280)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    const detalhe = p.locator('[data-comanda-aberta]')
    await detalhe.getByLabel('Desconto', { exact: true }).fill('30')
    await detalhe.getByRole('radio', { name: 'Pix' }).click()
    await detalhe.getByRole('button', { name: /Receber R\$\s?250,00/ }).click()
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda}"]`)).toHaveCount(0)
  })
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?ver=PAGAS&comanda=${comanda}`)
    // A1: o desconto na comanda e o que foi pago — na comanda e na lista.
    await expect(p.locator('[data-desconto-da-comanda="desconto"]')).toContainText(/−R\$\s30,00/)
    await expect(p.locator('[data-total-da-comanda]')).toContainText('Total pago')
    await expect(p.locator('[data-total-da-comanda]')).toContainText('250,00')
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda}"] [data-valor-na-lista]`)).toContainText('250,00')

    // A2: o Estornar mora na comanda paga, com a janela e o motivo de sempre.
    const pagamentos = p.locator('[data-pagamentos-da-comanda]')
    await expect(pagamentos).toContainText(/Pix · R\$\s250,00/)
    await pagamentos.locator('[data-estornar]').click()
    const janela = p.getByRole('dialog')
    await janela.getByLabel('Motivo do estorno').fill('Cobrou o desconto errado')
    await janela.getByRole('button', { name: 'Confirmar estorno' }).click()
    // Reaberta: o estorno de antes, com o desconto que tinha.
    await expect(p.locator('[data-estorno-anterior]')).toContainText(/Estornada às \d{2}:\d{2} — R\$\s250,00, Pix, com R\$\s30,00 de desconto/)
    await expect(p.locator('[data-comanda-aberta]').getByRole('button', { name: /Receber R\$\s?280,00/ })).toBeVisible()
  })
  const { data } = await db().from('financial_transactions').select('notes').eq('appointment_id', agendamento).is('estorno_de', null)
  expect((data ?? []).map(t => t.notes)).toEqual(['Estornada'])
})

test('D1: "Quem vendeu" traz quem tem esta unidade entre as outras, e a venda com ela passa', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Vendida por outra')
  const nome = `${PREFIXO} Duas unidades p17o${marca}`
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?nova=1&cliente=${cliente}`)
    const venda = p.getByRole('region', { name: 'Vender' })
    await expect(venda.locator('[data-cliente-da-venda]')).toBeVisible()
    await venda.getByLabel('Procedimento', { exact: true }).selectOption(procLimpeza)
    const quem = venda.getByLabel('Quem vendeu')
    const opcao = quem.locator('option', { hasText: nome })
    await expect(opcao, 'a da outra unidade principal está na lista').toHaveCount(1)
    await quem.selectOption(await opcao.getAttribute('value') ?? '')
    await venda.getByRole('radiogroup', { name: /Forma de pagamento/ }).getByRole('radio', { name: 'Pix', exact: true }).click()
    await venda.getByRole('button', { name: /^Vender por R\$\s180,00$/ }).click()
    const agendarAgora = venda.locator('[data-agendar-agora]')
    await expect(p.getByText('é de outra unidade')).toHaveCount(0)
    await expect.poll(async () => (await agendarAgora.count()) > 0 || /ver=PAGAS/.test(p.url()), { timeout: 20_000 }).toBe(true)
  })
  const { data } = await db().from('financial_transactions').select('id').eq('branch_id', rede!.branchId)
    .eq('client_id', cliente).eq('is_paid', true)
  expect((data ?? []).length, 'a venda foi registrada').toBeGreaterThan(0)
})

test('A5: a Entrada do crediário ganha a máscara de dinheiro ao sair do campo', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Crediario mascara')
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?nova=1&cliente=${cliente}`)
    const venda = p.getByRole('region', { name: 'Vender' })
    await expect(venda.locator('[data-cliente-da-venda]')).toBeVisible()
    await venda.getByLabel('Procedimento', { exact: true }).selectOption(procLimpeza)
    await venda.getByRole('radiogroup', { name: /Forma de pagamento/ }).getByRole('radio', { name: 'Crediário', exact: true }).click()
    const entrada = venda.getByLabel('Entrada', { exact: true })
    await entrada.fill('100')
    await entrada.blur()
    await expect(entrada).toHaveValue('100,00')
    await entrada.fill('50,5')
    await entrada.blur()
    await expect(entrada).toHaveValue('50,50')
  })
})
