import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * As taxas POR MAQUININHA (C75 do levantamento das regras, F67, 2026-11-12 —
 * D8 da 4ª volta, o Heitor: "Quem escolhe a taxa é a operadora… a rede precisa
 * configurar suas taxas, por operadora").
 *
 * - A rede nasce com uma maquininha, "Maquininha".
 * - A venda no cartão grava a maquininha escolhida; sem escolha, a primeira.
 *   O recebível da operadora (a taxa e o prazo) é o DELA.
 * - A maquininha de outra rede é recusada.
 * - O Pix tem campo próprio, fora delas (padrão 0%).
 * - Na tela: "Qual maquininha?" só aparece com mais de uma.
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let primeira = ''
let segunda = ''

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function vendaNoCredito(maquininha: string | null, vezes = 3) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, type: 'INCOME', category: 'Serviços', description: 'Venda no cartão',
    amount: 300, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'CREDIT_CARD', cartao_vezes: vezes,
    maquininha_id: maquininha, created_by: 'e2e',
  }).select('id, maquininha_id').single<{ id: string; maquininha_id: string | null }>()
  return { data, error }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`maq${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`maqd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('a rede nasce com uma maquininha, e o Pix tem a taxa própria, 0% de saída', async () => {
  const { data, error } = await db().from('maquininhas').select('id, nome, prazo_dias, cobra_por_bandeira').eq('tenant_id', rede!.tenantId)
  expect(error).toBeNull()
  expect((data ?? []).map(m => `${m.nome}:${m.prazo_dias}:${m.cobra_por_bandeira}`)).toEqual(['Maquininha:30:false'])
  primeira = data![0]!.id as string
  const { data: t } = await db().from('tenants').select('pix_taxa_pct').eq('id', rede!.tenantId).single()
  expect(Number(t?.pix_taxa_pct)).toBe(0)
})

test('a venda no crédito usa a taxa e o prazo da maquininha escolhida; sem escolha, a primeira', async () => {
  expect((await db().from('maquininhas').update({ taxas: { 'CREDIT_CARD:3': 3 }, prazo_dias: 30 }).eq('id', primeira)).error).toBeNull()
  const { data: m, error } = await db().from('maquininhas')
    .insert({ tenant_id: rede!.tenantId, nome: 'Stone', ordem: 1, taxas: { 'CREDIT_CARD:3': 5 }, prazo_dias: 2 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  segunda = m!.id

  const naStone = await vendaNoCredito(segunda)
  expect(naStone.error).toBeNull()
  expect(naStone.data?.maquininha_id).toBe(segunda)
  const { data: rs } = await db().from('recebiveis_do_cartao').select('taxa_pct, vencimento, parcela_numero')
    .eq('transaction_id', naStone.data!.id).order('parcela_numero')
  expect((rs ?? []).map(r => Number(r.taxa_pct)), 'a taxa da Stone').toEqual([5, 5, 5])
  const dias = (new Date(rs![0]!.vencimento as string).getTime() - Date.now()) / 86_400_000
  expect(dias, 'o prazo da Stone (2 dias), não o da outra (30)').toBeLessThan(3)

  const semEscolha = await vendaNoCredito(null)
  expect(semEscolha.data?.maquininha_id, 'sem escolha, a primeira').toBe(primeira)
  const { data: rp } = await db().from('recebiveis_do_cartao').select('taxa_pct').eq('transaction_id', semEscolha.data!.id)
  expect((rp ?? []).map(r => Number(r.taxa_pct))).toEqual([3, 3, 3])
})

test('a maquininha de outra rede é recusada', async () => {
  const outra = await criarOutraRede(`maqo${marca}`)
  try {
    const { data } = await db().from('maquininhas').select('id').eq('tenant_id', outra.tenantId).single<{ id: string }>()
    const r = await vendaNoCredito(data!.id)
    expect(r.error?.message).toContain('Esta maquininha não é desta clínica.')
  } finally {
    await outra.limpar()
  }
})

test('a despesa paga no cartão não passa em maquininha', async () => {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, type: 'EXPENSE', category: 'Fornecedores', description: 'Fornecedor no cartão',
    amount: 80, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'CREDIT_CARD', created_by: 'e2e',
  }).select('maquininha_id').single<{ maquininha_id: string | null }>()
  expect(error).toBeNull()
  expect(data?.maquininha_id, 'o cartão da clínica não é maquininha').toBeNull()
})

async function abrirNovoLancamento(p: Page) {
  const { data: b } = await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()
  await p.goto(`/${b!.slug}/financeiro`)
  await p.getByRole('button', { name: 'Novo lançamento' }).click()
  const dialogo = p.locator('dialog[open]').filter({ hasText: 'Novo lançamento' })
  await dialogo.getByLabel('Forma de pagamento').selectOption('CREDIT_CARD')
  return dialogo
}

test('"Qual maquininha?" aparece no lançamento só quando a rede tem mais de uma', async ({ browser }) => {
  await como(browser, async p => {
    const dialogo = await abrirNovoLancamento(p)
    await expect(dialogo.getByLabel('Qual maquininha?')).toBeVisible()
    await expect(dialogo.getByLabel('Qual maquininha?').locator('option')).toHaveText(['Escolha…', 'Maquininha', 'Stone'])
    await expect(dialogo.getByRole('button', { name: 'Lançar' }), 'sem escolher, não lança').toBeDisabled()
  })
  expect((await db().from('maquininhas').update({ arquivada_em: new Date().toISOString() }).eq('id', segunda)).error).toBeNull()
  await como(browser, async p => {
    const dialogo = await abrirNovoLancamento(p)
    await expect(dialogo.getByLabel('Vezes no cartão')).toBeVisible()
    await expect(dialogo.getByLabel('Qual maquininha?'), 'com uma só, nada a perguntar').toHaveCount(0)
  })
  expect((await db().from('maquininhas').update({ arquivada_em: null }).eq('id', segunda)).error).toBeNull()
})

test('com mais de uma, a baixa no cartão sem a maquininha é recusada no servidor', async ({ browser }) => {
  const { data: tx } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, type: 'INCOME', category: 'Serviços', description: 'Em aberto', amount: 100,
    is_paid: false, created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  await como(browser, async p => {
    const { data: b } = await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()
    const sem = await chamarAcao(p, 'actions/financial.ts', 'markTransactionPaid', `/${b!.slug}/financeiro`, [tx!.id, b!.slug, null, 1, 'CREDIT_CARD', null])
    expect(sem.texto, 'a primeira não vale calada').toContain('Escolha a maquininha do cartão.')
    // Com a maquininha, passa (o banco confere abaixo).
    await chamarAcao(p, 'actions/financial.ts', 'markTransactionPaid', `/${b!.slug}/financeiro`, [tx!.id, b!.slug, null, 1, 'CREDIT_CARD', segunda])
  })
  const { data } = await db().from('financial_transactions').select('is_paid, maquininha_id').eq('id', tx!.id).single()
  expect(data).toEqual({ is_paid: true, maquininha_id: segunda })
})

test('com mais de uma, todo caminho do cartão pergunta "Qual maquininha?" e espera: o atendimento, o plano, o checkout e o Vender', async ({ browser }) => {
  const { data: br } = await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()
  const slug = br!.slug
  const c = await rede!.criarCliente('Lia')
  const agora = new Date().toISOString()
  const { data: ap } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: c, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 200, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  const { data: pl } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: c, status: 'PROPOSED', name: `Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  const { data: ses } = await db().from('treatment_plan_sessions').insert({ plan_id: pl!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect((await db().from('treatment_plan_session_procedures').insert({ session_id: ses!.id, procedure_id: rede!.procedureId, price: 200 })).error).toBeNull()

  await como(browser, async p => {
    // O atendimento avulso: escolhe a Stone e confirma.
    await p.goto(`/${slug}/agenda/${ap!.id}?receber=1`)
    const dlg = p.getByRole('dialog', { name: 'Confirmar pagamento' })
    await dlg.getByLabel('Forma de pagamento').selectOption('CREDIT_CARD')
    await expect(dlg.getByRole('button', { name: /Confirmar/ }), 'sem a maquininha, espera').toBeDisabled()
    await dlg.getByLabel('Qual maquininha?').selectOption({ label: 'Stone' })
    await expect(dlg.getByRole('button', { name: /Confirmar/ })).toBeEnabled()
    await dlg.getByRole('button', { name: /Confirmar/ }).click()
    await expect.poll(async () => (await db().from('financial_transactions').select('maquininha_id')
      .eq('appointment_id', ap!.id).eq('type', 'INCOME').maybeSingle()).data?.maquininha_id, { message: 'gravou na Stone' }).toBe(segunda)

    // O checkout do plano.
    await p.goto(`/admin/checkout/${pl!.id}`)
    await p.getByRole('button', { name: 'Confirmar plano' }).click()
    await p.getByRole('button', { name: 'À vista', exact: true }).click()
    await p.getByRole('button', { name: 'Crédito', exact: true }).click()
    await expect(p.getByLabel('Qual maquininha?')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Ir para a documentação' })).toBeDisabled()
    await p.getByLabel('Qual maquininha?').selectOption({ label: 'Maquininha' })
    await expect(p.getByRole('button', { name: 'Ir para a documentação' })).toBeEnabled()

    // O "Vender" da ficha (pacote, pré-pago, produto, crédito e o contrato usam os mesmos campos).
    await p.goto(`/admin/clients/${c}`)
    await p.getByRole('button', { name: 'Vender', exact: true }).click()
    const vender = p.getByRole('dialog', { name: 'Vender' })
    await vender.getByLabel('Procedimento', { exact: true }).selectOption(rede!.procedureId)
    await vender.getByLabel('Meio de pagamento').selectOption('DEBIT_CARD')
    await expect(vender.getByLabel('Qual maquininha?')).toBeVisible()
    await expect(vender.getByRole('button', { name: /Vender por/ })).toBeDisabled()
    await vender.getByLabel('Qual maquininha?').selectOption({ label: 'Stone' })
    await expect(vender.getByRole('button', { name: /Vender por/ })).toBeEnabled()
  })

  // O "Receber" do plano no check-in.
  const { data: aceito } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: c, status: 'ACCEPTED', name: `Plano aceito ${marca}`,
  }).select('id').single<{ id: string }>()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: c, treatment_plan_id: aceito!.id, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento', amount: 200, is_paid: false, created_by: 'e2e',
  })).error).toBeNull()
  const { data: chegou } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: c, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'ARRIVED', source: 'INTERNAL', duration_min: 30, price: 200, scheduled_at: new Date().toISOString(), treatment_plan_id: aceito!.id,
  }).select('id').single<{ id: string }>()
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${chegou!.id}`)
    await p.getByRole('button', { name: /Receber R\$/ }).click()
    const dlg = p.getByRole('dialog', { name: 'Receber o plano de tratamento' })
    await dlg.getByLabel('Forma de pagamento').selectOption('DEBIT_CARD')
    await expect(dlg.getByRole('button', { name: 'Confirmar recebimento' })).toBeDisabled()
    await dlg.getByLabel('Qual maquininha?').selectOption({ label: 'Stone' })
    await expect(dlg.getByRole('button', { name: 'Confirmar recebimento' })).toBeEnabled()
  })
})

test('Configurações: o Pix fora das maquininhas, a bandeira guardada e a maquininha nova', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/settings?tab=comissoes')
    const card = p.locator('[aria-label="Taxas da maquininha"]')
    await expect(card.locator('[data-sem-taxa]'), 'sem o aviso "Sem taxa" nos campos: vazio é 0%').toHaveCount(0)
    await expect(card.getByLabel('Bandeira', { exact: true }), 'a bandeira fica guardada até a clínica precisar').toHaveCount(0)
    await card.getByLabel('Taxa Pix').fill('0,5')
    await card.getByRole('button', { name: 'Maquininha', exact: true }).click()
    await card.getByLabel('Esta maquininha cobra diferente em alguma bandeira?').check()
    await card.getByLabel('Bandeira', { exact: true }).selectOption({ label: 'Elo' })
    await card.getByLabel('Taxa 3x').fill('4')
    await card.getByRole('button', { name: '+ Adicionar maquininha' }).click()
    await card.getByLabel('Nome da maquininha').fill('Cielo')
    await card.getByLabel('Taxa Débito').fill('1,1')
    await card.getByRole('button', { name: 'Salvar taxas' }).click()
    await expect(card.getByRole('status').filter({ hasText: 'Salvo.' })).toBeVisible()
  })
  const { data: t } = await db().from('tenants').select('pix_taxa_pct').eq('id', rede!.tenantId).single()
  expect(Number(t?.pix_taxa_pct)).toBe(0.5)
  const { data: ms } = await db().from('maquininhas').select('nome, taxas, cobra_por_bandeira, por_bandeira')
    .eq('tenant_id', rede!.tenantId).order('ordem').order('created_at')
  const por = Object.fromEntries((ms ?? []).map(m => [m.nome as string, m]))
  expect(por.Maquininha?.cobra_por_bandeira).toBe(true)
  expect((por.Maquininha?.por_bandeira as Record<string, { taxas: Record<string, number> }>).ELO?.taxas).toEqual({ 'CREDIT_CARD:3': 4 })
  expect(por.Cielo?.taxas).toEqual({ 'DEBIT_CARD:1': 1.1 })
})
