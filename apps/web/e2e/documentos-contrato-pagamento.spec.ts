import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { receberAtendimentoNoPdv, escolherFormaPorValor, botaoDeReceber } from './apoio/vender'

/**
 * O pagamento no contrato do PROCEDIMENTO (atendimento avulso) — decisão do
 * Heitor, 2026-09-30. No plano o pagamento vem do checkout; no avulso ele só
 * é recebido depois do atendimento, então a recepção o define antes de colher
 * a assinatura. Até lá o contrato que cita `pagamento.*` fica INCOMPLETO. O
 * recebimento na recepção já vem com o meio combinado.
 *
 * O modelo é "só avisa": o bloqueio (certo) impediria concluir o atendimento
 * sem a assinatura, e aqui o que se prova é o pagamento.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let cliente = ''
let agendamento = ''
let contrato = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const docDoContrato = async () => (await db().from('issued_documents')
  .select('status, content, missing_fields, payment_snapshot').eq('id', contrato).single()).data!

test.beforeAll(async () => {
  rede = await criarOutraRede(`dcp${marca}`)
  gestor = await criarMembro(`dcpg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção contrato',
    permissoes: [{ modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  recepcao = await criarMembro(`dcpr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Caixa contrato',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Contrato com pagamento ${marca}`, p_tipo: 'CONTRATO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'AVISA',
    p_texto: '# Contrato\n\nValor de {{procedimento.valor}}, pago assim: {{pagamento.forma}}.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: ['procedimento.valor', 'pagamento.forma'], p_usa_pagamento: true, p_ator: null,
  })
  expect(error).toBeNull()
  await db().from('procedures').update({ contract_template_id: (m as { id: string }).id }).eq('id', rede.procedureId)
  cliente = await rede.criarCliente('Contrato pagamento')
  const { error: eC } = await db().from('clients').update({ document: '52998224725' }).eq('id', cliente)
  expect(eC).toBeNull()
  const { data: ag, error: eA } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(eA).toBeNull()
  agendamento = ag!.id
  const { data: d } = await db().from('issued_documents').select('id').eq('appointment_id', agendamento).eq('kind', 'CONTRATO').single<{ id: string }>()
  contrato = d!.id
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(x => x.id as string))).toEqual([])
    await db().from('procedures').update({ contract_template_id: null, consent_template_id: null }).eq('tenant_id', rede.tenantId)
    await db().from('document_template_versions').delete().eq('tenant_id', rede.tenantId)
    await db().from('document_templates').delete().eq('tenant_id', rede.tenantId)
  }
  await recepcao?.limpar()
  await gestor?.limpar()
  await rede?.limpar()
})

test.describe.serial('documentos: pagamento no contrato do procedimento', () => {
  test('sem pagamento definido, o contrato espera — e não sai por link', async ({ browser }) => {
    await como(browser, gestor!.estado, async page => {
      await page.goto(`/admin/clients/${cliente}?aba=documentos`)
      const linha = page.locator(`[data-documento="${contrato}"]`)
      await expect(linha.getByText('Falta definir o pagamento do contrato.')).toBeVisible()
      await expect(linha.getByRole('link', { name: 'Colher assinatura' })).toHaveCount(0)
      const r = await chamarAcao(page, 'actions/documentos.ts', 'gerarLinkDeAssinatura', `/admin/clients/${cliente}`, [contrato])
      expect(r.texto).toContain('Faltam dados')
    })
    const d = await docDoContrato()
    expect(d.status).toBe('INCOMPLETO')
    expect(d.missing_fields).toEqual(['pagamento.forma'])
    expect(d.payment_snapshot).toBeNull()
  })

  test('quem tem Documentos em Gerenciar define entrada + parcelas pela ficha, e o contrato cita o combinado', async ({ browser }) => {
    await como(browser, gestor!.estado, async page => {
      await page.goto(`/admin/clients/${cliente}?aba=documentos`)
      const linha = page.locator(`[data-documento="${contrato}"]`)
      await linha.getByRole('button', { name: 'Definir pagamento' }).click()
      const form = linha.locator('[data-definir-pagamento]')
      await form.getByRole('radio', { name: 'Crediário', exact: true }).click()
      await form.getByLabel('Entrada', { exact: true }).fill('40')
      await form.getByLabel('Forma da entrada').selectOption('CREDIT_CARD')
      await form.getByLabel('Parcelas').selectOption('3')
      await form.getByLabel('Vencimento').fill('2026-11-10')
      await form.getByRole('button', { name: 'Salvar pagamento' }).click()
      // D6 (6ª simulação): o cartão é da entrada; as parcelas, da clínica.
      await expect(linha.getByText(/Pagamento: Entrada de R\$\s40,00 no cartão de crédito \+ 3x no crediário, a primeira em 10\/11\/2026/)).toBeVisible()
      await expect(linha.getByRole('link', { name: 'Colher assinatura' })).toBeVisible()
    })
    const d = await docDoContrato()
    expect(d.status).toBe('PENDENTE')
    expect(d.payment_snapshot).toEqual({ forma: 'PARCELADO', metodo: 'CREDIT_CARD', entrada: 40, parcelas: 3, primeiroVencimento: '2026-11-10' })
    expect(d.content as string).toMatch(/Valor de R\$\s100,00, pago assim: entrada de R\$\s40,00 no cartão de crédito \+ 3 parcelas de R\$\s20,00 no crediário: R\$\s20,00 em 10\/11\/2026, R\$\s20,00 em 10\/12\/2026 e R\$\s20,00 em 10\/01\/2027\./)
  })

  test('trocar antes de assinar monta o contrato de novo; quem tem o PDV recebe com o meio combinado', async ({ browser }) => {
    const antes = (await docDoContrato()).content
    await como(browser, gestor!.estado, async page => {
      await page.goto(`/admin/clients/${cliente}?aba=documentos`)
      const linha = page.locator(`[data-documento="${contrato}"]`)
      await linha.getByRole('button', { name: 'Trocar pagamento' }).click()
      const form = linha.locator('[data-definir-pagamento]')
      await form.getByRole('radio', { name: 'Débito', exact: true }).click()
      await form.getByRole('button', { name: 'Salvar pagamento' }).click()
      await expect(linha.getByText('Pagamento: À vista, no cartão de débito')).toBeVisible()
    })
    const d = await docDoContrato()
    expect(d.content).not.toBe(antes)
    expect(d.content as string).toContain('à vista, no cartão de débito')

    // O atendimento aconteceu: na comanda dele no PDV (PDV7), o meio já vem escolhido.
    const { error } = await db().from('appointments').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', agendamento)
    expect(error).toBeNull()
    await como(browser, recepcao!.estado, async page => {
      const comanda = await receberAtendimentoNoPdv(page, '/admin', agendamento)
      await expect(comanda.locator('[data-forma="DEBIT_CARD"]')).toHaveAttribute('aria-checked', 'true')
      await expect(comanda.getByTestId('pagamento-combinado')).toContainText('À vista, no cartão de débito')
    })
  })

  test('o servidor recusa: pagamento torto, documento que não é contrato do procedimento, e contrato assinado', async ({ browser }) => {
    // Um TERMO de verdade, emitido pelo agendamento: o documento que não é
    // contrato do procedimento, e que por isso não tem pagamento a definir.
    const { data: termo, error: eT } = await db().rpc('documento_modelo_salvar', {
      p_tenant: rede!.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo de controle ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
      p_momento: 'AGENDAMENTO', p_exigencia: 'AVISA', p_texto: 'Termo de {{cliente.nome}}.',
      p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
      p_variaveis: ['cliente.nome'], p_usa_pagamento: false, p_ator: null,
    })
    expect(eT).toBeNull()
    await db().from('procedures').update({ consent_template_id: (termo as { id: string }).id }).eq('id', rede!.procedureId)
    const { data: ag2, error: eA } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
    }).select('id').single<{ id: string }>()
    expect(eA).toBeNull()
    const { data: outro } = await db().from('issued_documents').select('id').eq('appointment_id', ag2!.id).eq('kind', 'TERMO').single<{ id: string }>()
    expect(outro, 'o termo de controle nasceu').not.toBeNull()
    await como(browser, gestor!.estado, async page => {
      const definir = (id: string, p: unknown) => chamarAcao(page, 'actions/documentos.ts', 'definirPagamentoDoContrato', `/admin/clients/${cliente}`, [id, p])
      expect((await definir(contrato, { forma: 'PARCELADO', metodo: 'PIX', entrada: -5, parcelas: 99, primeiroVencimento: 'x' })).texto).toContain('Forma de pagamento inválida')
      expect((await definir(outro!.id, { forma: 'AVISTA', metodo: 'PIX' })).texto).toContain('Só o contrato do procedimento')
    })
    // Assinado, o combinado não muda mais.
    await db().from('issued_documents').update({ status: 'DISPENSADO', closed_reason: 'teste' }).eq('id', contrato)
    await como(browser, gestor!.estado, async page => {
      const r = await chamarAcao(page, 'actions/documentos.ts', 'definirPagamentoDoContrato', `/admin/clients/${cliente}`, [contrato, { forma: 'AVISTA', metodo: 'PIX' }])
      expect(r.texto).toContain('não está mais esperando assinatura')
    })
    expect((await docDoContrato()).payment_snapshot).toMatchObject({ forma: 'AVISTA', metodo: 'DEBIT_CARD' })
  })

  // D1 da 33ª (DG-03, VD-10): o contrato assinado para "crédito 3x" e o PDV recebeu Pix sem perguntar —
  // o contrato seguiu assinado com o crédito 3x. Receber com outro pagamento pergunta antes, como o plano.
  test('receber com outro pagamento do que o contrato assinado pergunta antes, e substituir troca o contrato junto do dinheiro', async ({ browser }) => {
    const { data: ag3, error: eA } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
    }).select('id').single<{ id: string }>()
    expect(eA).toBeNull()
    const { data: c3 } = await db().from('issued_documents').select('id').eq('appointment_id', ag3!.id).eq('kind', 'CONTRATO').single<{ id: string }>()
    expect(c3, 'o contrato do agendamento nasceu').not.toBeNull()
    await como(browser, gestor!.estado, async page => {
      const r = await chamarAcao(page, 'actions/documentos.ts', 'definirPagamentoDoContrato', `/admin/clients/${cliente}`,
        [c3!.id, { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 }])
      // O texto da resposta traz sempre "error":"$undefined" do payload do Next: confere o ok.
      expect(r.texto).toContain('"ok":true')
    })
    // Assinado com o crédito 3x (a assinatura em si é de outros specs).
    expect((await db().from('issued_documents').update({ status: 'ASSINADO', signed_at: new Date().toISOString() }).eq('id', c3!.id)).error).toBeNull()
    expect((await db().from('appointments').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', ag3!.id)).error).toBeNull()
    const lancamentos = async () => ((await db().from('financial_transactions').select('id, payment_method')
      .eq('appointment_id', ag3!.id).eq('type', 'INCOME')).data ?? []) as { id: string; payment_method: string | null }[]

    await como(browser, recepcao!.estado, async page => {
      const comanda = await receberAtendimentoNoPdv(page, '/admin', ag3!.id)
      // O combinado vem inteiro: o crédito (e as vezes), não só o meio.
      await expect(comanda.locator('[data-forma="CREDIT_CARD"]')).toHaveAttribute('aria-checked', 'true')
      await escolherFormaPorValor(comanda, 'PIX')
      await botaoDeReceber(comanda).click()
      const pergunta = comanda.locator('[data-substitui-contrato]')
      await expect(pergunta).toContainText('já foi assinado para outro pagamento')
      await expect(pergunta).toContainText('crédito')
      // Sem a resposta, nada se gravou.
      expect(await lancamentos()).toEqual([])
      expect((await db().from('issued_documents').select('status').eq('id', c3!.id).single<{ status: string }>()).data!.status).toBe('ASSINADO')

      // "Manter o pagamento combinado" volta ao crédito.
      await pergunta.getByRole('button', { name: 'Manter o pagamento combinado' }).click()
      await expect(pergunta).toHaveCount(0)
      await expect(comanda.locator('[data-forma="CREDIT_CARD"]')).toHaveAttribute('aria-checked', 'true')

      // De novo no Pix, e agora "Substituir o contrato".
      await escolherFormaPorValor(comanda, 'PIX')
      await botaoDeReceber(comanda).click()
      await comanda.locator('[data-substitui-contrato]').getByRole('button', { name: 'Substituir o contrato' }).click()
      await expect.poll(async () => (await lancamentos()).map(l => l.payment_method)).toEqual(['PIX'])
    })
    const antigo = (await db().from('issued_documents').select('status, replaced_by').eq('id', c3!.id).single<{ status: string; replaced_by: string | null }>()).data!
    expect(antigo.status).toBe('SUBSTITUIDO')
    expect(antigo.replaced_by).not.toBeNull()
    const novo = (await db().from('issued_documents').select('status, payment_snapshot, appointment_id').eq('id', antigo.replaced_by!).single()).data!
    expect(novo.appointment_id).toBe(ag3!.id)
    expect(novo.payment_snapshot).toEqual({ forma: 'AVISTA', metodo: 'PIX' })
    // O novo espera a cliente assinar (montado com o combinado de agora).
    await expect.poll(async () => (await db().from('issued_documents').select('status').eq('id', antigo.replaced_by!).single<{ status: string }>()).data!.status).toBe('PENDENTE')
  })

  // D2 da 35ª (CR-01): o crediário SEM entrada vem da tela com `metodo: null` — nada entra agora,
  // nenhuma forma é pedida. O contrato recusava com "Forma de pagamento inválida.".
  test('CR-01: o crediário sem entrada vai ao contrato sem forma; com entrada e sem forma, recusa', async ({ browser }) => {
    const { data: ag4, error: eA } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      scheduled_at: new Date(Date.now() + 4 * 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
    }).select('id').single<{ id: string }>()
    expect(eA).toBeNull()
    const { data: c4 } = await db().from('issued_documents').select('id').eq('appointment_id', ag4!.id).eq('kind', 'CONTRATO').single<{ id: string }>()
    expect(c4, 'o contrato do agendamento nasceu').not.toBeNull()
    const semEntrada = { forma: 'PARCELADO', metodo: null, entrada: 0, parcelas: 2, primeiroVencimento: '2026-12-10T15:00:00.000Z' }
    await como(browser, gestor!.estado, async page => {
      const definir = (p: unknown) => chamarAcao(page, 'actions/documentos.ts', 'definirPagamentoDoContrato', `/admin/clients/${cliente}`, [c4!.id, p])
      expect((await definir(semEntrada)).texto, 'sem entrada, sem forma: passa').toContain('"ok":true')
      expect((await definir({ ...semEntrada, entrada: 30 })).texto).toContain('Forma de pagamento inválida')
    })
    const { data: d } = await db().from('issued_documents').select('payment_snapshot').eq('id', c4!.id).single<{ payment_snapshot: unknown }>()
    expect(d!.payment_snapshot).toEqual({ forma: 'PARCELADO', metodo: null, entrada: 0, parcelas: 2, primeiroVencimento: '2026-12-10' })
  })
})
