import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * F72 — a unidade DESATIVADA (D1, D2 e A32 da 14ª simulação; H6 em
 * `plataforma.md`, C45 em `indicadores.md`).
 *
 * Fechada a Pampulha, cada tela decidia sozinha: o dashboard a contava, os
 * Relatórios não (R$ 1.846 × R$ 2.476, e o cabeçalho com o nome da outra
 * unidade), o estoque tirava R$ 894,80 do total, e o "Ver os agendamentos" da
 * janela abria a agenda da rede inteira — a Pampulha não estava mais no
 * `?unidade=`. A regra é uma: o que tem movimento, saldo ou pendência na
 * desativada continua CONTADO e ALCANÇÁVEL, com o selo; só o que é NOVO
 * (agendar, dar entrada, transferir para) fica nas ativas. A janela de
 * desativar diz tudo o que fica e leva a cada lugar.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slugA = ''
let pampulha = ''
let produto = ''
let agendamento = ''
const NOME = `${PREFIXO} Pampulha ${marca}`
const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 2 * 86_400_000))

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const desativar = async () => {
  expect((await db().from('branches').update({ is_active: false }).eq('id', pampulha)).error).toBeNull()
}


test.beforeAll(async () => {
  const b = db()
  rede = await criarOutraRede(`f72${marca}`)
  slugA = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: u, error } = await b.from('branches')
    .insert({ tenant_id: rede.tenantId, name: NOME, slug: `e2e-f72-pa-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  pampulha = u!.id
  dona = await criarMembro(`f72d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)
  // A profissional atende nas duas: a única recusa que sobra é a da unidade fechada.
  expect((await b.from('users').update({ atende_em: [rede.branchId, pampulha] }).eq('id', rede.professionalId)).error).toBeNull()

  cliente = await clienteComSessao(`f72c${marca}`, { id: rede.branchId, slug: slugA }, { tenant: rede.tenantId })
  const { data: ag, error: eAg } = await b.from('appointments').insert({
    branch_id: pampulha, client_id: cliente.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(`${dia}T10:00:00-03:00`).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  agendamento = ag!.id

  // R$ 200 de estoque em cada unidade (4 un × R$ 50).
  produto = await rede.criarProduto('Ácido f72', 4)
  expect((await b.from('products').update({ cost_price: 50 }).eq('id', produto)).error).toBeNull()
  expect((await b.from('branch_product_stock').insert({ product_id: produto, branch_id: pampulha, current_stock: 4, min_stock: 0 })).error).toBeNull()
  // R$ 330 a receber na Pampulha.
  const vence = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  expect((await b.from('financial_transactions').insert({
    branch_id: pampulha, type: 'INCOME', category: 'Atendimento', description: `[e2e] parcela f72 ${marca}`,
    amount: 330, payment_method: 'PIX', is_paid: false, due_date: vence, created_by: 'e2e',
  })).error).toBeNull()
})

test.afterAll(async () => { await cliente?.limpar(); await dona?.limpar(); await rede?.limpar() })

test('D2/A32: a janela de desativar diz a agenda, o estoque e o a receber, e leva a cada um', async ({ browser }) => {
  test.setTimeout(120_000)
  await como(browser, dona!.estado, async p => {
    await p.goto('/admin/settings?tab=unidades')
    const cartao = p.locator(`[data-unidade-card="${pampulha}"]`)
    await cartao.getByRole('button', { name: 'Desativar' }).click()
    const janela = p.locator('[data-desativar-unidade]')
    await expect(janela).toContainText('1 agendamento marcado', { timeout: 20_000 })
    await expect(janela).toContainText(/R\$\s*200,00 em estoque \(1 item\)/)
    await expect(janela).toContainText(/R\$\s*330,00 a receber/)
    await expect(janela.locator(`a[href="/admin/agenda?unidade=${pampulha}&date=${dia}"]`)).toBeVisible()
    await expect(janela.locator(`a[href="/admin/estoque?unidade=${pampulha}"]`)).toBeVisible()
    await expect(janela.locator(`a[href="/admin/financeiro?unidade=${pampulha}&aberto=todos"]`)).toBeVisible()

    await janela.getByRole('button', { name: 'Desativar mesmo assim' }).click()
    await expect(janela).toHaveCount(0, { timeout: 20_000 })
    // Depois do clique, o cartão da desativada continua dizendo o que ficou, com os mesmos caminhos.
    const ficou = cartao.locator('[data-o-que-ficou]')
    await expect(ficou).toContainText('1 agendamento marcado', { timeout: 20_000 })
    await ficou.locator(`a[href="/admin/agenda?unidade=${pampulha}&date=${dia}"]`).click()
    await expect(p).toHaveURL(new RegExp(`unidade=${pampulha}`))
    await expect(p.locator(`[data-agendamento="${agendamento}"]`).first(), 'o agendamento da Pampulha na agenda dela').toBeAttached({ timeout: 20_000 })
    await expect(p.locator('[data-selo-unidade-desativada]')).toBeVisible()
  })
  const { data } = await db().from('branches').select('is_active').eq('id', pampulha).single<{ is_active: boolean }>()
  expect(data!.is_active).toBe(false)
})

test('D1: as telas de leitura contam a desativada e a alcançam pelo ?unidade=, com o selo', async ({ browser }) => {
  test.setTimeout(150_000)
  await desativar()
  await como(browser, dona!.estado, async p => {
    // Relatórios: duas unidades nos números — o cabeçalho diz "Rede", não o nome da outra.
    await p.goto('/admin/reports?period=month')
    await expect(p.locator('[data-escopo-dos-relatorios]')).toContainText('Rede', { timeout: 20_000 })
    await p.goto(`/admin/reports?period=month&unidade=${pampulha}`)
    await expect(p.locator('[data-escopo-dos-relatorios]')).toContainText('unidade desativada', { ignoreCase: true, timeout: 20_000 })

    // Estoque: o total soma os R$ 200 da Pampulha (H6 + princípio 3).
    await p.goto('/admin/estoque')
    await expect(p.locator('[data-kpis-do-estoque]')).toContainText(/R\$\s*400,00/, { timeout: 20_000 })
    await p.goto(`/admin/estoque?unidade=${pampulha}`)
    await expect(p.locator('[data-kpis-do-estoque]')).toContainText(/R\$\s*200,00/, { timeout: 20_000 })
    await expect(p.locator('[data-selo-unidade-desativada]').first()).toBeVisible()

    // Financeiro: a lista do a receber da Pampulha abre nela.
    await p.goto(`/admin/financeiro?unidade=${pampulha}&aberto=todos`)
    await expect(p.getByText(`[e2e] parcela f72 ${marca}`)).toBeVisible({ timeout: 20_000 })

    // Comissões e fechamento: a Pampulha está no filtro.
    await p.goto(`/admin/financeiro/comissoes?unidade=${pampulha}`)
    await expect(p.locator('[data-selo-unidade-desativada]').first()).toBeVisible({ timeout: 20_000 })
    await p.goto(`/admin/fechamento?unidade=${pampulha}`)
    await expect(p.locator('[data-selo-unidade-desativada]').first()).toBeVisible({ timeout: 20_000 })

    // Dashboard: o recorte da desativada não cai na rede.
    await p.goto(`/admin/dashboard?unidade=${pampulha}`)
    await expect(p.locator('[data-selo-unidade-desativada]').first()).toBeVisible({ timeout: 20_000 })
  })
})

test('nada NOVO na desativada: entrada, transferência para ela e agendamento são recusados', async ({ browser }) => {
  await desativar()
  const saldo = async () => Number((await db().from('branch_product_stock').select('current_stock')
    .eq('product_id', produto).eq('branch_id', pampulha).single<{ current_stock: number }>()).data!.current_stock)
  await como(browser, dona!.estado, async p => {
    const entrada = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'adminAddStock', '/admin/estoque', [undefined],
      { productId: produto, branchId: pampulha, quantity: '2', _envio: `f72-e-${marca}` })
    expect(entrada.texto).toContain('desativada')
    const transf = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'adminTransferStock', '/admin/estoque', [undefined],
      { productId: produto, fromBranchId: rede!.branchId, toBranchId: pampulha, quantity: '1', _envio: `f72-t-${marca}` })
    expect(transf.texto).toContain('desativada')
    const ag = await chamarAcao(p, 'actions/crm-scheduling.ts', 'createCrmAppointment', '/admin/inbox', [{
      leadId: '', branchId: pampulha, professionalId: rede!.professionalId, procedureId: rede!.procedureId,
      scheduledAt: new Date(`${dia}T14:00:00-03:00`).toISOString(), roomId: null,
      contato: { nome: `${PREFIXO} Nova f72 ${marca}`, telefone: '5548933372072' },
    }])
    expect(ag.texto).toContain('desativada')
  })
  expect(await saldo(), 'o saldo da Pampulha não mudou').toBe(4)
  const { count } = await db().from('appointments').select('id', { count: 'exact', head: true }).eq('branch_id', pampulha)
  expect(count, 'só o agendamento que já estava').toBe(1)
})

test('o app da cliente diz no cartão que a unidade do agendamento foi desativada', async ({ browser }) => {
  await desativar()
  await como(browser, cliente!.estado, async p => {
    await p.goto(`/${slugA}/cliente/agendamentos`)
    await expect(p.locator('[data-unidade-desativada]').first()).toContainText('foi desativada', { timeout: 20_000 })
  })
})
