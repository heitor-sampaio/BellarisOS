import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { receberPlanoNoPdv } from './apoio/vender'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Bloco Plano de tratamento, LEVA 2 (o plano de adaptação, `docs/revisao.md`,
 * a revisão do Heitor de 2026-11-13).
 *
 * - PT1b: "Aceitar plano" é só "quero fazer" — também PELO APP ("SIm, pode
 *   liberar o aceite pelo app. A cliente recebe o plano no app, analisa e
 *   aceita."). Aceito, os documentos ficam prontos, a comanda do plano nasce no
 *   PDV com o valor inteiro, e a equipe é avisada.
 * - PT1c: o CONTRATO e o pagamento andam juntos, no PDV — "primeiro colhe
 *   assinatura, depois paga".
 * - DC1c/PC9b e DC4: na página do plano, os documentos puxados dos
 *   procedimentos (o termo e os outros; o contrato do procedimento não), cada
 *   um com "Excluir"; nascem na CRIAÇÃO do plano (DC4, "concordo": "o do
 *   pacote e o do plano, na venda/na criação" — a auditoria de 2026-11-18
 *   corrigiu o "no aceite") e acompanham o plano salvo; o contrato de plano
 *   nasce com o pagamento.
 * - PT3: no app, a cliente vê TUDO do plano e agenda as sessões em aberto — a
 *   de plano OU de pacote, mesmo sem o "Permitir auto agendamento".
 * - FD2a/FD2b na comanda do PLANO: os pontos no receber, e o ponto nasce do
 *   que foi pago.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let atende: MembroDeTeste | null = null   // atende na unidade (agenda em Gerenciar)
let balcao: MembroDeTeste | null = null   // recebe (caixa)
let portal: ClienteDeTeste | null = null  // a cliente do app
let procB = ''                             // fora do app, só do pacote
const NOME = {
  termo:    `${PREFIXO} Termo pt2 ${marca}`,
  imagem:   `${PREFIXO} Uso de imagem pt2 ${marca}`,
  fora:     `${PREFIXO} Termo excluivel pt2 ${marca}`,
  contrato: `${PREFIXO} Contrato proc pt2 ${marca}`,
}
const modelos = { termo: '', imagem: '', fora: '', contrato: '', plano: '' }
const DIA = diaEmQueAUnidadeAbre(2)

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function modelo(nome: string, tipo: string, texto: string, usaPagamento = false) {
  const { data, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede!.tenantId, p_modelo: null, p_nome: nome, p_tipo: tipo, p_origem: 'EDITOR',
    p_momento: null, p_exigencia: 'AVISA', p_texto: texto,
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: usaPagamento, p_ator: null,
  })
  expect(error, `criar o modelo ${nome}`).toBeNull()
  return (data as { id: string }).id
}

/** Um plano da cliente, com uma sessão por procedimento (R$ 100 cada). */
async function plano(clienteId: string, status: string, procs: string[], nome = 'Plano'): Promise<{ planId: string; sessoes: string[] }> {
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: atende!.userId, client_id: clienteId, status,
    name: `${PREFIXO} ${nome} ${marca}`, professional_notes: 'ANOTACAO CLINICA PT2',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o plano').toBeNull()
  const sessoes: string[] = []
  for (const [i, proc] of procs.entries()) {
    const { data: s } = await db().from('treatment_plan_sessions').insert({ plan_id: pl!.id, sort_order: i }).select('id').single<{ id: string }>()
    expect((await db().from('treatment_plan_session_procedures').insert({ session_id: s!.id, procedure_id: proc, price: 100, sort_order: 0 })).error).toBeNull()
    sessoes.push(s!.id)
  }
  return { planId: pl!.id, sessoes }
}

const documentosDo = async (planId: string) =>
  ((await db().from('issued_documents').select('id, template_id, kind, status, payment_snapshot')
    .eq('treatment_plan_id', planId).not('status', 'in', '(CANCELADO,SUBSTITUIDO)')).data ?? []) as
    { id: string; template_id: string; kind: string; status: string; payment_snapshot: unknown }[]

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`ptl2${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().rpc('documentos_modelos_padrao', { p_tenant: rede.tenantId })).error).toBeNull()
  modelos.plano = ((await db().from('document_templates').select('id').eq('tenant_id', rede.tenantId).eq('kind', 'CONTRATO_PLANO').eq('is_active', true).single()).data!.id) as string
  modelos.termo = await modelo(NOME.termo, 'TERMO', '# Termo\n\nEu, **{{cliente.nome}}**, autorizo.\n\n[[assinatura]]')
  modelos.imagem = await modelo(NOME.imagem, 'DOCUMENTO', '# Uso de imagem\n\n{{cliente.nome}} autoriza o uso da imagem.\n\n[[assinatura]]')
  modelos.fora = await modelo(NOME.fora, 'TERMO', '# Termo B\n\n{{cliente.nome}} autoriza.\n\n[[assinatura]]')
  modelos.contrato = await modelo(NOME.contrato, 'CONTRATO', '# Contrato\n\n{{cliente.nome}} contrata.\n\n[[assinatura]]')
  // O procedimento A puxa o termo e a autorização de imagem (e tem o contrato
  // do procedimento, que o plano NÃO puxa); fica FORA do app.
  expect((await db().from('procedures').update({
    consent_template_id: modelos.termo, contract_template_id: modelos.contrato, outros_documentos: [modelos.imagem],
    visible_on_client_app: false, price: 100, duration_min: 30,
  }).eq('id', rede.procedureId)).error).toBeNull()
  const { data: b, error: eB } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Proc B ${marca}`, category: 'e2e', duration_min: 30, price: 100,
    consent_template_id: modelos.fora, visible_on_client_app: false,
  }).select('id').single<{ id: string }>()
  expect(eB).toBeNull()
  procB = b!.id
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  atende = await criarMembro(`pt2a${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Atende', atendeEm: [rede.branchId],
    // Monta o plano pelo Atendimento em Gerenciar (UM3, o Heitor, 2026-11-23), não pelo "Atende".
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'atendimento', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  balcao = await criarMembro(`pt2b${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  portal = await clienteComSessao(`pt2c${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  expect((await db().from('clients').update({ document: '52998224725' }).eq('id', portal.clientId)).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    await db().from('treatment_plan_sessions').update({ appointment_id: null }).in('plan_id',
      ((await db().from('treatment_plans').select('id').eq('branch_id', rede.branchId)).data ?? []).map(p => p.id as string))
  }
  await atende?.limpar(); await balcao?.limpar(); await portal?.limpar()
  await rede?.limpar()
})

test('PT1b: a cliente aceita o plano PELO APP — a comanda nasce no PDV, os documentos ficam prontos (o contrato, não) e a equipe é avisada', async ({ browser }) => {
  const { planId } = await plano(portal!.clientId, 'PROPOSED', [rede!.procedureId], 'Pelo app')
  await como(browser, portal!.estado, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const cartao = p.locator('[data-plano-proposto]')
    await expect(cartao).toBeVisible()
    await expect(cartao).not.toContainText('O aceite é feito na clínica')
    await cartao.getByRole('link', { name: 'Ver o plano' }).click()
    await expect(p).toHaveURL(new RegExp(`/cliente/planos/${planId}`))
    // Nada clínico vai ao app (a anotação da profissional).
    await expect(p.getByText('ANOTACAO CLINICA PT2')).toHaveCount(0)
    await p.getByRole('button', { name: 'Aceitar o plano' }).click()
    await expect(p.locator('[data-plano-aceito-no-app]')).toBeVisible({ timeout: 20_000 })
  })
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status).toBe('ACCEPTED')
  const { data: comandas } = await db().from('comandas').select('origem, cancelada_em').eq('treatment_plan_id', planId)
  expect(comandas ?? [], 'a comanda do plano nasceu no PDV').toHaveLength(1)
  expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data ?? [], 'o aceite não lança dinheiro').toHaveLength(0)
  const docs = await documentosDo(planId)
  expect(docs.map(d => d.template_id).sort(), 'o termo e o outro documento ficam prontos').toEqual([modelos.termo, modelos.imagem].sort())
  expect(docs.some(d => d.kind === 'CONTRATO_PLANO'), 'o contrato de plano sai no PDV, com o pagamento').toBe(false)
  // A equipe da unidade é avisada: quem atende ali (a agenda em Gerenciar) e quem recebe.
  await expect.poll(async () => ((await db().from('user_notifications').select('user_id, type')
    .in('user_id', [atende!.userId, balcao!.userId]).eq('type', 'plano_aceito')).data ?? []).map(n => n.user_id).sort(),
  { timeout: 15_000 }).toEqual([atende!.userId, balcao!.userId].sort())
})

test('PT1b: pelo app, a cliente só aceita o plano DELA, e só o proposto', async ({ browser }) => {
  const outra = await rede!.criarCliente('Outra')
  const alheio = (await plano(outra, 'PROPOSED', [rede!.procedureId], 'Alheio')).planId
  const rascunho = (await plano(portal!.clientId, 'DRAFT', [rede!.procedureId], 'Rascunho')).planId
  const meu = (await plano(portal!.clientId, 'PROPOSED', [rede!.procedureId], 'Meu')).planId
  await como(browser, portal!.estado, async p => {
    await p.goto(`/${slug}/cliente/planos/${meu}`)
    for (const id of [alheio, rascunho]) {
      await chamarAcao(p, 'actions/plano-da-cliente.ts', 'aceitarPlanoPelaCliente', `/${slug}/cliente/planos/${meu}`, [id])
    }
    // A página de outro plano não abre. A seção tem o seu loading.tsx (o
    // esqueleto; tests/loading-fora-do-catch-all), e com ele o notFound() sai
    // em streaming — o status pode ser 200; a tela é a de não encontrada (o
    // mesmo critério de documentos-portal.spec).
    const r = await p.goto(`/${slug}/cliente/planos/${alheio}`)
    if (r?.status() !== 404) await expect(p.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
    await expect(p.getByText('Alheio')).toHaveCount(0)
  })
  const st = async (id: string) => (await db().from('treatment_plans').select('status').eq('id', id).single()).data!.status
  expect(await st(alheio), 'o plano de outra cliente não muda').toBe('PROPOSED')
  expect(await st(rascunho), 'o rascunho não se aceita pelo app').toBe('DRAFT')
})

test('DC1c/PC9b + DC4: a página do plano lista os documentos puxados com "Excluir"; nascem antes do aceite, e o excluído sai', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Documentos')
  const { planId } = await plano(cliente, 'PROPOSED', [rede!.procedureId, procB], 'Docs')
  await como(browser, atende!.estado, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    const bloco = p.locator('[data-documentos-do-plano]')
    await expect(bloco).toBeVisible()
    // Quando o contrato nasce mora na dica da linha dele (2026-11-16).
    await bloco.getByRole('button', { name: 'Quando nasce o contrato do plano' }).hover()
    await expect(bloco.locator('[data-contrato-do-plano]')).toContainText('PDV')
    await p.mouse.move(0, 0)
    for (const nome of [NOME.termo, NOME.imagem, NOME.fora]) await expect(bloco.locator('[data-puxado]', { hasText: nome })).toHaveCount(1)
    await expect(bloco.locator('[data-puxado]', { hasText: NOME.contrato }), 'o contrato do procedimento não vem ao plano').toHaveCount(0)
    await bloco.locator('[data-puxado]', { hasText: NOME.fora }).getByRole('button', { name: 'Excluir' }).click()
    await expect(bloco.locator('[data-puxado]', { hasText: NOME.fora })).toContainText('Fora do plano')
  })
  await expect.poll(async () => (await db().from('treatment_plans').select('documentos_excluidos').eq('id', planId).single()).data!.documentos_excluidos)
    .toEqual([modelos.fora])
  // DC4: o plano salvo já tem os documentos — ANTES do aceite —, sem o excluído.
  await expect.poll(async () => (await documentosDo(planId)).map(d => d.template_id).sort(), 'nascem antes do aceite os que ficaram')
    .toEqual([modelos.termo, modelos.imagem].sort())
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status, 'o plano segue proposto').toBe('PROPOSED')
  await como(browser, atende!.estado, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    // Incluir de novo: nasce; excluir outra vez: o aberto é cancelado.
    await chamarAcao(p, 'actions/treatment-plans.ts', 'salvarDocumentosExcluidosDoPlano', `/${slug}/planejamentos/${planId}`, [planId, []])
    expect((await documentosDo(planId)).map(d => d.template_id).sort(), 'o incluído de novo nasce').toEqual([modelos.termo, modelos.imagem, modelos.fora].sort())
    await chamarAcao(p, 'actions/treatment-plans.ts', 'salvarDocumentosExcluidosDoPlano', `/${slug}/planejamentos/${planId}`, [planId, [modelos.fora]])
    await chamarAcao(p, 'actions/treatment-plans.ts', 'aceitarPlano', `/${slug}/planejamentos/${planId}`, [planId])
  })
  const docs = await documentosDo(planId)
  expect(docs.map(d => d.template_id).sort(), 'o aceite não muda os que ficaram').toEqual([modelos.termo, modelos.imagem].sort())
})

test('PT1c: o contrato de plano nasce no PDV com a forma, e o PDV não recebe sem ele assinado ou dispensado', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Contrato')
  const { planId } = await plano(cliente, 'PROPOSED', [rede!.procedureId], 'Contrato')
  const pix = { forma: 'AVISTA', metodo: 'PIX' }
  await como(browser, balcao!.estado, async p => {
    await receberPlanoNoPdv(p, `/${slug}`, planId)
    expect((await documentosDo(planId)).some(d => d.kind === 'CONTRATO_PLANO'), 'antes da forma, nenhum contrato').toBe(false)
    await chamarAcao(p, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', `/${slug}/pdv`, [planId, pix, null, {}])
    const contrato = (await documentosDo(planId)).find(d => d.kind === 'CONTRATO_PLANO')
    expect(contrato, 'o contrato nasce com a forma escolhida').toBeTruthy()
    expect(contrato!.payment_snapshot, 'e cita o pagamento').toBeTruthy()
    const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', `/${slug}/pdv`, [planId, pix, [], slug])
    expect(r.texto).toContain('Falta assinar')
    expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data ?? [], 'sem o contrato, nada de dinheiro').toHaveLength(0)
    // Dispensado com motivo, recebe.
    expect((await db().from('issued_documents').update({ status: 'DISPENSADO', closed_reason: 'Assinou no papel', closed_at: new Date().toISOString() })
      .eq('id', contrato!.id)).error).toBeNull()
    await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', `/${slug}/pdv`, [planId, pix, [], slug])
  })
  expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data ?? []).toHaveLength(1)
})

test('PT3: no app, a cliente vê TUDO do plano — as sessões, os pagamentos e os documentos assinados — e agenda a sessão em aberto, mesmo sem o "Permitir auto agendamento"', async ({ browser }) => {
  const { planId, sessoes } = await plano(portal!.clientId, 'ACCEPTED', [rede!.procedureId, rede!.procedureId], 'Tudo')
  // A sessão 1 feita; um pagamento recebido; um documento assinado.
  const { data: feita } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: portal!.clientId, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
    scheduled_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), completed_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    duration_min: 30, price: 100, status: 'COMPLETED', treatment_plan_id: planId,
  }).select('id').single<{ id: string }>()
  await db().from('treatment_plan_sessions').update({ appointment_id: feita!.id }).eq('id', sessoes[0]!)
  expect((await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: portal!.clientId, treatment_plan_id: planId, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento', amount: 200, is_paid: true, payment_method: 'PIX', paid_at: new Date().toISOString(), created_by: 'e2e',
  })).error).toBeNull()
  const versao = (await db().from('document_template_versions').select('id').eq('template_id', modelos.termo)
    .order('version', { ascending: false }).limit(1).single<{ id: string }>()).data!.id
  expect((await db().from('issued_documents').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: portal!.clientId, treatment_plan_id: planId,
    template_id: modelos.termo, template_version_id: versao, kind: 'TERMO', source: 'EDITOR', title: NOME.termo,
    moment: 'FECHAMENTO_PLANO', enforcement: 'AVISA', status: 'ASSINADO', signed_at: new Date().toISOString(),
  })).error).toBeNull()

  await como(browser, portal!.estado, async p => {
    await p.goto(`/${slug}/cliente/planos/${planId}`)
    const linhas = p.locator('[data-sessao-do-plano]')
    await expect(linhas).toHaveCount(2)
    await expect(linhas.nth(0)).toContainText('Feita')
    await expect(linhas.nth(1)).toContainText('A agendar')
    await expect(p.locator('[data-pagamento-do-plano]')).toContainText('Pago')
    await expect(p.locator('[data-pagamento-do-plano]')).toContainText('200,00')
    await expect(p.locator('[data-documento-do-plano]', { hasText: NOME.termo })).toContainText('Assinado')
    await expect(p.getByText('ANOTACAO CLINICA PT2')).toHaveCount(0)
    // A sessão em aberto se agenda pelo app — o procedimento está fora do app.
    // O agendar usa a sessão livre do plano aceito MAIS ANTIGO (pagoParaAgendar):
    // o plano aceito pelo app no primeiro teste fica fora desta conta.
    expect((await db().from('treatment_plans').update({ status: 'CANCELLED' })
      .eq('client_id', portal!.clientId).eq('status', 'ACCEPTED').neq('id', planId)).error).toBeNull()
    await linhas.nth(1).getByRole('link', { name: 'Agendar' }).click()
    await expect(p).toHaveURL(new RegExp(`/cliente/agendamentos/novo\\?procedimento=${rede!.procedureId}`))
    const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
      branchId: rede!.branchId, procedureId: rede!.procedureId, professionalId: rede!.professionalId,
      scheduledAt: new Date(`${DIA}T10:00:00-03:00`).toISOString(), slug,
    }])
    const id = /"id":"([0-9a-f-]{36})"/.exec(r.texto)?.[1]
    expect(id, `agendou: ${r.texto.slice(0, 300)}`).toBeTruthy()
    expect((await db().from('treatment_plan_sessions').select('appointment_id').eq('id', sessoes[1]!).single()).data!.appointment_id,
      'a sessão do plano ficou com o agendamento').toBe(id)
  })
})

test('PT3: a sessão de PACOTE também se agenda pelo app sem o "Permitir auto agendamento"; o avulso fora do app, não', async ({ browser }) => {
  const agendar = (p: Page, hora: string) => chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
    branchId: rede!.branchId, procedureId: procB, professionalId: rede!.professionalId,
    scheduledAt: new Date(`${DIA}T${hora}:00-03:00`).toISOString(), slug,
  }])
  const doProcB = async () => ((await db().from('appointments').select('id').eq('client_id', portal!.clientId).eq('procedure_id', procB)).data ?? [])
  await como(browser, portal!.estado, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/novo`)
    const avulso = await agendar(p, '14:00')
    expect(avulso.texto).toContain('Procedimento não disponível')
  })
  expect(await doProcB(), 'fora do app e sem nada pago: não agenda').toHaveLength(0)

  const { data: sp } = await db().from('service_packages').insert({
    tenant_id: rede!.tenantId, procedure_id: procB, name: `${PREFIXO} Pacote B ${marca}`, total_sessions: 2, price: 180,
  }).select('id').single<{ id: string }>()
  const { data: cp, error: eCp } = await db().from('client_packages').insert({
    client_id: portal!.clientId, package_id: sp!.id, branch_id: rede!.branchId, total_sessions: 2, price: 180, de_fora: true,
  }).select('id').single<{ id: string }>()
  expect(eCp).toBeNull()
  expect((await db().from('package_sessions').insert([
    { client_package_id: cp!.id, session_number: 1, procedure_id: procB, preco: 90 },
    { client_package_id: cp!.id, session_number: 2, procedure_id: procB, preco: 90 },
  ])).error).toBeNull()

  await como(browser, portal!.estado, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/novo?procedimento=${procB}`)
    // O procedimento vem pré-escolhido (o assistente só pula para o passo do
    // profissional quando ele está na lista do app): é a prova de que a
    // sessão comprada entrou sem o "Permitir auto agendamento".
    await expect(p.getByText('Tem preferência de profissional?')).toBeVisible()
    const r = await agendar(p, '15:00')
    expect(/"id":"([0-9a-f-]{36})"/.exec(r.texto)?.[1], `agendou: ${r.texto.slice(0, 300)}`).toBeTruthy()
  })
  const ag = await doProcB()
  expect(ag, 'a sessão do pacote se agenda pelo app').toHaveLength(1)
  const { data: ligada } = await db().from('package_sessions').select('appointment_id').eq('client_package_id', cp!.id).eq('session_number', 1).single()
  expect(ligada!.appointment_id, 'ligada ao pacote').toBe(ag[0]!.id)
})

test('FD2a/FD2b na comanda do PLANO: os pontos no receber, e o ponto nasce do que foi pago', async ({ browser }) => {
  expect((await db().from('loyalty_configs').upsert({
    tenant_id: rede!.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1,
    redeem_points_value: 0.1, redeem_min_points: 0, redeem_max_pct: 100,
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  const cliente = await rede!.criarCliente('Pontos')
  expect((await db().rpc('ajustar_pontos', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_unidade: rede!.branchId, p_pontos: 100, p_motivo: 'saldo do teste', p_ator: 'e2e',
  })).error).toBeNull()
  const { planId } = await plano(cliente, 'PROPOSED', [rede!.procedureId], 'Pontos')
  // O contrato dispensado: o teste é dos pontos.
  const versao = (await db().from('document_template_versions').select('id').eq('template_id', modelos.plano)
    .order('version', { ascending: false }).limit(1).single<{ id: string }>()).data!.id
  expect((await db().from('issued_documents').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: planId,
    template_id: modelos.plano, template_version_id: versao, kind: 'CONTRATO_PLANO', source: 'EDITOR', title: 'Contrato',
    moment: 'FECHAMENTO_PLANO', enforcement: 'BLOQUEIA', status: 'DISPENSADO', closed_reason: 'e2e', closed_at: new Date().toISOString(),
  })).error).toBeNull()

  await como(browser, balcao!.estado, async p => {
    const janela = await receberPlanoNoPdv(p, `/${slug}`, planId)
    await janela.getByRole('button', { name: /Confirmar plano/ }).click()
    await janela.getByRole('radio', { name: 'Pix', exact: true }).click()
    const bloco = janela.locator('[data-pontos-da-venda]')
    await expect(bloco, 'a comanda do plano oferece os pontos').toBeVisible()
    await expect(bloco).toContainText('100')
    await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', `/${slug}/pdv`,
      [planId, { forma: 'AVISTA', metodo: 'PIX' }, [], slug, null, null, { pontos: 100, voucherId: null }])
  })
  const { data: fts } = await db().from('financial_transactions').select('id, amount, loyalty_discount, is_paid').eq('treatment_plan_id', planId)
  expect(fts ?? []).toHaveLength(1)
  expect(Number(fts![0]!.amount), 'R$ 100 menos 100 pontos × R$ 0,10').toBe(90)
  expect(Number(fts![0]!.loyalty_discount)).toBe(10)
  expect(fts![0]!.is_paid).toBe(true)
  const { data: mov } = await db().from('loyalty_transactions').select('kind, points').eq('transaction_id', fts![0]!.id)
  const por = Object.fromEntries((mov ?? []).map(m => [m.kind, m.points]))
  expect(por.RESGATE, 'os pontos usados saem').toBe(-100)
  expect(por.GANHO, 'o ponto nasce do que foi pago (R$ 90)').toBe(90)
})
