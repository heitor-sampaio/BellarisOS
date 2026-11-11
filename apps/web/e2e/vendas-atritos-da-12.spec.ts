import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os atritos do comercial da 12ª simulação (2026-11-10/11, a Rita e a Paula da
 * Margarida), numa rede [e2e] própria:
 *
 * - A18: o Vender não dizia quanto a vendedora ganha nem de onde vem o
 *   percentual ("5% do pacote", "8% da Rita") — só o extrato. Princípio 3.
 *   Quem vê a comissão de OUTRA pessoa é quem vê o financeiro de todos
 *   (comissoes.md): a Rita vê a dela, não a da Paula.
 * - A19: a vendedora com "só as próprias comissões" via a taxa e o líquido da
 *   maquininha da clínica no Vender.
 * - A21: "Indicada por" pareceu limpar o formulário (não se reproduziu); o Enter
 *   na busca dela enviava o cadastro inteiro.
 * - A22: a sessão do pacote só mostrava os horários depois da profissional e da
 *   data, sem dizer que eles vêm depois.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let rita: MembroDeTeste
let paula: MembroDeTeste
let slug = ''
let cliente = ''
let nomeDaRita = ''
let pacoteSemRegra = ''
let pacoteComRegra = ''
let produto = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function pacote(nome: string, regra: { tipo: string; valor: number } | null) {
  const { data, error } = await db().from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, name: `${PREFIXO} ${nome} ${marca}`, total_sessions: 2, price: 1000,
    comissao_venda_tipo: regra?.tipo ?? null, comissao_venda_valor: regra?.valor ?? null,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('service_package_items').insert({ tenant_id: rede.tenantId, package_id: data!.id, procedure_id: rede.procedureId, quantity: 2 })).error).toBeNull()
  return data!.id
}

async function abrirVender(p: Page) {
  await p.goto(`/${slug}/clients/${cliente}`)
  await p.getByRole('button', { name: 'Vender', exact: true }).click()
  return p.getByRole('dialog', { name: 'Vender' })
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ven12${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('procedures').update({ price: 300 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await b.from('users').update({ atende_em: [rede.branchId], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await b.from('payment_fees').insert({ tenant_id: rede.tenantId, metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 2.97 })).error).toBeNull()
  dona = await criarMembro(`ven12d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  // A Rita da simulação: vende e recebe, e vê só as próprias comissões.
  rita = await criarMembro(`ven12r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Rita',
    permissoes: [
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' },
    ],
  })
  paula = await criarMembro(`ven12p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Paula',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  expect((await b.from('users').update({ comissao_venda_pct: 8 }).eq('id', rita.userId)).error).toBeNull()
  expect((await b.from('users').update({ comissao_venda_pct: 3 }).eq('id', paula.userId)).error).toBeNull()
  nomeDaRita = (await b.from('users').select('name').eq('id', rita.userId).single<{ name: string }>()).data!.name
  cliente = await rede.criarCliente('Bruna')
  pacoteSemRegra = await pacote('Pacote sem regra', null)
  pacoteComRegra = await pacote('Pacote com regra', { tipo: 'PERCENTAGE', valor: 5 })
  produto = await rede.criarProduto('Serum', 10)
  expect((await b.from('products').update({ uso: 'REVENDA', sale_price: 100 }).eq('id', produto)).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await rita?.limpar(); await paula?.limpar()
  await rede?.limpar()
})

test('A18: o Vender diz a comissão de venda de quem vendeu e de onde vem o percentual', async ({ browser }) => {
  await como(browser, rita, async p => {
    const dlg = await abrirVender(p)
    await dlg.getByRole('button', { name: 'Pacote', exact: true }).click()
    await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacoteSemRegra)
    const quem = dlg.getByLabel('Quem vendeu')
    await quem.selectOption(rita.userId)
    const linha = dlg.locator('[data-comissao-da-venda]')
    await expect(linha, 'sem regra no pacote, a da pessoa').toContainText('8%')
    await expect(linha).toContainText(`da ${nomeDaRita}`)
    await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacoteComRegra)
    await expect(linha, 'a regra do pacote vence').toContainText('5%')
    await expect(linha).toContainText('do pacote')
    // A comissão da Paula não é da conta da Rita (só as próprias comissões).
    await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacoteSemRegra)
    await quem.selectOption(paula.userId)
    await expect(linha).toHaveCount(0)

    await dlg.getByRole('button', { name: 'Procedimento', exact: true }).click()
    await dlg.getByLabel('Procedimento', { exact: true }).selectOption(rede.procedureId)
    await dlg.getByLabel('Quem vendeu').selectOption(rita.userId)
    await expect(dlg.locator('[data-comissao-da-venda]'), 'o pré-pago: a da pessoa').toContainText('8%')
  })
  await como(browser, dona, async p => {
    const dlg = await abrirVender(p)
    await dlg.getByRole('button', { name: 'Pacote', exact: true }).click()
    await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacoteSemRegra)
    await dlg.getByLabel('Quem vendeu').selectOption(paula.userId)
    await expect(dlg.locator('[data-comissao-da-venda]'), 'quem vê o financeiro de todos vê a da Paula').toContainText('3%')
  })
})

test('A19: a taxa e o líquido da maquininha no Vender são de quem vê o financeiro da clínica', async ({ browser }) => {
  const noCartaoEm3x = async (p: Page) => {
    const dlg = await abrirVender(p)
    await dlg.getByRole('button', { name: 'Produto', exact: true }).click()
    await dlg.getByLabel('Produto', { exact: true }).selectOption(produto)
    await dlg.getByLabel('Quantidade').fill('1')
    await dlg.getByLabel('Meio de pagamento').selectOption('CREDIT_CARD')
    await dlg.getByLabel('Vezes no cartão').selectOption('3')
    return dlg
  }
  await como(browser, dona, async p => {
    const dlg = await noCartaoEm3x(p)
    await expect(dlg.locator('[data-liquido-do-cartao]'), 'controle: a dona vê').toContainText('2,97%')
  })
  await como(browser, rita, async p => {
    const dlg = await noCartaoEm3x(p)
    await expect(dlg.getByLabel('Vezes no cartão')).toHaveValue('3')
    await p.waitForTimeout(1_500)
    await expect(dlg.locator('[data-liquido-do-cartao]')).toHaveCount(0)
  })
})

test('A21: o Enter na busca do "Indicada por" não envia o cadastro', async ({ browser }) => {
  const nome = `${PREFIXO} Joana ${marca}`
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/clients/new`)
    await p.locator('input[name="name"]').fill(nome)
    const campo = p.getByLabel('Indicada por', { exact: true })
    await campo.fill('Bru')
    await campo.press('Enter')
    await p.waitForTimeout(1_500)
    await expect(p).toHaveURL(/\/clients\/new/)
    await expect(p.locator('input[name="name"]')).toHaveValue(nome)
  })
  const { data } = await db().from('clients').select('id').eq('tenant_id', rede.tenantId).eq('name', nome)
  expect(data ?? [], 'nada foi cadastrado').toEqual([])
})

test('A22: a sessão do pacote diz que os horários aparecem depois da profissional e da data', async ({ browser }) => {
  await como(browser, dona, async p => {
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', `/${slug}/clients/${cliente}`,
      [cliente, pacoteSemRegra, rede.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { vendedorId: dona.userId }])
    expect(r.texto).toContain('clientPackageId')
    await p.goto(`/${slug}/clients/${cliente}`)
    await p.getByText('TRATAMENTO EM ANDAMENTO').first().click()
    await p.getByRole('button', { name: /Gerenciar/ }).first().click()
    await p.getByRole('button', { name: 'Agendar', exact: true }).first().click()
    const agendar = p.locator('[data-agendar-sessao]')
    await expect(agendar.locator('[data-dica-dos-horarios]')).toContainText('Escolha a profissional e a data')
    await agendar.getByLabel('Profissional').selectOption({ index: 1 })
    await expect(agendar.locator('[data-dica-dos-horarios]')).toContainText('data')
  })
})
