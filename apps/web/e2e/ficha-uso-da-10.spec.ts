import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos da ficha, do plano e do dashboard da 10ª simulação (2026-11-10), da F51:
 * - A26: "Cancelar pacote" com os pontos já trocados não avisava que o saldo ia ficar negativo.
 * - A27: "Cancelar plano" só na ficha — a página do plano não tinha o botão nem o "a quem pedir".
 * - A29: logo depois da venda do vale, o "Investido total — LTV" subia sem nota.
 * - A34: "CPF já vinculado a este cliente." em verde, debaixo do campo, parecia erro.
 * - A35: "Ver 5 clientes inativos" parecia o total, e o quadro não dizia que quem tem horário sai da conta.
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let camila = ''
let elisa = ''
let planId = ''
const CPF = '52998224725'

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`fu10${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`fu10d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  recepcao = await criarMembro(`fu10r${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: [
    { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
  ] })
  expect((await b.from('procedures').update({ name: `${PREFIXO} Limpeza ${marca}`, price: 150 }).eq('id', rede.procedureId)).error).toBeNull()
  // A fidelidade ligada, 1 ponto por real.
  expect((await b.from('loyalty_configs').upsert({ tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 }, { onConflict: 'tenant_id' })).error).toBeNull()

  // A26: a Camila comprou o pacote de 5 limpezas por R$ 750 no Pix (750 pontos) e trocou 530 numa recompensa.
  camila = await rede.criarCliente('Camila')
  const { data: pac, error: ePac } = await b.rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} 5 limpezas ${marca}`, p_preco: 750, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 5 }],
    p_comissao: { venda: null, execucao: { tipo: 'NENHUMA', valor: null } },
  })
  expect(ePac, 'criar o pacote').toBeNull()
  const { error: eVen } = await b.rpc('pacote_vender', {
    p_tenant: rede.tenantId, p_cliente: camila, p_pacote: pac as string, p_unidade: rede.branchId, p_ator: dona.userId,
    p_lancamentos: [{ amount: 750, payment_method: 'PIX', is_paid: true }], p_sessoes: Array.from({ length: 5 }, () => ({ procedure_id: rede!.procedureId, preco: 150 })),
  })
  expect(eVen, 'vender o pacote').toBeNull()
  const conta = (await b.from('loyalty_accounts').select('id').eq('client_id', camila).single<{ id: string }>()).data!
  expect((await b.from('loyalty_transactions').insert({ loyalty_account_id: conta.id, points: -530, kind: 'AJUSTE', description: 'Troca por recompensa', branch_id: rede.branchId, created_by: 'e2e' })).error).toBeNull()

  // A29: a Elisa comprou R$ 200 de crédito na clínica (o "vale"), e ainda não usou.
  elisa = await rede.criarCliente('Elisa')
  expect((await b.from('clients').update({ document: CPF }).eq('id', elisa)).error).toBeNull()
  const { error: eCred } = await b.rpc('credito_vender', {
    p_tenant: rede.tenantId, p_cliente: elisa, p_unidade: rede.branchId, p_valor: 200, p_metodo: 'PIX', p_vezes: 1, p_bandeira: null, p_ator: dona.userId, p_ator_nome: 'Dona',
  })
  expect(eCred, 'vender o crédito na clínica').toBeNull()

  // A27: um plano fechado (aceito).
  const plano = await rede.criarPlanoProposto('Fechado', { semTermo: true })
  planId = plano.planId
  expect((await b.from('treatment_plans').update({ status: 'ACCEPTED' }).eq('id', planId)).error).toBeNull()
})

test.afterAll(async () => {
  await recepcao?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('A26: cancelar o pacote diz antes os pontos que ele deu e o saldo de hoje', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/clients/${camila}`)
    await p.getByRole('button', { name: 'Cancelar pacote' }).first().click()
    const aviso = p.getByRole('dialog', { name: 'Cancelar pacote' }).locator('[data-pontos-do-cancelamento]')
    await expect(aviso).toContainText('750 pontos')
    await expect(aviso).toContainText('220')
    await expect(aviso).toContainText('negativo')
  })
})

test('A27: a página do plano fechado tem "Cancelar plano", e quem não pode lê a quem pedir', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await p.locator('[data-cancelar-plano]').click()
    await expect(p.getByRole('dialog', { name: 'Cancelar plano' })).toBeVisible()
  })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await expect(p.locator('[data-quem-cancela-o-plano]')).toContainText('Financeiro em Gerenciar')
    await expect(p.locator('[data-cancelar-plano]')).toHaveCount(0)
  })
})

test('A29: o Investido total diz que o crédito comprado conta na compra', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/clients/${elisa}`)
    await expect(p.locator('[data-pago-com-credito]').first()).toContainText('crédito na clínica comprado')
  })
})

test('A34: o CPF da própria ficha não aparece como se fosse erro', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/clients/${elisa}?aba=dados`)
    const campo = p.getByLabel('Número do documento')
    await campo.fill('')
    await campo.pressSequentially(CPF)
    const aviso = p.locator('[data-cpf-da-ficha]')
    await expect(aviso).toContainText('É o CPF já salvo nesta ficha')
    await expect(p.getByText('CPF já vinculado a este cliente.')).toHaveCount(0)
  })
})

test('A35: o Reativar diz que quem tem horário marcado sai da conta, e o link diz o resto e o total', async ({ browser }) => {
  // Quatro clientes cadastradas há 200 dias e nunca vindas: 3 na lista, "mais 1 (4 no total)".
  const b = db()
  const antigo = new Date(Date.now() - 200 * 86_400_000).toISOString()
  for (const nome of ['Ana', 'Bia', 'Cris', 'Duda']) {
    const id = await rede!.criarCliente(`Sumida ${nome}`)
    expect((await b.from('clients').update({ created_at: antigo }).eq('id', id)).error).toBeNull()
  }
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/dashboard`)
    const quadro = p.locator('[data-reativar-clientes]')
    await expect(quadro).toContainText('quem tem horário marcado não entra')
    await expect(quadro.getByRole('link', { name: /Ver mais \d+ \(\d+ no total\)/ })).toBeVisible()
  })
})
