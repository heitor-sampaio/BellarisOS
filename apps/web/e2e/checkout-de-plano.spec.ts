import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { euVendiOPlano, receberPlanoNoPdv } from './apoio/vender'

/**
 * O receber de um plano de tratamento, pela tela: plano → pagamento →
 * documentação → receber — e o que ele deixa no financeiro e nos
 * documentos (termos e contratos, fase 3: migration 20260930000003).
 *
 * Desde a fase 3 do PDV (a revisão do Heitor, 2026-11-13 — PT1b/PT1c) o plano
 * se ACEITA sem dinheiro e se RECEBE no PDV, na janela "Receber o plano" da
 * comanda dele: sem agendamento ali (as sessões se agendam pelo plano), e só
 * o contrato de plano segura o dinheiro.
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

/** A rota em que o receber do plano mora (o PDV da rede) — é para ela que as actions se postam. */
const PDV = '/admin/pdv'

/** O aceite (PT1b): só "quero fazer", sem dinheiro — pela action, como a tela do plano. */
async function aceitar(page: Page, planId: string) {
  // O aceite é da página do plano (é ela que carrega a action); a prova é o banco.
  await chamarAcao(page, 'actions/treatment-plans.ts', 'aceitarPlano', `/admin/planejamentos/${planId}`, [planId])
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data?.status).toBe('ACCEPTED')
}

test.describe.serial('checkout de plano', () => {
  test('pela tela: pagamento, os termos de cada procedimento e o contrato com o pagamento', async ({ browser }) => {
    test.setTimeout(150_000)
    const { planId } = await plano('tela')
    await como(browser, async page => {
      await page.addInitScript(() => { window.print = () => {} })
      const janela = await receberPlanoNoPdv(page, '/admin', planId)
      await janela.getByRole('button', { name: 'Confirmar plano' }).click()

      // Pagamento ANTES da documentação: o contrato cita o pagamento.
      await janela.getByRole('radio', { name: 'Crediário', exact: true }).click()
      await janela.getByLabel('Entrada', { exact: true }).fill('100')
      // PDV8: com entrada, a entrada pede a forma dela (nasce vazia — A37).
      await janela.getByLabel('Forma da entrada').selectOption('PIX')
      await euVendiOPlano(page)
      await janela.getByRole('button', { name: 'Ir para a documentação' }).click()

      // Dois procedimentos com o MESMO termo: um termo só.
      const linhas = janela.locator('[data-documento]')
      await expect(linhas).toHaveCount(3)
      // PT1c: o que segura o dinheiro é o contrato do plano (cita o pagamento).
      const seguir = janela.getByRole('button', { name: /^Falta assinar:/ })
      await expect(seguir).toBeDisabled()
      await expect(seguir).toHaveText(/Contrato/i)

      // Cada um assinado no papel, pela tela de assinatura embutida.
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: 'Colher assinatura' }).first().click()
        if (i === 0) {
          // O contrato de plano vem primeiro (kind), já com o pagamento e os procedimentos.
          // D6 (6ª simulação): a entrada no Pix; as parcelas são o crediário da clínica.
          await expect(page.getByText(/entrada de R\$\s100,00 no Pix \+ 3 parcelas de R\$\s100,00 com a clínica/)).toBeVisible()
          await expect(page.getByText(new RegExp(`Peeling ${marca} — 1 sessão — R\\$\\s100,00`))).toBeVisible()
        }
        await page.getByRole('button', { name: 'Assinar no papel' }).click()
        await page.getByRole('button', { name: 'Confirmar: o cliente assinou o papel' }).click()
        await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
        await page.getByRole('button', { name: 'Continuar' }).click()
        await expect(linhas).toHaveCount(3)
      }
      await expect(janela.getByText('Assinado', { exact: false }).first()).toBeVisible()

      // Sem agendamento aqui: as sessões se agendam depois, pelo plano.
      await expect(janela.getByRole('button', { name: 'Ir para o agendamento' })).toHaveCount(0)
      await janela.getByRole('button', { name: 'Receber o plano' }).click()
      await expect(janela).toHaveCount(0)
    })

    await expect.poll(async () => ((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data ?? []).length,
      { message: 'o receber lançou a entrada e as parcelas' }).toBe(4)
    expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data?.status, 'o receber não muda o status').toBe('ACCEPTED')

    const docs = await docsDoPlano(planId)
    expect(docs.map(d => d.kind).sort()).toEqual(['CONTRATO_PLANO', 'TERMO', 'TERMO'])
    expect(docs.every(d => d.status === 'ASSINADO')).toBe(true)
    const t1 = docs.find(d => d.template_id === termos.T1)!
    expect(t1.content_text, 'o termo compartilhado cita os dois procedimentos').toContain(`Preenchimento ${marca}`)
    const contrato = docs.find(d => d.kind === 'CONTRATO_PLANO')!
    expect(contrato.payment_snapshot).toMatchObject({ forma: 'PARCELADO', metodo: 'PIX', entrada: 100, parcelas: 3 })

    // A entrada paga e CADA parcela um lançamento a receber, no seu mês, com
    // "parcela n/3" na descrição (2026-09-30) — não mais o saldo inteiro num só.
    const { data: fts } = await db().from('financial_transactions')
      .select('id, amount, is_paid, payment_method, due_date, description, parcela_numero, parcela_total, parcela_grupo')
      .eq('treatment_plan_id', planId).order('parcela_numero', { nullsFirst: true })
    expect(fts, 'a entrada e as três parcelas').toHaveLength(4)
    const entrada = fts!.find(f => f.is_paid)!
    expect(Number(entrada.amount)).toBe(100)
    expect(entrada.payment_method).toBe('PIX')
    expect(entrada.description).toMatch(/— entrada$/)
    const parcelas = fts!.filter(f => !f.is_paid)
    expect(parcelas.map(p => `${p.parcela_numero}/${p.parcela_total}:${Number(p.amount)}`)).toEqual(['1/3:100', '2/3:100', '3/3:100'])
    expect(parcelas.map(p => p.description.replace(/.*— /, ''))).toEqual(['parcela 1/3', 'parcela 2/3', 'parcela 3/3'])
    const meses = parcelas.map(p => new Date(p.due_date as string).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7))
    expect(new Set(meses).size, 'uma parcela em cada mês').toBe(3)
    expect(new Set(parcelas.map(p => p.parcela_grupo)).size, 'o mesmo parcelamento').toBe(1)
    expect(Math.round(fts!.reduce((t, f) => t + Number(f.amount), 0) * 100) / 100, 'entrada + parcelas fecham o plano').toBe(TOTAL)
  })

  // PT1c (o Heitor, 13/11: "primeiro colhe assinatura, depois paga"): o aceite
  // não trava mais por documento — o que se trava é o RECEBER, sem o contrato.
  test('sem assinar, chamando direto, nada é lançado', async ({ browser }) => {
    const { planId } = await plano('direto')
    await como(browser, async page => {
      await aceitar(page, planId)
      const semForma = await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', PDV,
        [planId, null, [], slug])
      expect(semForma.texto).toContain('Escolha como vai ser pago')
      const r = await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', PDV,
        [planId, { forma: 'AVISTA', metodo: 'PIX' }, [], slug])
      expect(r.texto).toContain('Falta assinar')
    })
    expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data).toEqual([])
    expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data?.status).toBe('ACCEPTED')
  })

  test('trocar o pagamento depois de assinar: o contrato é substituído, e o pagamento antigo é recusado', async ({ browser }) => {
    const { planId } = await plano('troca')
    const avista = { forma: 'AVISTA', metodo: 'PIX' }
    const parcelado = { forma: 'PARCELADO', metodo: 'CREDIT_CARD', entrada: 0, parcelas: 4, primeiroVencimento: new Date(Date.now() + 30 * 864e5).toISOString() }
    await como(browser, async page => {
      const rota = PDV
      await aceitar(page, planId)
      const preparado = await chamarAcao(page, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', rota, [planId, avista])
      expect(preparado.texto).not.toContain('"error"')
      for (const d of await docsDoPlano(planId)) await assinarNoPapel(d.id)

      // Assinou à vista; tenta lançar parcelado.
      const errado = await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota, [planId, parcelado, [], slug])
      expect(errado.texto).toContain('A forma de pagamento ou o desconto são diferentes dos do contrato assinado')
      // O desconto é parte do combinado: à vista, mas com 10% que o contrato não diz, também não passa.
      const comDesconto = await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota,
        [planId, avista, [], slug, { tipo: 'PERCENTUAL', valor: 10 }])
      expect(comDesconto.texto).toContain('A forma de pagamento ou o desconto são diferentes dos do contrato assinado')
      expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data).toEqual([])

      // A45: o pagamento novo PERGUNTA antes de substituir o contrato assinado —
      // sem a confirmação, o servidor não troca nada.
      const semConfirmar = await chamarAcao(page, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', rota, [planId, parcelado])
      expect(semConfirmar.texto).toContain('substituiContrato')
      expect((await docsDoPlano(planId)).filter(d => d.kind === 'CONTRATO_PLANO').map(c => c.status), 'nada trocado sem confirmar').toEqual(['ASSINADO'])

      // Volta à documentação com o pagamento novo, confirmando: o contrato antigo fica substituído.
      await chamarAcao(page, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', rota, [planId, parcelado, undefined, { substituirContrato: true }])
      const docs = await docsDoPlano(planId)
      const contratos = docs.filter(d => d.kind === 'CONTRATO_PLANO')
      expect(contratos.map(c => c.status).sort()).toEqual(['PENDENTE', 'SUBSTITUIDO'])
      expect(contratos.find(c => c.status === 'PENDENTE')!.content_text).toContain('4 parcelas')
      expect(docs.filter(d => d.kind === 'TERMO').every(d => d.status === 'ASSINADO'), 'o termo não depende do pagamento').toBe(true)

      const semContrato = await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota, [planId, parcelado, [], slug])
      expect(semContrato.texto).toContain('Falta assinar')
    })
  })

  // A45 da 5ª simulação: o contrato assinado virava SUBSTITUIDO ao mudar o
  // pagamento sem aviso nenhum — quem operava só via "Colher assinatura" de novo.
  test('A45: trocar o pagamento depois de assinar avisa, pela tela, antes de substituir o contrato', async ({ browser }) => {
    test.setTimeout(150_000)
    const { planId } = await plano('aviso')
    await como(browser, async page => {
      const rota = PDV
      await aceitar(page, planId)
      await chamarAcao(page, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', rota, [planId, { forma: 'AVISTA', metodo: 'PIX' }])
      for (const d of await docsDoPlano(planId)) await assinarNoPapel(d.id)

      const janela = await receberPlanoNoPdv(page, '/admin', planId)
      await janela.getByRole('button', { name: 'Confirmar plano' }).click()
      await janela.getByRole('radio', { name: 'Crediário', exact: true }).click()
      await janela.getByLabel('Entrada', { exact: true }).fill('100')
      await janela.getByLabel('Forma da entrada').selectOption('PIX')
      await euVendiOPlano(page)
      await janela.getByRole('button', { name: 'Ir para a documentação' }).click()
      const aviso = page.locator('[data-substitui-contrato]')
      await expect(aviso).toContainText('já foi assinado para outro pagamento')
      await expect(aviso).toContainText('no Pix')
      expect((await docsDoPlano(planId)).filter(d => d.kind === 'CONTRATO_PLANO').map(c => c.status), 'o aviso não troca nada').toEqual(['ASSINADO'])

      await aviso.getByRole('button', { name: 'Substituir o contrato' }).click()
      await expect(page.locator('[data-documento]').first()).toBeVisible()
      await expect.poll(async () => (await docsDoPlano(planId)).filter(d => d.kind === 'CONTRATO_PLANO').map(c => c.status).sort())
        .toEqual(['PENDENTE', 'SUBSTITUIDO'])
    })
  })

  test('o atendimento de hoje vai junto: o checkout mostra e recebe os dois (2026-10-20)', async ({ browser }) => {
    // A simulação de um dia de clínica: a limpeza de R$ 180 da Joana, concluída,
    // gerou um plano — e o checkout ("Novo paciente") cobrou SÓ o plano. O
    // atendimento ficou sem receber, e o caixa achou que tinha cobrado a limpeza.
    const { planId, cliente } = await plano('hoje')
    const { data: ap, error: eAp } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: procs.P1,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 180, status: 'COMPLETED', source: 'INTERNAL',
    }).select('id').single<{ id: string }>()
    expect(eAp, 'o atendimento de hoje').toBeNull()
    await db().from('treatment_plans').update({ evaluation_appointment_id: ap!.id }).eq('id', planId)

    const avista = { forma: 'AVISTA', metodo: 'PIX' }
    await como(browser, async page => {
      const rota = PDV
      const janela = await receberPlanoNoPdv(page, '/admin', planId)
      await expect(janela.getByTestId('atendimento-de-hoje')).toContainText(/R\$\s180,00/)

      await chamarAcao(page, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', rota, [planId, avista])
      for (const d of await docsDoPlano(planId)) await assinarNoPapel(d.id)
      // O que a action devolve vem no meio do payload da página: a prova é o financeiro, abaixo.
      await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota, [planId, avista, [], slug])
    })

    const { data: doAtendimento } = await db().from('financial_transactions')
      .select('amount, is_paid, payment_method').eq('appointment_id', ap!.id)
    expect((doAtendimento ?? []).map(t => [Number(t.amount), t.is_paid, t.payment_method]), 'o atendimento recebido, com o seu id')
      .toEqual([[180, true, 'PIX']])
    const { data: doPlano } = await db().from('financial_transactions').select('amount, is_paid').eq('treatment_plan_id', planId)
    expect((doPlano ?? []).map(t => [Number(t.amount), t.is_paid]), 'o plano, separado').toEqual([[TOTAL, true]])
  })

  // A38 da 6ª simulação: o checkout dizia três coisas sobre o Botox de hoje —
  // "entram juntos", "fica fora deste checkout" e "entra junto". Diz UMA, a
  // que o sistema faz com a forma escolhida.
  test('A38: o checkout diz uma coisa só sobre o atendimento de hoje — a que acontece com a forma escolhida', async ({ browser }) => {
    const { planId, cliente } = await plano('A38')
    const { data: ap, error: eAp } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: procs.P1,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 180, status: 'COMPLETED', source: 'INTERNAL',
    }).select('id').single<{ id: string }>()
    expect(eAp).toBeNull()
    await db().from('treatment_plans').update({ evaluation_appointment_id: ap!.id }).eq('id', planId)
    await como(browser, async page => {
      const janela = await receberPlanoNoPdv(page, '/admin', planId)
      const hoje = janela.getByTestId('atendimento-de-hoje')
      await expect(hoje).toContainText('Ainda não foi recebido')
      await expect(hoje, 'o plano não promete nada antes da forma').not.toContainText(/entram juntos|entra junto|fica fora/)
      await janela.getByRole('button', { name: 'Confirmar plano' }).click()
      const frase = janela.getByTestId('atendimento-de-hoje-no-pagamento').locator('[data-hoje-entra]')
      // PT1b: no PDV a forma nasce "À vista" (sai o "Receber no atendimento"): entra, e o total diz.
      await expect(frase).toHaveAttribute('data-hoje-entra', 'sim')
      await expect(frase).toContainText(/Entra neste checkout: R\$\s180,00 cobrados junto/)
      await expect(janela.getByText('(com o atendimento de hoje)')).toBeVisible()
      // "A receber": não entra, e diz onde receber.
      await janela.getByRole('radio', { name: 'A receber', exact: true }).click()
      await expect(frase).toHaveAttribute('data-hoje-entra', 'nao')
      await expect(frase).toHaveText('Não entra neste checkout: receba pela tela do atendimento.')
      // De volta ao à vista (o bloco de um meio — PDV8): entra de novo.
      await janela.getByRole('radio', { name: 'Pix', exact: true }).click()
      await expect(frase).toHaveAttribute('data-hoje-entra', 'sim')
      await expect(janela.getByTestId('atendimento-de-hoje-no-pagamento')).toHaveCount(1)
      await expect(janela.getByText(/fica fora deste checkout|entra junto, à vista/)).toHaveCount(0)
    })
  })

  test('o caixa sem o módulo de Termos colhe a assinatura do checkout (2026-10-20)', async ({ browser }) => {
    // Na simulação de um dia de clínica, o caixa (Recebimentos, sem Termos)
    // travou em "Colher assinatura" com um "Forbidden" cru. Decisão do Heitor:
    // quem recebe colhe a assinatura DAQUELE checkout; o resto dos documentos
    // continua com o módulo de Termos.
    test.setTimeout(150_000)
    const { planId } = await plano('caixa')
    const caixa = await criarMembro(`chkc${marca}`, {
      tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Caixa sem Termos', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'VIEW' }],
    })
    try {
      const ctx = await browser.newContext({ storageState: caixa.estado })
      try {
        const page = await ctx.newPage()
        await page.addInitScript(() => { window.print = () => {} })
        // O caixa da simulação era de UNIDADE: o receber é no PDV da unidade
        // (quem recebe também aceita — PT1b).
        const janela = await receberPlanoNoPdv(page, `/${slug}`, planId)
        await janela.getByRole('button', { name: 'Confirmar plano' }).click()
        await janela.getByRole('radio', { name: 'Pix', exact: true }).click()
        await euVendiOPlano(page)
        await janela.getByRole('button', { name: 'Ir para a documentação' }).click()
        const linhas = janela.locator('[data-documento]')
        await expect(linhas).toHaveCount(3)
        for (let i = 0; i < 3; i++) {
          await page.getByRole('button', { name: 'Colher assinatura' }).first().click()
          await page.getByRole('button', { name: 'Assinar no papel' }).click()
          await page.getByRole('button', { name: 'Confirmar: o cliente assinou o papel' }).click()
          await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
          // A completa de 07/11 (F46): assinado o contrato, cada refresh da tela
          // trazia o `contratoAssinado` como objeto novo, o efeito que relê o
          // passo guardado rodava de novo, voltava ao Pagamento e remontava a
          // documentação — o "Documento assinado" sumia e o mesmo termo reabria
          // para assinar. Depois do refresh, a tela continua onde estava.
          await page.waitForLoadState('networkidle')
          await expect(page.getByRole('heading', { name: 'Documento assinado' }), 'o refresh não volta ao pagamento').toBeVisible()
          await page.getByRole('button', { name: 'Continuar' }).click()
        }
        await expect(page.getByText('Forbidden')).toHaveCount(0)
      } finally { await ctx.close() }
      const docs = await docsDoPlano(planId)
      expect(docs.map(d => d.status), 'os três assinados pelo caixa').toEqual(['ASSINADO', 'ASSINADO', 'ASSINADO'])

      // Fora do checkout, o caixa continua sem os documentos: um documento de
      // atendimento (não de plano em checkout) não abre.
      // Um termo da rede que não é de plano em checkout (o primeiro termo do
      // plano, desligado do plano).
      const [umDoPlano] = docs.filter(d => d.kind === 'TERMO')
      const { error: eDesliga } = await db().from('issued_documents').update({ treatment_plan_id: null }).eq('id', umDoPlano!.id)
      expect(eDesliga, 'desligar o termo do plano').toBeNull()
      const avulso = { id: umDoPlano!.id }
      {
        const ctx2 = await browser.newContext({ storageState: caixa.estado })
        try {
          const p = await ctx2.newPage()
          const r = await chamarAcao(p, 'actions/documentos.ts', 'documentoParaAssinar', `/${slug}/pdv`, [avulso.id])
          expect(r.texto).toContain('Seu cargo não libera esta ação.')
        } finally { await ctx2.close() }
      }
    } finally {
      await caixa.limpar()
    }
  })

  test('o plano de outra rede: nem aceita, nem prepara, nem recebe', async ({ browser }) => {
    const alheio = await alheia!.criarPlanoProposto('alheio', { semTermo: true })
    await como(browser, async page => {
      const rota = PDV
      const aceite = await chamarAcao(page, 'actions/treatment-plans.ts', 'aceitarPlano', rota, [alheio.planId])
      expect(aceite.texto).toContain('Plano não encontrado')
      const preparar = await chamarAcao(page, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', rota, [alheio.planId, null])
      expect(preparar.texto).toContain('Plano não encontrado')
      const receber = await chamarAcao(page, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota, [alheio.planId, { forma: 'AVISTA', metodo: 'PIX' }, [], slug])
      expect(receber.texto).toContain('Plano não encontrado')
    })
    expect((await db().from('comandas').select('id').eq('treatment_plan_id', alheio.planId)).data ?? [], 'nenhuma comanda na outra rede').toEqual([])
    expect(await docsDoPlano(alheio.planId), 'nenhum documento plantado na outra rede').toEqual([])
    expect((await db().from('treatment_plans').select('status').eq('id', alheio.planId).single()).data?.status).toBe('PROPOSED')
    expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', alheio.planId)).data).toEqual([])
  })
})
