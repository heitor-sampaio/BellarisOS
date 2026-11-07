import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os atritos de texto do dinheiro da 9ª simulação (2026-11-07), da F44 —
 * princípio 3, "o que a tela mostra é o que vale na conta":
 * - A31: o Financeiro tinha dois "resultados" (o "Lucro líquido" e o total da
 *   lista) e o Relatório uma terceira base de despesa, sem dizer qual é qual.
 * - A38: a troca de pontos é da Fidelidade em Gerenciar; a recepção (Ver) não
 *   lia a quem pedir, e o app dizia só "A troca é feita na recepção".
 * - A39: o "Preço médio por atend." da ficha não parecia com o que está ao lado.
 * - A40: a devolução de produto dizia "e os pontos dele saem do saldo" numa
 *   venda que não pontuou.
 * - A41: "o dinheiro entrou quando o crédito nasceu" era falso no crédito
 *   CONCEDIDO (que nunca teve dinheiro).
 * - A46: o crédito na clínica só aparecia no Financeiro do app, e o caminho
 *   até lá ficava dentro do detalhe de um plano.
 * Numa rede [e2e] própria, de uma unidade, com a fidelidade ligada.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let nomeDaDona = ''
let rosana: ClienteDeTeste | null = null
let marina = ''
let serum = ''
const nomeSerum = `${PREFIXO} Sérum f9 ${marca}`

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`ff9${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('loyalty_configs').upsert(
    { tenant_id: rede.tenantId, enabled: true, points_per_real: 1, earn_mode: 'POR_REAL', pontua_venda_de_produto: false }, { onConflict: 'tenant_id' })).error).toBeNull()
  expect((await b.from('loyalty_rewards').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Limpeza grátis ${marca}`, type: 'DESCONTO_VALOR', points_cost: 100, discount_value: 50, is_active: true })).error).toBeNull()
  dona = await criarMembro(`ff9d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  nomeDaDona = (await b.from('users').select('name').eq('id', dona.userId).single<{ name: string }>()).data!.name
  recepcao = await criarMembro(`ff9r${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'loyalty', nivel: 'VIEW' }],
  })
  // A Rosana (no app): R$ 181 de crédito CONCEDIDO pela clínica, R$ 100 dele usado.
  rosana = await clienteComSessao(`ff9${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  expect((await b.from('internal_credits').insert({ client_id: rosana.clientId, branch_id: rede.branchId, amount: 281, description: 'Cortesia', concedido: true })).error).toBeNull()
  expect((await b.from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: rosana.clientId, type: 'INCOME', category: 'Procedimento', description: 'Pago com crédito',
    amount: 100, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'INTERNAL_CREDIT', created_by: 'e2e',
  })).error).toBeNull()
  // A Marina: 2 atendimentos de R$ 1.200 concluídos e cobrados, um deles pago.
  marina = await rede.criarCliente('Marina')
  for (const pago of [true, false]) {
    const quando = new Date(Date.now() - (pago ? 2 : 1) * 86_400_000).toISOString()
    const { data: ap, error } = await b.from('appointments').insert({
      branch_id: rede.branchId, client_id: marina, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 1200, scheduled_at: quando, completed_at: quando,
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    if (pago) {
      expect((await b.from('financial_transactions').insert({
        branch_id: rede.branchId, client_id: marina, appointment_id: ap!.id, type: 'INCOME', category: 'Procedimento', description: 'Atendimento',
        amount: 1200, is_paid: true, paid_at: quando, payment_method: 'PIX', created_by: 'e2e',
      })).error).toBeNull()
    }
  }
  // O sérum (a fidelidade não pontua a venda de produto).
  const pr = await b.from('products').insert({ tenant_id: rede.tenantId, name: nomeSerum, unit: 'un', uso: 'REVENDA', sale_price: 169 })
    .select('id').single<{ id: string }>()
  expect(pr.error).toBeNull()
  serum = pr.data!.id
  expect((await b.rpc('estoque_entrada', {
    p_produto: serum, p_unidade: rede.branchId, p_quantidade: 5, p_custo: 70, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await rosana?.limpar(); await dona?.limpar(); await recepcao?.limpar()
  await rede?.limpar()
})

test('A31: o Financeiro diz qual "resultado" é o do período e qual é o caixa da lista; o Relatório diz que a despesa é a paga', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro`)
    await expect(p.locator('[data-total-da-lista]')).toContainText('caixa da lista')
    await expect(p.locator('[data-base-do-resultado]').first()).toContainText('competência')
    await p.goto('/admin/financeiro')
    await expect(p.locator('[data-base-do-resultado]').first()).toContainText('competência')
    await p.goto('/admin/reports?tab=financeiro')
    await expect(p.getByText('Despesas pagas (caixa)')).toBeVisible()
  })
})

test('A38: a recepção (Fidelidade em Ver) lê a quem pedir a troca; o app diz o mesmo', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/admin/clients/${marina}`)
    const nota = p.locator('[data-quem-troca]')
    await expect(nota).toContainText('é de quem tem a Fidelidade em Gerenciar')
    await expect(nota).toContainText(nomeDaDona)
  })
  await como(browser, rosana!, async p => {
    await p.goto(`/${slug}/cliente/fidelidade`)
    await expect(p.locator('[data-quem-troca]')).toContainText(nomeDaDona)
  })
})

test('A39: o "Preço médio por atend." da ficha diz a conta na tela', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/admin/clients/${marina}`)
    await expect(p.locator('[data-preco-medio-explica]')).toContainText(/R\$\s2\.400,00 ÷ 2 atendimentos cobrados/)
  })
})

test('A40: a devolução de uma venda que não pontuou não fala em tirar pontos', async ({ browser }) => {
  await como(browser, dona!, async p => {
    const rota = `/admin/clients/${marina}`
    await p.goto(rota)
    const r = await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', rota,
      [marina, [{ produtoId: serum, quantidade: 2 }], rede!.branchId, null, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { vendedorId: dona!.userId }])
    expect(r.texto, 'vender').toContain('"vendaId"')
    await p.goto(`/${slug}/financeiro`)
    await p.locator('tr', { hasText: `2× ${nomeSerum}` }).first().getByTitle('Estornar').click()
    await p.getByRole('dialog', { name: 'Estornar esta venda de produto?' }).getByRole('button', { name: 'Devolver só parte da venda' }).click()
    const parte = p.getByRole('dialog', { name: 'Devolver parte da venda' })
    await parte.getByLabel(`Quantas de ${nomeSerum} voltam`).selectOption('1')
    await expect(parte.locator('[data-a-devolver]')).toContainText('R$ 169,00')
    const estorno = parte.getByRole('radio', { name: /^Estorno/ }).first()
    await expect(estorno).toBeVisible()
    await expect(parte.locator('[data-devolver-parte]')).not.toContainText('os pontos dele saem')
  })
})

test('A41: o crédito CONCEDIDO não diz que o dinheiro entrou quando ele nasceu', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/admin/clients/${rosana!.clientId}`)
    const nota = p.locator('[data-pago-com-credito]').first()
    await expect(nota).toContainText('pagos com crédito na clínica')
    await expect(nota).not.toContainText('o dinheiro entrou quando o crédito nasceu')
    await expect(nota).toContainText('concedido pela clínica')
  })
})

test('A46: o crédito na clínica aparece no Início do app, com o caminho para o Financeiro', async ({ browser }) => {
  await como(browser, rosana!, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const cartao = p.locator('[data-credito-na-clinica-no-inicio]')
    await expect(cartao).toContainText(/R\$\s181,00/)
    await cartao.click()
    await expect(p).toHaveURL(new RegExp(`/${slug}/cliente/financeiro`))
  })
})
