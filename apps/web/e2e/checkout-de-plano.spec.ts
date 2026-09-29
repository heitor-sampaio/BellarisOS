import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * O checkout de um plano de tratamento, pela tela: plano → pagamento →
 * documentação → agendamento — e o que ele deixa no financeiro e nos
 * documentos (termos e contratos, fase 3: migration 20260930000003).
 *
 * Numa rede `[e2e]` própria, com o contrato de plano PADRÃO que toda rede
 * ganha (`documentos_modelos_padrao`) e dois termos ligados aos procedimentos.
 * O plano tem três procedimentos, dois deles com o MESMO termo: saem dois
 * termos e um contrato.
 *
 * Cenário do dinheiro: plano de R$ 400, pago com entrada de R$ 100 e o saldo
 * em 3×. Documentos assinados no papel (o caminho que não exige desenhar).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let alheia: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let slug = ''
const procs: Record<'P1' | 'P2' | 'P3', string> = { P1: '', P2: '', P3: '' }
const termos: Record<'T1' | 'T2', string> = { T1: '', T2: '' }
const TOTAL = 400

async function termo(nome: string) {
  const { data, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede!.tenantId, p_modelo: null, p_nome: nome, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA',
    p_texto: `# ${nome}\n\nEu, {{cliente.nome}}, autorizo: {{procedimento.nome}}.`,
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null,
    p_arquivo_paginas: null, p_variaveis: ['cliente.nome', 'procedimento.nome'], p_usa_pagamento: false, p_ator: null,
  })
  expect(error, `criar o termo ${nome}`).toBeNull()
  return (data as { id: string }).id
}

/** Um plano PROPOSTO: P1 (R$ 150) + P2 (R$ 100) na 1ª sessão, P3 (R$ 150) na 2ª. */
async function plano(rotulo: string) {
  const cliente = await rede!.criarCliente(`Cliente ${rotulo}`)
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente,
    status: 'PROPOSED', name: `${PREFIXO} Plano ${rotulo} ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o plano').toBeNull()
  const sessoes = await db().from('treatment_plan_sessions')
    .insert([{ plan_id: pl!.id, sort_order: 0 }, { plan_id: pl!.id, sort_order: 1 }]).select('id, sort_order')
  const [s1, s2] = (sessoes.data ?? []).sort((a, b) => a.sort_order - b.sort_order)
  await db().from('treatment_plan_session_procedures').insert([
    { session_id: s1!.id, procedure_id: procs.P1, price: 150 },
    { session_id: s1!.id, procedure_id: procs.P2, price: 100 },
    { session_id: s2!.id, procedure_id: procs.P3, price: 150 },
  ])
  return { planId: pl!.id, cliente }
}

const docsDoPlano = async (planId: string) =>
  (await db().from('issued_documents').select('id, template_id, kind, title, status, content_sha256, content_text, payment_snapshot')
    .eq('treatment_plan_id', planId).order('created_at')).data ?? []

/** Assina no papel direto pela função (para os testes que não são da tela). */
async function assinarNoPapel(docId: string) {
  const [d] = (await db().from('issued_documents').select('content_sha256').eq('id', docId)).data ?? []
  const { error } = await db().rpc('documento_assinar', {
    p_doc: docId, p_tenant: rede!.tenantId, p_canal: 'PAPEL', p_identidade: 'PRESENCIAL', p_hash_exibido: d!.content_sha256,
    p_png: null, p_png_sha256: null, p_nome: 'e2e', p_documento: null, p_ip: null, p_ua: null,
    p_conduzido_por: null, p_link: null, p_scan_path: null, p_scan_sha256: null, p_aceite: null,
  })
  expect(error, 'assinar no papel').toBeNull()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`chk${marca}`)
  alheia = await criarOutraRede(`chka${marca}`)
  gestor = await criarMembro(`chkg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção checkout',
    permissoes: [
      { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
  const { data: un } = await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()
  slug = un!.slug

  // O contrato de plano padrão: o mesmo que toda rede de verdade ganhou.
  const { error: ePadrao } = await db().rpc('documentos_modelos_padrao', { p_tenant: rede.tenantId })
  expect(ePadrao, 'semear o contrato de plano padrão').toBeNull()
  termos.T1 = await termo(`${PREFIXO} Termo injetáveis ${marca}`)
  termos.T2 = await termo(`${PREFIXO} Termo peeling ${marca}`)

  procs.P1 = rede.procedureId
  for (const [chave, nome] of [['P2', 'Peeling'], ['P3', 'Preenchimento']] as const) {
    const { data } = await db().from('procedures').insert({
      tenant_id: rede.tenantId, name: `${PREFIXO} ${nome} ${marca}`, category: 'e2e', duration_min: 30, price: 100,
    }).select('id').single<{ id: string }>()
    procs[chave] = data!.id
  }
  await db().from('procedures').update({ consent_template_id: termos.T1 }).in('id', [procs.P1, procs.P3])
  await db().from('procedures').update({ consent_template_id: termos.T2 }).eq('id', procs.P2)
})

test.afterAll(async () => {
  for (const r of [rede, alheia]) {
    if (!r) continue
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', r.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  }
  await gestor?.limpar()
  await rede?.limpar()
  await alheia?.limpar()
})

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.describe.serial('checkout de plano', () => {
  test('pela tela: pagamento, os termos de cada procedimento e o contrato com o pagamento', async ({ browser }) => {
    test.setTimeout(150_000)
    const { planId } = await plano('tela')
    await como(browser, async page => {
      await page.addInitScript(() => { window.print = () => {} })
      await page.goto(`/admin/checkout/${planId}`)
      await page.getByRole('button', { name: 'Confirmar plano' }).click()

      // Pagamento ANTES da documentação: o contrato cita o pagamento.
      await page.getByRole('button', { name: 'Entrada + parcelas' }).click()
      await page.getByPlaceholder('0,00').first().fill('100')
      await page.getByRole('button', { name: 'Ir para a documentação' }).click()

      // Dois procedimentos com o MESMO termo: um termo só.
      const linhas = page.locator('[data-documento]')
      await expect(linhas).toHaveCount(3)
      const seguir = page.getByRole('button', { name: /^Falta assinar:/ })
      await expect(seguir).toBeDisabled()

      // Cada um assinado no papel, pela tela de assinatura embutida.
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: 'Colher assinatura' }).first().click()
        if (i === 0) {
          // O contrato de plano vem primeiro (kind), já com o pagamento e os procedimentos.
          await expect(page.getByText(/entrada de R\$\s100,00 \+ 3 parcelas de R\$\s100,00 no Pix/)).toBeVisible()
          await expect(page.getByText(new RegExp(`Peeling ${marca} — 1 sessão — R\\$\\s100,00`))).toBeVisible()
        }
        await page.getByRole('button', { name: 'Assinar no papel' }).click()
        await page.getByRole('button', { name: 'Confirmar: o cliente assinou o papel' }).click()
        await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
        await page.getByRole('button', { name: 'Continuar' }).click()
        await expect(linhas).toHaveCount(3)
      }
      await expect(page.getByText('Assinado', { exact: false }).first()).toBeVisible()

      await page.getByRole('button', { name: 'Ir para o agendamento' }).click()
      await page.getByRole('button', { name: 'Concluir sem agendar' }).click()
    })

    await expect.poll(async () => (await db().from('treatment_plans').select('status').eq('id', planId).single()).data?.status,
      { message: 'o plano aceito vira ACCEPTED' }).toBe('ACCEPTED')

    const docs = await docsDoPlano(planId)
    expect(docs.map(d => d.kind).sort()).toEqual(['CONTRATO_PLANO', 'TERMO', 'TERMO'])
    expect(docs.every(d => d.status === 'ASSINADO')).toBe(true)
    const t1 = docs.find(d => d.template_id === termos.T1)!
    expect(t1.content_text, 'o termo compartilhado cita os dois procedimentos').toContain(`Preenchimento ${marca}`)
    const contrato = docs.find(d => d.kind === 'CONTRATO_PLANO')!
    expect(contrato.payment_snapshot).toMatchObject({ forma: 'PARCELADO', metodo: 'PIX', entrada: 100, parcelas: 3 })

    const { data: fts } = await db().from('financial_transactions')
      .select('id, amount, is_paid, payment_method, due_date').eq('treatment_plan_id', planId).order('created_at')
    expect(fts, 'uma entrada paga e um saldo a receber').toHaveLength(2)
    const entrada = fts!.find(f => f.is_paid)!
    const saldo   = fts!.find(f => !f.is_paid)!
    expect(Number(entrada.amount)).toBe(100)
    expect(entrada.payment_method).toBe('PIX')
    expect(Number(saldo.amount)).toBe(TOTAL - 100)
    const { data: parcelas } = await db().from('installments').select('number, total, amount, is_paid')
      .eq('transaction_id', saldo.id).order('number')
    expect(parcelas!.map(p => `${p.number}/${p.total}:${Number(p.amount)}:${p.is_paid}`))
      .toEqual(['1/3:100:false', '2/3:100:false', '3/3:100:false'])
  })

  test('sem assinar, chamando direto, nada é lançado — nem pelo banco', async ({ browser }) => {
    const { planId } = await plano('direto')
    await como(browser, async page => {
      const r = await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', `/admin/checkout/${planId}`,
        [planId, null, [], slug])
      expect(r.texto).toContain('Falta assinar')
    })
    expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data).toEqual([])
    expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data?.status).toBe('PROPOSED')
    // A segunda linha: o gatilho recusa o status mesmo sem passar pelo app.
    const direto = await db().from('treatment_plans').update({ status: 'ACCEPTED' }).eq('id', planId)
    expect(direto.error?.message).toContain('Falta assinar')
  })

  test('trocar o pagamento depois de assinar: o contrato é substituído, e o pagamento antigo é recusado', async ({ browser }) => {
    const { planId } = await plano('troca')
    const avista = { forma: 'AVISTA', metodo: 'PIX' }
    const parcelado = { forma: 'PARCELADO', metodo: 'CREDIT_CARD', entrada: 0, parcelas: 4, primeiroVencimento: new Date(Date.now() + 30 * 864e5).toISOString() }
    await como(browser, async page => {
      const rota = `/admin/checkout/${planId}`
      const preparado = await chamarAcao(page, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', rota, [planId, avista])
      expect(preparado.texto).not.toContain('"error"')
      for (const d of await docsDoPlano(planId)) await assinarNoPapel(d.id)

      // Assinou à vista; tenta lançar parcelado.
      const errado = await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota, [planId, parcelado, [], slug])
      expect(errado.texto).toContain('A forma de pagamento é diferente da do contrato assinado')
      expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data).toEqual([])

      // Volta à documentação com o pagamento novo: o contrato antigo fica substituído.
      await chamarAcao(page, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', rota, [planId, parcelado])
      const docs = await docsDoPlano(planId)
      const contratos = docs.filter(d => d.kind === 'CONTRATO_PLANO')
      expect(contratos.map(c => c.status).sort()).toEqual(['PENDENTE', 'SUBSTITUIDO'])
      expect(contratos.find(c => c.status === 'PENDENTE')!.content_text).toContain('4 parcelas')
      expect(docs.filter(d => d.kind === 'TERMO').every(d => d.status === 'ASSINADO'), 'o termo não depende do pagamento').toBe(true)

      const semContrato = await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota, [planId, parcelado, [], slug])
      expect(semContrato.texto).toContain('Falta assinar')
    })
  })

  test('o plano de outra rede: nem prepara nem fecha', async ({ browser }) => {
    const alheio = await alheia!.criarPlanoProposto('alheio', { semTermo: true })
    const { planId: meu } = await plano('controle')
    await como(browser, async page => {
      const rota = `/admin/checkout/${meu}`
      const preparar = await chamarAcao(page, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', rota, [alheio.planId, null])
      expect(preparar.texto).toContain('Plano não encontrado')
      await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota, [alheio.planId, null, [], slug])
    })
    expect(await docsDoPlano(alheio.planId), 'nenhum documento plantado na outra rede').toEqual([])
    expect((await db().from('treatment_plans').select('status').eq('id', alheio.planId).single()).data?.status).toBe('PROPOSED')
    expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', alheio.planId)).data).toEqual([])
  })
})
