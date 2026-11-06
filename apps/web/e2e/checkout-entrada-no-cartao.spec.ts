import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, clienteComSessao, type MembroDeTeste } from './apoio/sessao'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { euVendi, euVendiOPlano, pagoNoPix } from './apoio/vender'

/**
 * D5 e D6 da 6ª simulação (F20), e o A47.
 *
 * D5: a ENTRADA do "Entrada + parcelas" no cartão de crédito tem "Vezes no
 * cartão", com o limite da clínica, a taxa e o recebível da operadora — como o
 * à vista. A entrada de R$ 1.000 da Paula no Elo saiu 1x, sem a taxa do 3x.
 *
 * D6: o crediário da clínica não é cartão. As 2 parcelas de R$ 1.700 do saldo
 * (que a cliente paga à clínica) nasciam `CREDIT_CARD`, e o contrato dizia "+
 * 2 parcelas de R$ 1.700,00 no cartão de crédito". Elas nascem sem meio, e o
 * contrato diz "com a clínica".
 *
 * A47: a descrição que chega à cliente não leva texto interno ("Plano de
 * tratamento — checkout novo paciente — parcela 1/2").
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
const n = (v: unknown) => Number(v ?? 0)

test.beforeAll(async () => {
  rede = await criarOutraRede(`cec${marca}`)
  expect((await db().from('procedures').update({ name: `${PREFIXO} Bioestimulador ${marca}`, price: 2200 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('payment_fees').insert([
    { tenant_id: rede.tenantId, metodo: 'CREDIT_CARD', parcelas: 1, taxa_pct: 1.19 },
    { tenant_id: rede.tenantId, metodo: 'CREDIT_CARD', parcelas: 2, taxa_pct: 3 },
    { tenant_id: rede.tenantId, metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 4 },
  ])).error).toBeNull()
  const { error: ePadrao } = await db().rpc('documentos_modelos_padrao', { p_tenant: rede.tenantId })
  expect(ePadrao, 'semear o contrato de plano padrão').toBeNull()
  gestor = await criarMembro(`cecg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção e caixa',
    permissoes: [
      { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' },
    ],
  })
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
    const { data } = await b.from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    falhas.push(...(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).map(f => `${f.o_que}: ${f.erro}`))
    const { data: cps } = await b.from('client_packages').select('id').eq('branch_id', rede.branchId)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      for (const [o, q] of [
        ['comissão', b.from('commission_lines').delete().in('client_package_id', ids)],
        ['sessões', b.from('package_sessions').delete().in('client_package_id', ids)],
        ['lançamentos', b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)],
        ['pacotes da cliente', b.from('client_packages').delete().in('id', ids)],
      ] as const) {
        const { error } = await q
        if (error) falhas.push(`${o}: ${error.message}`)
      }
    }
    for (const [o, q] of [
      ['pacotes', b.from('service_packages').delete().eq('tenant_id', rede.tenantId)],
      ['taxas', b.from('payment_fees').delete().eq('tenant_id', rede.tenantId)],
    ] as const) {
      const { error } = await q
      if (error) falhas.push(`${o}: ${error.message}`)
    }
  }
  await gestor?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um plano PROPOSTO de 2 sessões de R$ 2.200 (R$ 4.400). */
async function plano() {
  const cliente = await rede!.criarCliente('Paula')
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente,
    status: 'PROPOSED', name: `${PREFIXO} Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o plano').toBeNull()
  const { data: sessoes } = await db().from('treatment_plan_sessions')
    .insert([{ plan_id: pl!.id, sort_order: 0 }, { plan_id: pl!.id, sort_order: 1 }]).select('id')
  expect((await db().from('treatment_plan_session_procedures').insert(
    (sessoes ?? []).map(s => ({ session_id: s.id, procedure_id: rede!.procedureId, price: 2200 })))).error).toBeNull()
  return { planId: pl!.id, cliente }
}

test.describe('a entrada no cartão e o crediário da clínica', () => {
  // D2 e A42 da 7ª simulação: a tela e o contrato diziam "3x de R$ 890,67"
  // (a média, que soma 2.672,01) e o banco gravou 890,66 + 890,66 + 890,68; o
  // contrato não dizia cada parcela com a data. Uma conta só, a gravada.
  test('o crediário de R$ 2.672 em 3: a tela, o contrato e o banco dizem as mesmas parcelas (D2, A42)', async ({ browser }) => {
    test.setTimeout(150_000)
    const { planId } = await plano()
    await como(browser, async page => {
      await page.goto(`/admin/checkout/${planId}`)
      await page.getByRole('button', { name: 'Confirmar plano' }).click()
      await page.getByRole('button', { name: 'Entrada + parcelas' }).click()
      await page.getByRole('button', { name: 'Pix', exact: true }).click()
      await page.getByLabel('Entrada', { exact: true }).fill('1728')
      await page.getByLabel('Parcelas do saldo').selectOption('3')
      await expect(page.locator('[data-parcelas-do-saldo]'), 'a tela diz as parcelas que vão ser gravadas')
        .toHaveText(/^2x de R\$\s890,66 \+ 1x de R\$\s890,68$/)
      await euVendiOPlano(page)
      await page.getByRole('button', { name: 'Ir para a documentação' }).click()

      await page.getByRole('button', { name: 'Colher assinatura' }).first().click()
      await expect(page.getByText(/3 parcelas \(2x de R\$\s890,66 \+ 1x de R\$\s890,68\) com a clínica: R\$\s890,66 em \d\d\/\d\d\/\d{4}, R\$\s890,66 em \d\d\/\d\d\/\d{4} e R\$\s890,68 em \d\d\/\d\d\/\d{4}/),
        'o contrato lista cada parcela com o valor e a data').toBeVisible()
      await page.getByRole('button', { name: 'Assinar no papel' }).click()
      await page.getByRole('button', { name: 'Confirmar: o cliente assinou o papel' }).click()
      await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
      await page.getByRole('button', { name: 'Continuar' }).click()
      await page.getByRole('button', { name: 'Ir para o agendamento' }).click()
      // A37 da 8ª: as sessões sem data ficam ditas ANTES de concluir, e concluir confirma.
      await expect(page.locator('[data-sessoes-sem-data]')).toContainText('As sessões 1 e 2 ficam sem data')
      await page.getByRole('button', { name: 'Concluir sem agendar' }).click()
      await expect(page.getByText(/Plano fechado/)).toBeVisible({ timeout: 20_000 })
    })
    await expect.poll(async () => (await db().from('treatment_plans').select('status').eq('id', planId).single()).data?.status).toBe('ACCEPTED')
    const { data: fts } = await db().from('financial_transactions').select('amount, parcela_numero')
      .eq('treatment_plan_id', planId).not('parcela_numero', 'is', null).order('parcela_numero')
    expect((fts ?? []).map(f => n(f.amount)), 'o banco gravou o que a tela e o contrato disseram').toEqual([890.66, 890.66, 890.68])
  })

  test('checkout do plano: a entrada no Elo em 3x (com a taxa e o recebível), as parcelas com a clínica, e o contrato diz isso', async ({ browser }) => {
    test.setTimeout(150_000)
    const { planId } = await plano()
    await como(browser, async page => {
      await page.goto(`/admin/checkout/${planId}`)
      await page.getByRole('button', { name: 'Confirmar plano' }).click()
      await page.getByRole('button', { name: 'Entrada + parcelas' }).click()
      await page.getByRole('button', { name: 'Crédito', exact: true }).click()
      await page.getByLabel('Entrada', { exact: true }).fill('1000')
      await page.getByLabel('Parcelas do saldo').selectOption('2')
      const vezes = page.getByLabel('Vezes no cartão', { exact: true })
      await vezes.selectOption('3')
      await page.getByLabel('Bandeira').selectOption('ELO')
      await euVendiOPlano(page)
      await page.getByRole('button', { name: 'Ir para a documentação' }).click()

      await page.getByRole('button', { name: 'Colher assinatura' }).first().click()
      await expect(page.getByText(/entrada de R\$\s1\.000,00 no cartão de crédito em 3x \+ 2 parcelas de R\$\s1\.700,00 com a clínica/)).toBeVisible()
      await page.getByRole('button', { name: 'Assinar no papel' }).click()
      await page.getByRole('button', { name: 'Confirmar: o cliente assinou o papel' }).click()
      await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
      await page.getByRole('button', { name: 'Continuar' }).click()
      await page.getByRole('button', { name: 'Ir para o agendamento' }).click()
      await page.getByRole('button', { name: 'Concluir sem agendar' }).click()
    })
    await expect.poll(async () => (await db().from('treatment_plans').select('status').eq('id', planId).single()).data?.status).toBe('ACCEPTED')

    const { data: fts } = await db().from('financial_transactions')
      .select('id, amount, is_paid, payment_method, cartao_vezes, cartao_bandeira, description, parcela_numero')
      .eq('treatment_plan_id', planId).order('parcela_numero', { nullsFirst: true })
    expect((fts ?? []).map(f => [n(f.amount), f.is_paid, f.payment_method, f.cartao_vezes, f.cartao_bandeira, f.description])).toEqual([
      [1000, true, 'CREDIT_CARD', 3, 'ELO', 'Plano de tratamento — entrada'],
      [1700, false, null, null, null, 'Plano de tratamento — parcela 1/2'],
      [1700, false, null, null, null, 'Plano de tratamento — parcela 2/2'],
    ])
    // A operadora deposita a entrada em 3, com a taxa do 3x (4%).
    const { data: rec } = await db().from('recebiveis_do_cartao').select('valor, taxa_pct').eq('transaction_id', fts![0]!.id).order('parcela_numero')
    expect((rec ?? []).map(r => [n(r.valor), n(r.taxa_pct)])).toEqual([[333.33, 4], [333.33, 4], [333.34, 4]])
  })

  test('Vender pacote: "Entrada + parcelas" no crédito também pergunta as vezes da entrada; as parcelas nascem sem meio', async ({ browser }) => {
    const { data: pacote, error } = await db().rpc('pacote_salvar', {
      p_tenant: rede!.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote ${marca}`, p_preco: 900, p_validade: null, p_ativo: true,
      p_itens: [{ procedure_id: rede!.procedureId, quantity: 3 }], p_comissao: { venda: null, execucao: { tipo: 'REGRA', valor: null } },
    })
    expect(error, 'criar o pacote').toBeNull()
    const cliente = await rede!.criarCliente('Márcia')
    await como(browser, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      await p.getByRole('button', { name: 'Vender', exact: true }).click()
      const dlg = p.getByRole('dialog', { name: 'Vender' })
      await dlg.getByRole('button', { name: 'Pacote', exact: true }).click()
      await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacote as string)
      await dlg.getByRole('button', { name: 'Entrada + parcelas' }).click()
      await dlg.getByLabel('Meio de pagamento').selectOption('CREDIT_CARD')
      await dlg.getByLabel('Entrada').fill('300')
      await dlg.getByLabel('Parcelas').selectOption('2')
      await dlg.getByLabel('Vezes no cartão').selectOption('2')
      await expect(dlg.getByText(/2× R\$\s150,00/).first()).toBeVisible()
      await pagoNoPix(dlg)
      await euVendi(dlg)
      await dlg.getByRole('button', { name: /Vender por/ }).click()
      await expect.poll(async () => (await db().from('client_packages').select('id').eq('client_id', cliente)).data?.length).toBe(1)
    })
    const { data: cp } = await db().from('client_packages').select('id').eq('client_id', cliente).single()
    const { data: txs } = await db().from('financial_transactions').select('amount, is_paid, payment_method, cartao_vezes')
      .eq('client_package_id', cp!.id as string).order('parcela_numero', { nullsFirst: true })
    expect((txs ?? []).map(t => [n(t.amount), t.is_paid, t.payment_method, t.cartao_vezes])).toEqual([
      [300, true, 'CREDIT_CARD', 2], [300, false, null, null], [300, false, null, null],
    ])
  })

  test('a parcela do crediário, sem meio: a ficha e o app dizem "Com a clínica", e o "Pagar" do Financeiro pergunta a forma', async ({ browser }) => {
    const { data: un } = await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()
    const cliente = await clienteComSessao(`cecc${marca}`, { id: rede!.branchId, slug: un!.slug }, { tenant: rede!.tenantId })
    try {
      const venc = new Date(Date.now() + 10 * 86_400_000).toISOString()
      const { data: tx, error } = await db().from('financial_transactions').insert({
        branch_id: rede!.branchId, client_id: cliente.clientId, type: 'INCOME', category: 'Serviços',
        description: `${PREFIXO} Pacote crediário ${marca} — parcela 1/2`, amount: 300, payment_method: null, is_paid: false,
        due_date: venc, parcela_numero: 1, parcela_total: 2, parcela_grupo: crypto.randomUUID(), created_by: 'e2e',
      }).select('id').single<{ id: string }>()
      expect(error).toBeNull()

      // O app da cliente: a parcela é com a clínica, não "Crédito".
      const ctxCli = await browser.newContext({ storageState: cliente.estado })
      try {
        const p = await ctxCli.newPage()
        await p.goto(`/${un!.slug}/cliente/historico`)
        await p.getByRole('button', { name: /Pagamentos/ }).click()
        const linha = p.locator('[data-pagamento]').filter({ hasText: `Pacote crediário ${marca}` })
        await expect(linha).toContainText('Parcela 1 de 2')
        await expect(linha).toContainText('Com a clínica')
      } finally { await ctxCli.close() }

      await como(browser, async p => {
        // A ficha da cliente, aba Financeiro.
        await p.goto(`/admin/clients/${cliente.clientId}?aba=financeiro`)
        await expect(p.locator(`[data-lancamento="${tx!.id}"] [data-forma-do-lancamento]`)).toHaveText('Com a clínica')

        // O Financeiro: "Pagar" pergunta a forma (nasce vazia) antes de dar baixa.
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
        const ate = new Date(Date.now() + 40 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
        await p.goto(`/${un!.slug}/financeiro?period=custom&from=${hoje}&to=${ate}`)
        await p.getByRole('row').filter({ hasText: `Pacote crediário ${marca}` }).getByRole('button', { name: 'Pagar' }).click()
        const dlg = p.getByRole('dialog', { name: 'Receber' })
        const forma = dlg.getByLabel('Forma de pagamento')
        await expect(forma).toHaveValue('')
        await expect(dlg.getByRole('button', { name: 'Confirmar recebimento' })).toBeDisabled()
        await forma.selectOption('PIX')
        await dlg.getByRole('button', { name: 'Confirmar recebimento' }).click()
        await expect(dlg).toBeHidden()
      })
      await expect.poll(async () => (await db().from('financial_transactions').select('is_paid, payment_method').eq('id', tx!.id).single()).data)
        .toEqual({ is_paid: true, payment_method: 'PIX' })
    } finally {
      await cliente.limpar()
    }
  })
})
