import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'
import { chamarAcao } from './apoio/acao-direta'
import { euVendi } from './apoio/vender'

/**
 * r3-f13-01 (o Heitor, revisão de 2026-11-03: "Lembre-se, flexibilidade.
 * Prazo por bandeira. Taxas também configuráveis por bandeira.").
 *
 * - Configurações → Comissões → "Taxas da maquininha" escolhe a BANDEIRA
 *   (Visa, Mastercard, Elo, Amex, Hipercard, Outras): cada uma pode ter o seu
 *   prazo da operadora e as suas taxas. O de hoje é a REGRA GERAL — vale para
 *   toda bandeira sem regra própria, e para o pagamento sem bandeira.
 * - O pagamento no cartão (crédito e débito) tem "Bandeira", opcional, e a
 *   grava. A taxa da bandeira vale onde a taxa já vale (o líquido da
 *   comissão, o que a operadora deposita); o prazo, no nascimento das
 *   parcelas da operadora.
 *
 * Numa rede [e2e] própria: geral crédito 3x 4,5% e prazo 30; a Elo com
 * crédito 3x 3% e prazo 32.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let dona: MembroDeTeste | null = null
let cliente = ''
let slug = ''
let proc = ''
let pacote = ''
const n = (v: unknown) => Number(v ?? 0)
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
function maisDias(dia: string, k: number) {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, d + k)).toISOString().slice(0, 10)
}

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function parcelasDa(tx: string) {
  const { data, error } = await db().rpc('recebiveis_do_cartao_lista', { p_tenant: rede!.tenantId, p_branch_ids: null, p_from: null, p_to: null })
  expect(error).toBeNull()
  return ((data ?? []) as Record<string, unknown>[]).filter(r => r.transaction_id === tx)
    .map(r => ({ numero: n(r.parcela_numero), valor: n(r.valor), taxa_pct: n(r.taxa_pct), vencimento: String(r.vencimento_dia) }))
    .sort((a, b) => a.numero - b.numero)
}

async function atendimentoConcluido(preco = 1100) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: proc,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: preco, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { error: e2 } = await db().rpc('concluir_atendimento', {
    p_agendamento: data!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: proc, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco }] },
  })
  expect(e2, 'concluir').toBeNull()
  return data!.id
}

const devido = async (ap: string) =>
  Math.round(((await db().from('commissions').select('amount').eq('appointment_id', ap)).data ?? []).reduce((s, c) => s + n(c.amount), 0) * 100) / 100

test.beforeAll(async () => {
  rede = await criarOutraRede(`band${marca}`)
  proc = rede.procedureId
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('procedures').update({ name: `${PREFIXO} Laser ${marca}`, price: 1100 }).eq('id', proc)).error).toBeNull()
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  cliente = await rede.criarCliente('Bandeira')
  await responderAnamnese(cliente, rede.tenantId)
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  // A comissão desconta a taxa da maquininha: é onde a taxa da bandeira aparece.
  expect((await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, modo: 'INTEGRAL', desconta_taxa: true, desconta_insumos: false }, { onConflict: 'tenant_id' })).error).toBeNull()
  expect((await db().from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true,
  })).error).toBeNull()
  // A regra geral: crédito 3x a 4,5%.
  expect((await db().from('payment_fees').insert({ tenant_id: rede.tenantId, metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 4.5 })).error).toBeNull()
  gestor = await criarMembro(`bandg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' }],
  })
  dona = await criarMembro(`bandd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  const { data, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote bandeira ${marca}`, p_preco: 900, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: proc, quantity: 3 }], p_comissao: { venda: null, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(error).toBeNull()
  pacote = data as string
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
    const passo = async (o: string, q: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await q
      if (error) falhas.push(`${o}: ${error.message}`)
    }
    await passo('comissão', b.from('commission_lines').delete().eq('tenant_id', rede.tenantId))
    const { data: cps } = await b.from('client_packages').select('id').eq('branch_id', rede.branchId)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      await passo('sessões', b.from('package_sessions').delete().in('client_package_id', ids))
      await passo('lançamentos do pacote', b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids))
      await passo('pacotes do cliente', b.from('client_packages').delete().in('id', ids))
    }
    await passo('pacotes', b.from('service_packages').delete().eq('tenant_id', rede.tenantId))
    await passo('taxas', b.from('payment_fees').delete().eq('tenant_id', rede.tenantId))
  }
  await gestor?.limpar()
  await dona?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('o cartão por bandeira', () => {
  test('a clínica dá à Elo o prazo de 32 dias e a taxa de 3% no crédito 3x, pela tela — e a regra geral fica como estava', async ({ browser }) => {
    await como(browser, dona!, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      const card = p.locator('[aria-label="Taxas da maquininha"]')
      const bandeira = card.getByLabel('Bandeira')
      await expect(bandeira, 'a regra geral por padrão').toHaveValue('')
      await expect(card.getByLabel('Taxa 3x')).toHaveValue('4,5')
      await expect(card.getByLabel('Prazo da operadora (dias)')).toHaveValue('30')

      await bandeira.selectOption({ label: 'Elo' })
      // Vazio = a regra geral (o campo mostra qual é).
      await expect(card.getByLabel('Taxa 3x')).toHaveValue('')
      await expect(card.getByLabel('Taxa 3x')).toHaveAttribute('placeholder', /4,5/)
      await expect(card.getByLabel('Prazo da operadora (dias)')).toHaveValue('')
      await card.getByLabel('Taxa 3x').fill('3')
      await card.getByLabel('Prazo da operadora (dias)').fill('32')
      await card.getByRole('button', { name: 'Salvar taxas' }).click()
      await expect(card.getByRole('status').filter({ hasText: 'Salvo.' })).toBeVisible()
      await expect(card, 'diz quem tem regra própria').toContainText('Com regra própria: Elo')

      // De volta à regra geral: nada mudou nela.
      await bandeira.selectOption({ value: '' })
      await expect(card.getByLabel('Taxa 3x')).toHaveValue('4,5')
      await expect(card.getByLabel('Prazo da operadora (dias)')).toHaveValue('30')
    })
    const { data: t } = await db().from('tenants').select('cartao_prazo_dias, cartao_por_bandeira').eq('id', rede!.tenantId).single()
    expect(t!.cartao_prazo_dias).toBe(30)
    expect(t!.cartao_por_bandeira).toEqual({ ELO: { prazo: 32, taxas: { 'CREDIT_CARD:3': 3 } } })
    expect(((await db().from('payment_fees').select('metodo, parcelas, taxa_pct').eq('tenant_id', rede!.tenantId)).data ?? [])
      .map(f => [f.metodo, f.parcelas, n(f.taxa_pct)]), 'a regra geral continua a de antes').toEqual([['CREDIT_CARD', 3, 4.5]])
  })

  test('a venda de R$ 1.100 em 3x na Elo: as parcelas a cada 32 dias com a taxa da Elo, e a comissão desconta a taxa da Elo; sem bandeira, a regra geral', async () => {
    const hoje = hojeSP()
    const pagar = async (ap: string, bandeira?: string) => {
      const { data, error } = await db().rpc('confirmar_pagamento_do_atendimento', {
        p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
        p_dados: { metodo: 'CREDIT_CARD', cartao_vezes: 3, pontos: 0, desconto: 0, valor_final: 1100, ...(bandeira ? { cartao_bandeira: bandeira } : {}) },
      })
      expect(error, 'pagar').toBeNull()
      return data as string
    }
    const naElo = await atendimentoConcluido()
    const txElo = await pagar(naElo, 'ELO')
    expect((await db().from('financial_transactions').select('cartao_bandeira').eq('id', txElo).single()).data?.cartao_bandeira, 'a bandeira gravada').toBe('ELO')
    expect(await parcelasDa(txElo)).toEqual([
      { numero: 1, valor: 366.66, taxa_pct: 3, vencimento: maisDias(hoje, 32) },
      { numero: 2, valor: 366.66, taxa_pct: 3, vencimento: maisDias(hoje, 64) },
      { numero: 3, valor: 366.68, taxa_pct: 3, vencimento: maisDias(hoje, 96) },
    ])
    // 10% de (R$ 1.100 − 3% da Elo) = R$ 106,70.
    expect(await devido(naElo), 'a comissão com a taxa da Elo').toBe(106.7)

    const semBandeira = await atendimentoConcluido()
    const txGeral = await pagar(semBandeira)
    expect(await parcelasDa(txGeral)).toEqual([
      { numero: 1, valor: 366.66, taxa_pct: 4.5, vencimento: maisDias(hoje, 30) },
      { numero: 2, valor: 366.66, taxa_pct: 4.5, vencimento: maisDias(hoje, 60) },
      { numero: 3, valor: 366.68, taxa_pct: 4.5, vencimento: maisDias(hoje, 90) },
    ])
    // 10% de (R$ 1.100 − 4,5%) = R$ 105,05.
    expect(await devido(semBandeira), 'a comissão com a regra geral').toBe(105.05)

    // A Visa não tem regra própria: vale a geral.
    const naVisa = await atendimentoConcluido()
    const txVisa = await pagar(naVisa, 'VISA')
    expect((await parcelasDa(txVisa)).map(x => [x.taxa_pct, x.vencimento])[0]).toEqual([4.5, maisDias(hoje, 30)])

    // A bandeira que não existe é recusada, com o motivo.
    const outro = await atendimentoConcluido()
    const { error } = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: outro, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { metodo: 'CREDIT_CARD', cartao_vezes: 1, pontos: 0, desconto: 0, valor_final: 1100, cartao_bandeira: 'XPTO' },
    })
    expect(error?.message).toContain('Bandeira')
  })

  test('o recebimento do atendimento pela tela tem "Bandeira" no cartão, e a grava', async ({ browser }) => {
    const ap = await atendimentoConcluido()
    await como(browser, gestor!, async p => {
      await p.goto(`/${slug}/agenda/${ap}?receber=1`)
      const janela = p.getByRole('dialog', { name: 'Confirmar pagamento' })
      await expect(janela.getByLabel('Bandeira'), 'no Pix não há bandeira').toHaveCount(0)
      await janela.getByLabel('Forma de pagamento').selectOption('CREDIT_CARD')
      await janela.getByLabel('Vezes no cartão').selectOption('3')
      await janela.getByLabel('Bandeira').selectOption({ label: 'Elo' })
      await janela.getByRole('button', { name: /Confirmar/ }).last().click()
      await expect.poll(async () => (await db().from('financial_transactions').select('cartao_bandeira').eq('appointment_id', ap).maybeSingle()).data?.cartao_bandeira,
        { message: 'pago na Elo' }).toBe('ELO')
    })
    const { data: tx } = await db().from('financial_transactions').select('id').eq('appointment_id', ap).single()
    expect((await parcelasDa(tx!.id as string)).map(x => x.vencimento)).toEqual([maisDias(hojeSP(), 32), maisDias(hojeSP(), 64), maisDias(hojeSP(), 96)])
  })

  test('a venda de pacote pela ficha ("Vender") tem "Bandeira" no cartão, e a grava', async ({ browser }) => {
    await como(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      await p.getByRole('button', { name: 'Vender', exact: true }).click()
      const dlg = p.getByRole('dialog', { name: 'Vender' })
      await dlg.getByRole('button', { name: 'Pacote', exact: true }).click()
      await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacote)
      await dlg.getByRole('button', { name: 'À vista', exact: true }).click()
      await dlg.getByLabel('Meio de pagamento').selectOption('CREDIT_CARD')
      await dlg.getByLabel('Vezes no cartão').selectOption('3')
      await dlg.getByLabel('Bandeira').selectOption({ label: 'Elo' })
      await euVendi(dlg)
      await dlg.getByRole('button', { name: /Vender por/ }).click()
      await expect.poll(async () => (await db().from('client_packages').select('id').eq('client_id', cliente)).data?.length, { message: 'vendido' }).toBe(1)
    })
    const { data: cp } = await db().from('client_packages').select('id').eq('client_id', cliente).single()
    const { data: tx } = await db().from('financial_transactions').select('id, cartao_bandeira, cartao_vezes').eq('client_package_id', cp!.id).single()
    expect([tx!.cartao_bandeira, tx!.cartao_vezes]).toEqual(['ELO', 3])
    expect((await parcelasDa(tx!.id as string)).map(x => [x.taxa_pct, x.vencimento])).toEqual([
      [3, maisDias(hojeSP(), 32)], [3, maisDias(hojeSP(), 64)], [3, maisDias(hojeSP(), 96)],
    ])
  })

  test('receber no Financeiro a parcela a receber no cartão pergunta a bandeira, e a grava', async ({ browser }) => {
    const { data: lanc, error } = await db().from('financial_transactions').insert({
      branch_id: rede!.branchId, client_id: cliente, type: 'INCOME', category: 'Serviços', amount: 250,
      description: `${PREFIXO} Parcela no débito ${marca}`, payment_method: 'DEBIT_CARD', is_paid: false, created_by: 'e2e',
      due_date: new Date().toISOString(),
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    await como(browser, gestor!, async p => {
      await p.goto(`/${slug}/financeiro`)
      const linha = p.getByRole('row').filter({ hasText: `Parcela no débito ${marca}` })
      await linha.getByTitle('Marcar como pago').click()
      const janela = p.getByRole('dialog', { name: 'Receber no cartão' })
      await janela.getByLabel('Bandeira').selectOption({ label: 'Mastercard' })
      await janela.getByRole('button', { name: 'Confirmar recebimento' }).click()
      await expect.poll(async () => (await db().from('financial_transactions').select('is_paid, cartao_bandeira').eq('id', lanc!.id).single()).data,
        { message: 'recebida na Mastercard' }).toEqual({ is_paid: true, cartao_bandeira: 'MASTERCARD' })
    })
  })

  test('a action recusa a bandeira que não existe na configuração', async ({ browser }) => {
    await como(browser, dona!, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      const r = await chamarAcao(p, 'actions/comissoes.ts', 'salvarCartaoPorBandeira', '/admin/settings', [{ XPTO: { prazo: 10, taxas: {} } }])
      expect(r.texto).not.toContain('"ok":true')
      expect(r.texto).toMatch(/[Bb]andeira/)
    })
    expect((await db().from('tenants').select('cartao_por_bandeira').eq('id', rede!.tenantId).single()).data?.cartao_por_bandeira)
      .toEqual({ ELO: { prazo: 32, taxas: { 'CREDIT_CARD:3': 3 } } })
  })
})
