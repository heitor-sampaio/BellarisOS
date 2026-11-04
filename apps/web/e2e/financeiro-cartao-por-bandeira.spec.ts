import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
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
  // r4-f15-01 (o Heitor, revisão das decisões da F15): o campo vazio da
  // bandeira é a regra geral DAQUELAS vezes. A Elo só tem o 3x (3%); a geral
  // tem 3x 4,5% e 5x 6%. A venda Elo em 5x usa os 6% da geral — era os 3% da
  // Elo (a maior faixa dela até 5x). A Elo em 3x segue com os 3% dela.
  test('r4-f15-01: a venda Elo em 5x, sem a taxa de 5x na Elo, usa a regra geral de 5x — não a faixa de 3x da Elo', async () => {
    // A Elo como o primeiro teste a deixa (aqui também, para rodar sozinho com -g).
    expect((await db().from('tenants').update({ cartao_por_bandeira: { ELO: { prazo: 32, taxas: { 'CREDIT_CARD:3': 3 } } } }).eq('id', rede!.tenantId)).error).toBeNull()
    expect((await db().from('payment_fees').insert({ tenant_id: rede!.tenantId, metodo: 'CREDIT_CARD', parcelas: 5, taxa_pct: 6 })).error).toBeNull()
    const pagar = async (ap: string, vezes: number) => {
      const { data, error } = await db().rpc('confirmar_pagamento_do_atendimento', {
        p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
        p_dados: { metodo: 'CREDIT_CARD', cartao_vezes: vezes, pontos: 0, desconto: 0, valor_final: 1100, cartao_bandeira: 'ELO' },
      })
      expect(error, 'pagar').toBeNull()
      return data as string
    }
    const em5 = await atendimentoConcluido()
    const tx5 = await pagar(em5, 5)
    expect((await parcelasDa(tx5)).map(x => x.taxa_pct), 'as parcelas da operadora com os 6% da geral').toEqual([6, 6, 6, 6, 6])
    // 10% de (R$ 1.100 − 6%) = R$ 103,40.
    expect(await devido(em5), 'a comissão com a taxa geral de 5x').toBe(103.4)

    const em3 = await atendimentoConcluido()
    const tx3 = await pagar(em3, 3)
    expect((await parcelasDa(tx3)).map(x => x.taxa_pct), 'na Elo em 3x, a dela').toEqual([3, 3, 3])
    expect(await devido(em3)).toBe(106.7)
  })

  // F16-2 (o Heitor, revisão das decisões da F16, opção A: o fallback "pode
  // levar a erros de cálculos"): sem a taxa EXATA daquelas vezes, nem na
  // bandeira nem na regra geral, a taxa é 0% — nunca a de outras vezes. A Elo
  // só tem o 3x; a geral, o 3x (4,5%) e o 5x (6%); ninguém tem o 4x. A venda
  // Elo em 4x sai com 0% (era os 4,5% do 3x da geral), e a sem bandeira também.
  // Nada é recusado. E a clínica fica sabendo: a linha do 4x nas "Taxas da
  // maquininha" e o Fechamento do dia avisam.
  test('F16-2: sem a taxa exata das vezes (nem na Elo nem na geral), a venda Elo 4x sai com 0% — e a tela e o Fechamento avisam', async ({ browser }) => {
    expect((await db().from('tenants').update({ cartao_por_bandeira: { ELO: { prazo: 32, taxas: { 'CREDIT_CARD:3': 3 } } } }).eq('id', rede!.tenantId)).error).toBeNull()
    expect((await db().from('payment_fees').delete().eq('tenant_id', rede!.tenantId)).error).toBeNull()
    expect((await db().from('payment_fees').insert([
      { tenant_id: rede!.tenantId, metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 4.5 },
      { tenant_id: rede!.tenantId, metodo: 'CREDIT_CARD', parcelas: 5, taxa_pct: 6 },
    ])).error).toBeNull()
    const pagar = async (ap: string, bandeira?: string) => {
      const { data, error } = await db().rpc('confirmar_pagamento_do_atendimento', {
        p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
        p_dados: { metodo: 'CREDIT_CARD', cartao_vezes: 4, pontos: 0, desconto: 0, valor_final: 1100, ...(bandeira ? { cartao_bandeira: bandeira } : {}) },
      })
      expect(error, 'pagar: nada é recusado').toBeNull()
      return data as string
    }
    const naElo = await atendimentoConcluido()
    const txElo = await pagar(naElo, 'ELO')
    expect((await parcelasDa(txElo)).map(x => x.taxa_pct), 'a Elo em 4x: 0% (não os 4,5% do 3x da geral)').toEqual([0, 0, 0, 0])
    // 10% de R$ 1.100 sem desconto da operadora.
    expect(await devido(naElo), 'a comissão sobre o valor cheio').toBe(110)
    const semBandeira = await atendimentoConcluido()
    const txGeral = await pagar(semBandeira)
    expect((await parcelasDa(txGeral)).map(x => x.taxa_pct), 'sem bandeira em 4x: 0% (não os 4,5% do 3x)').toEqual([0, 0, 0, 0])

    await como(browser, dona!, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      const card = p.locator('[aria-label="Taxas da maquininha"]')
      const linha = (rotulo: string) => card.locator('label').filter({ has: p.getByLabel(`Taxa ${rotulo}`, { exact: true }) })
      // A regra geral: o 4x (e o 2x, o débito, o crédito à vista) sem taxa; o 3x e o 5x não.
      await expect(linha('4x'), 'o 4x da regra geral avisa').toContainText('Sem taxa: as vendas em 4x saem sem desconto da operadora.')
      await expect(linha('4x')).toHaveAttribute('data-sem-taxa', '')
      await expect(linha('Débito')).toContainText('Sem taxa: as vendas no débito saem sem desconto da operadora.')
      await expect(linha('3x').locator('[data-aviso-sem-taxa]'), 'o 3x tem').toHaveCount(0)
      await expect(linha('5x').locator('[data-aviso-sem-taxa]'), 'o 5x tem').toHaveCount(0)
      await expect(linha('6x').locator('[data-aviso-sem-taxa]'), 'acima do "parcelar até" (5x, automático), não avisa').toHaveCount(0)
      await expect(linha('Pix').locator('[data-aviso-sem-taxa]'), 'o Pix sem taxa é comum: não avisa').toHaveCount(0)
      // Na Elo: o 4x (nem ela nem a geral) avisa; o 5x vazio usa a geral (tem), o 3x é dela.
      await card.getByLabel('Bandeira').selectOption({ label: 'Elo' })
      await expect(linha('4x'), 'o 4x da Elo avisa').toContainText('Sem taxa: as vendas em 4x saem sem desconto da operadora.')
      await expect(linha('5x').locator('[data-aviso-sem-taxa]'), 'o 5x vazio na Elo usa a geral').toHaveCount(0)
      await expect(linha('3x').locator('[data-aviso-sem-taxa]')).toHaveCount(0)
    })

    await como(browser, gestor!, async p => {
      await p.goto(`/${slug}/fechamento`)
      const aviso = p.locator('[data-aviso="sem-taxa"]')
      await expect(aviso, 'o Fechamento do dia avisa a venda no cartão sem taxa').toContainText('Sem taxa da maquininha')
      await expect(aviso).toContainText('Crédito 4x (Elo)')
      await expect(aviso).toContainText('Configurações → Comissões')
    })
  })

  // r4-f15-01, o botão (o Heitor: "a taxa é por parcela, por exemplo 1.15% por
  // parcela, então a taxa total é a taxa vezes a quantidade de parcelas"): só
  // preenche os campos (1x a 12x = a taxa × as vezes), não mexe no débito e
  // não grava sozinho — grava no "Salvar taxas" de sempre.
  test('r4-f15-01: "Preencher pela taxa por parcela" preenche o crédito 1x a 12x, na regra geral e na bandeira, sem gravar', async ({ browser }) => {
    expect((await db().from('tenants').update({ cartao_por_bandeira: { ELO: { prazo: 32, taxas: { 'CREDIT_CARD:3': 3 } } } }).eq('id', rede!.tenantId)).error).toBeNull()
    const antesGeral = ((await db().from('payment_fees').select('metodo, parcelas, taxa_pct').eq('tenant_id', rede!.tenantId).order('parcelas')).data ?? [])
      .map(f => [f.metodo, f.parcelas, n(f.taxa_pct)])
    const esperado = ['1,15', '2,30', '3,45', '4,60', '5,75', '6,90', '8,05', '9,20', '10,35', '11,50', '12,65', '13,80']
    await como(browser, dona!, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      const card = p.locator('[aria-label="Taxas da maquininha"]')
      const conferir = async () => {
        await expect(card.getByLabel('Taxa Crédito à vista')).toHaveValue(esperado[0]!)
        for (let k = 2; k <= 12; k++) await expect(card.getByLabel(`Taxa ${k}x`), `${k}x`).toHaveValue(esperado[k - 1]!)
      }
      const preencher = async () => {
        await card.getByRole('button', { name: 'Preencher pela taxa por parcela' }).click()
        await card.getByLabel('Taxa por parcela (%)').fill('1,15')
        await card.getByRole('button', { name: 'Preencher', exact: true }).click()
      }
      // A regra geral.
      await preencher()
      await conferir()
      await expect(card.getByLabel('Taxa Débito'), 'o débito não muda').toHaveValue('')
      // A Elo: o 3x dela (3%) também é trocado; cada campo segue editável.
      await card.getByLabel('Bandeira').selectOption({ label: 'Elo' })
      await expect(card.getByLabel('Taxa 3x')).toHaveValue('3')
      await preencher()
      await conferir()
      await card.getByLabel('Taxa 12x').fill('13')
      await expect(card.getByLabel('Taxa 12x'), 'editável à mão').toHaveValue('13')
    })
    // Nada foi gravado sem o "Salvar taxas".
    expect(((await db().from('payment_fees').select('metodo, parcelas, taxa_pct').eq('tenant_id', rede!.tenantId).order('parcelas')).data ?? [])
      .map(f => [f.metodo, f.parcelas, n(f.taxa_pct)])).toEqual(antesGeral)
    expect((await db().from('tenants').select('cartao_por_bandeira').eq('id', rede!.tenantId).single()).data?.cartao_por_bandeira)
      .toEqual({ ELO: { prazo: 32, taxas: { 'CREDIT_CARD:3': 3 } } })
  })
  // r4-f15-02 (o Heitor, revisão das decisões da F15): o "Novo lançamento" do
  // Financeiro, na RECEITA paga no cartão (crédito ou débito), pergunta o mesmo
  // "Bandeira (opcional)" dos outros lugares e a grava. Fora do cartão, ou na
  // despesa, não pergunta.
  test('r4-f15-02: o "Novo lançamento" de uma receita no cartão tem "Bandeira (opcional)", e a grava', async ({ browser }) => {
    const descricao = `${PREFIXO} Receita no crédito ${marca}`
    await como(browser, gestor!, async p => {
      await p.goto(`/${slug}/financeiro`)
      await p.getByRole('button', { name: 'Novo lançamento' }).click()
      const dialogo = p.locator('dialog[open]').filter({ hasText: 'Novo lançamento' })
      await dialogo.getByLabel('Descrição *').fill(descricao)
      await dialogo.getByLabel('Categoria *').selectOption('Atendimento')
      await dialogo.getByLabel('Valor bruto (R$) *').fill('300')
      const forma = dialogo.getByLabel('Forma de pagamento')
      await forma.selectOption('PIX')
      await expect(dialogo.getByLabel('Bandeira'), 'no Pix não há bandeira').toHaveCount(0)
      await forma.selectOption('DEBIT_CARD')
      await expect(dialogo.getByLabel('Bandeira'), 'no débito, sim').toBeVisible()
      await dialogo.getByRole('button', { name: 'Despesa' }).click()
      await expect(dialogo.getByLabel('Bandeira'), 'na despesa, não').toHaveCount(0)
      await dialogo.getByRole('button', { name: 'Receita' }).click()
      // Trocar o tipo troca a lista de categorias (e a zera): de novo a da receita.
      await dialogo.getByLabel('Categoria *').selectOption('Atendimento')
      await forma.selectOption('CREDIT_CARD')
      await dialogo.getByLabel('Bandeira').selectOption({ label: 'Elo' })
      await dialogo.getByRole('button', { name: 'Lançar' }).click()
      await expect.poll(async () => (await db().from('financial_transactions').select('payment_method, is_paid, cartao_bandeira')
        .eq('branch_id', rede!.branchId).eq('description', descricao).maybeSingle()).data, { message: 'lançado na Elo' })
        .toEqual({ payment_method: 'CREDIT_CARD', is_paid: true, cartao_bandeira: 'ELO' })
    })
  })

  // F16-5 (o Heitor, revisão das decisões da F16: "ajuste isso para permitir
  // escolher parcelas"): a receita PAGA no crédito, no "Novo lançamento",
  // escolhe as vezes (até o limite da clínica) e, como o crédito em N vezes das
  // outras telas, é UM pagamento que a OPERADORA deposita em N — com o prazo e
  // a taxa da bandeira. Não é o "Parcelado" da despesa: a tela diz a diferença.
  test('F16-5: o "Novo lançamento" da receita paga no crédito escolhe as vezes, e a operadora deposita em N (com o prazo e a taxa da Elo)', async ({ browser }) => {
    expect((await db().from('tenants').update({ cartao_por_bandeira: { ELO: { prazo: 32, taxas: { 'CREDIT_CARD:3': 3 } } } }).eq('id', rede!.tenantId)).error).toBeNull()
    expect((await db().from('payment_fees').delete().eq('tenant_id', rede!.tenantId)).error).toBeNull()
    expect((await db().from('payment_fees').insert({ tenant_id: rede!.tenantId, metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 4.5 })).error).toBeNull()
    const descricao = `${PREFIXO} Receita no crédito 3x ${marca}`
    await como(browser, gestor!, async p => {
      await p.goto(`/${slug}/financeiro`)
      await p.getByRole('button', { name: 'Novo lançamento' }).click()
      const dialogo = p.locator('dialog[open]').filter({ hasText: 'Novo lançamento' })
      await dialogo.getByLabel('Descrição *').fill(descricao)
      await dialogo.getByLabel('Categoria *').selectOption('Atendimento')
      await dialogo.getByLabel('Valor bruto (R$) *').fill('1200')
      const forma = dialogo.getByLabel('Forma de pagamento')
      await forma.selectOption('DEBIT_CARD')
      await expect(dialogo.getByLabel('Vezes no cartão'), 'no débito, 1x').toHaveCount(0)
      await forma.selectOption('CREDIT_CARD')
      await dialogo.getByRole('button', { name: 'Pendente' }).click()
      await expect(dialogo.getByLabel('Vezes no cartão'), 'pendente: as vezes são da baixa').toHaveCount(0)
      await dialogo.getByRole('button', { name: 'Pago' }).click()
      const vezes = dialogo.getByLabel('Vezes no cartão')
      await expect(vezes.locator('option'), 'até o limite da clínica (3x, a maior com taxa)').toHaveText(['À vista', '2x', '3x'])
      await vezes.selectOption('3')
      await expect(dialogo.locator('[data-valor-da-parcela]')).toContainText('3× R$ 400,00')
      // A diferença para o "Parcelado" (a despesa em parcelas mensais): é um pagamento só.
      await expect(dialogo.locator('[data-credito-em-vezes]')).toContainText('Um pagamento só')
      await expect(dialogo.locator('[data-credito-em-vezes]')).toContainText('a operadora deposita em 3 parcelas')
      await dialogo.getByLabel('Bandeira').selectOption({ label: 'Elo' })
      await dialogo.getByRole('button', { name: 'Lançar' }).click()
      await expect.poll(async () => (await db().from('financial_transactions').select('amount, is_paid, cartao_vezes, cartao_bandeira')
        .eq('branch_id', rede!.branchId).eq('description', descricao).maybeSingle()).data, { message: 'lançado em 3x na Elo' })
        .toEqual({ amount: 1200, is_paid: true, cartao_vezes: 3, cartao_bandeira: 'ELO' })
    })
    const { data: tx } = await db().from('financial_transactions').select('id').eq('branch_id', rede!.branchId).eq('description', descricao).single()
    const hoje = hojeSP()
    expect(await parcelasDa(tx!.id as string), 'a operadora deposita em 3, a cada 32 dias, com os 3% da Elo').toEqual([
      { numero: 1, valor: 400, taxa_pct: 3, vencimento: maisDias(hoje, 32) },
      { numero: 2, valor: 400, taxa_pct: 3, vencimento: maisDias(hoje, 64) },
      { numero: 3, valor: 400, taxa_pct: 3, vencimento: maisDias(hoje, 96) },
    ])
    expect((await db().from('financial_transactions').select('id').eq('branch_id', rede!.branchId).like('description', `${descricao}%`)).data?.length,
      'um lançamento só (não parcelas da cliente)').toBe(1)

    // O servidor recusa acima do limite da clínica, sem gravar.
    await como(browser, gestor!, async p => {
      const acima = `${PREFIXO} Receita 12x ${marca}`
      const r = await chamarAcaoComFormulario(p, 'actions/financial.ts', 'createTransactionAdvanced', `/${slug}/financeiro`, [undefined], {
        _branchId: rede!.branchId, _slug: slug, type: 'INCOME', category: 'Atendimento', description: acima, amount: '1200',
        payment_method: 'CREDIT_CARD', is_paid: 'true', paid_on: hoje, cartao_vezes: '12', schedule_mode: 'single',
      })
      expect(r.texto).toMatch(/até 3x|3x/)
      expect((await db().from('financial_transactions').select('id').eq('description', acima)).data ?? [], 'nada gravado').toEqual([])
    })
  })

  // F16-3 (o Heitor: "não é pra recusar nada, juros podem passar facilmente de
  // 100% no acumulado"): nenhum teto nas taxas da maquininha — só não negativo.
  // 10% por parcela preenche o 12x com 120%; a Elo grava 150% no 12x. A venda
  // em 12x com 120% não quebra nada: a comissão sobre o líquido não fica
  // negativa (R$ 0) e o depósito previsto da operadora não fica abaixo de zero.
  test('F16-3: nenhum teto nas taxas — 120% na geral e 150% na Elo gravam, e a venda em 12x não quebra nada', async ({ browser }) => {
    await como(browser, dona!, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      const card = p.locator('[aria-label="Taxas da maquininha"]')
      await card.getByRole('button', { name: 'Preencher pela taxa por parcela' }).click()
      await card.getByLabel('Taxa por parcela (%)').fill('10')
      await card.getByRole('button', { name: 'Preencher', exact: true }).click()
      await expect(card.getByRole('alert'), 'a taxa por parcela de 10% não é recusada').toHaveCount(0)
      await expect(card.getByLabel('Taxa 12x')).toHaveValue('120,00')
      await card.getByLabel('Bandeira').selectOption({ label: 'Elo' })
      await card.getByLabel('Taxa 12x').fill('150')
      // Negativa, sim, é recusada.
      await card.getByLabel('Taxa 11x').fill('-1')
      await card.getByRole('button', { name: 'Salvar taxas' }).click()
      await expect(card.getByRole('alert')).toContainText('negativ')
      await card.getByLabel('Taxa 11x').fill('')
      await card.getByRole('button', { name: 'Salvar taxas' }).click()
      await expect(card.getByRole('status').filter({ hasText: 'Salvo.' })).toBeVisible()
    })
    const { data: t } = await db().from('tenants').select('cartao_por_bandeira').eq('id', rede!.tenantId).single()
    expect((t!.cartao_por_bandeira as { ELO: { taxas: Record<string, number> } }).ELO.taxas['CREDIT_CARD:12'], 'a Elo com 150%').toBe(150)

    const pagar = async (ap: string, bandeira?: string) => {
      const { data, error } = await db().rpc('confirmar_pagamento_do_atendimento', {
        p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
        p_dados: { metodo: 'CREDIT_CARD', cartao_vezes: 12, pontos: 0, desconto: 0, valor_final: 1100, ...(bandeira ? { cartao_bandeira: bandeira } : {}) },
      })
      expect(error, 'pagar em 12x: nada é recusado').toBeNull()
      return data as string
    }
    const geral = await atendimentoConcluido()
    const txGeral = await pagar(geral)
    const parcelas = await parcelasDa(txGeral)
    expect(parcelas.map(x => x.taxa_pct), 'a regra geral do 12x: 120% (gravada sem teto)').toEqual(Array(12).fill(120))
    // 10% de (R$ 1.100 − 120%) seria negativa: a comissão sobre o líquido fica em R$ 0.
    expect(await devido(geral), 'a comissão sobre o líquido não fica negativa').toBe(0)
    const { data: lista, error } = await db().rpc('recebiveis_do_cartao_lista', { p_tenant: rede!.tenantId, p_branch_ids: null, p_from: null, p_to: null })
    expect(error).toBeNull()
    const dela = ((lista ?? []) as Record<string, unknown>[]).filter(r => r.transaction_id === txGeral)
    expect(dela.every(r => n(r.liquido) === 0 && n(r.taxa) === n(r.valor)), 'a operadora não deposita menos que zero: líquido R$ 0, a taxa é a parcela inteira').toBe(true)
    const naElo = await atendimentoConcluido()
    expect((await parcelasDa(await pagar(naElo, 'ELO'))).map(x => x.taxa_pct)[0], 'a Elo do 12x: 150%').toBe(150)

    // O Fechamento do dia abre, com a estimativa das taxas.
    await como(browser, gestor!, async p => {
      await p.goto(`/${slug}/fechamento`)
      await expect(p.locator('[data-taxas-do-dia]')).toContainText('Taxas da maquininha no dia')
    })
  })
})
