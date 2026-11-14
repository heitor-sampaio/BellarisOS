import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { abrirVendaNoPdv } from './apoio/vender'
import { responderAnamneseDoAgendamento } from './apoio/anamnese'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Bloco Plano de tratamento, LEVA 1 (o plano de adaptação, `docs/revisao.md`,
 * a revisão do Heitor de 2026-11-13).
 *
 * - PT2: "quem monta o plano é quem atende, nem precisa de permissão pra isso
 *   pq isso é proprio atendimento, faz parte" — e "a dra pode realizar a
 *   avaliação e depois com calma montar o plano". Quem atende é o "Atende" da
 *   unidade (`users.atende_em`); sai o Prontuário em Gerenciar da trava. A
 *   anotação clínica dentro do plano continua do Prontuário.
 * - PT1a: a página do plano é o centro, com os passos à vista: ① Aceite
 *   ② Documentos ③ Contrato e pagamento ④ Sessões.
 * - PT1d: [Agendar] em cada sessão e "Agendar todas", a qualquer momento
 *   depois do aceite.
 * - PT1e: a sessão não cobra nada; a parcela que venceu aparece no PDV.
 * - PT1f: Tratamentos filtra pela situação.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let atende: MembroDeTeste | null = null       // ATENDE na unidade; sem o Prontuário
let soProntuario: MembroDeTeste | null = null  // Prontuário em Gerenciar; não atende
let balcao: MembroDeTeste | null = null        // recebe (caixa)
let dela: MembroDeTeste | null = null          // agenda "só os meus", atende na unidade
let nomeDoProcedimento = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const sessoes = (procedureId: string, price = 80) => [{ procedures: [{ procedureId, price }] }]

async function planoAceito(rotulo: string): Promise<{ planId: string; clientId: string; sessaoId: string }> {
  const { planId, clientId } = await rede!.criarPlanoProposto(rotulo, { semTermo: true })
  const { error } = await db().from('treatment_plans').update({ status: 'ACCEPTED', aceito_em: new Date().toISOString() }).eq('id', planId)
  expect(error).toBeNull()
  const { data: s } = await db().from('treatment_plan_sessions').select('id').eq('plan_id', planId).single<{ id: string }>()
  return { planId, clientId, sessaoId: s!.id }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ptl1${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  nomeDoProcedimento = (await db().from('procedures').select('name').eq('id', rede.procedureId).single<{ name: string }>()).data!.name
  atende = await criarMembro(`ptla${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Atende', atendeEm: [rede.branchId],
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  soProntuario = await criarMembro(`ptlp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Prontuário',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  balcao = await criarMembro(`ptlb${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  dela = await criarMembro(`ptld${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Só os meus', atendeEm: [rede.branchId],
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
  await atende?.limpar(); await soProntuario?.limpar(); await balcao?.limpar(); await dela?.limpar()
  await rede?.limpar()
})

test('PT2: monta quem ATENDE — o "Novo plano" e a gravação não pedem o Prontuário em Gerenciar', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Monta')

  // Quem atende vê o "Novo plano" no menu Tratamentos e na ficha, e grava.
  await como(atende!, browser, async p => {
    await p.goto(`/${slug}/planejamentos`)
    await expect(p.getByRole('button', { name: 'Novo plano' })).toBeVisible()
    await p.goto(`/${slug}/clients/${cliente}?aba=planejamento`)
    await expect(p.getByRole('button', { name: 'Novo plano' })).toBeVisible()
    // A anotação clínica é do Prontuário: o editor não a oferece a quem não o tem.
    await p.getByRole('button', { name: 'Novo plano' }).click()
    await expect(p.getByLabel('Observações da profissional')).toHaveCount(0)
    await chamarAcao(p, 'actions/treatment-plans.ts', 'salvarPlanoNovo', `/${slug}/clients/${cliente}`,
      [cliente, rede!.branchId, null, sessoes(rede!.procedureId), 'anotação que ela não pode escrever'])
  })
  const { data: dela1 } = await db().from('treatment_plans').select('id, professional_id, professional_notes')
    .eq('client_id', cliente)
  expect(dela1 ?? [], 'quem atende montou o plano').toHaveLength(1)
  expect(dela1![0]!.professional_id).toBe(atende!.userId)
  expect(dela1![0]!.professional_notes, 'a anotação clínica não se grava sem o Prontuário').toBeNull()

  // Quem só tem o Prontuário (e não atende) não monta: nem o botão, nem a action.
  await como(soProntuario!, browser, async p => {
    await p.goto(`/${slug}/planejamentos`)
    await expect(p.getByRole('heading', { name: 'Tratamentos' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Novo plano' })).toHaveCount(0)
    await expect(p.locator('[data-quem-monta]')).toContainText(/atende/i)
    const nome = `${PREFIXO} não monta ${marca}`
    await chamarAcao(p, 'actions/treatment-plans.ts', 'criarPlanoDoCliente', `/${slug}/planejamentos`,
      [cliente, rede!.branchId, null, nome])
    const { data } = await db().from('treatment_plans').select('id').eq('name', nome)
    expect(data ?? [], 'quem não atende não cria plano pela action').toHaveLength(0)
  })
})

test('PT2: quem atende, sem o Prontuário, salva o plano sem apagar a anotação clínica de quem a escreveu', async ({ browser }) => {
  const { planId } = await rede!.criarPlanoProposto('Anotação', { semTermo: true })
  await db().from('treatment_plans').update({ status: 'DRAFT', professional_notes: 'Anotação clínica' }).eq('id', planId)
  await como(atende!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await expect(p.getByLabel('Observações da profissional')).toHaveCount(0)
    await chamarAcao(p, 'actions/treatment-plans.ts', 'salvarPlanoDoCliente', `/${slug}/planejamentos/${planId}`,
      [planId, sessoes(rede!.procedureId, 120), ''])
  })
  const { data } = await db().from('treatment_plans').select('professional_notes').eq('id', planId).single<{ professional_notes: string | null }>()
  expect(data!.professional_notes).toBe('Anotação clínica')
  const { data: preco } = await db().from('treatment_plan_sessions').select('treatment_plan_session_procedures(price)').eq('plan_id', planId)
  expect(Number((preco![0] as unknown as { treatment_plan_session_procedures: { price: number }[] }).treatment_plan_session_procedures[0]!.price),
    'as sessões ela grava').toBe(120)
})

test('PT2: "Montar plano desta avaliação" na avaliação concluída — por quem atende, ligado a ela', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Avaliada')
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: atende!.userId, procedure_id: rede!.procedureId,
    scheduled_at: new Date(Date.now() - 2 * 3600_000).toISOString(), duration_min: 30, price: 0, status: 'COMPLETED',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await responderAnamneseDoAgendamento(ag!.id, rede!.tenantId)
  await como(atende!, browser, async p => {
    await p.goto(`/${slug}/agenda/${ag!.id}`)
    await expect(p.locator('[data-montar-plano-da-avaliacao]')).toContainText('Montar plano desta avaliação')
    await chamarAcao(p, 'actions/treatment-plans.ts', 'generateEvaluationPlan', `/${slug}/agenda/${ag!.id}`,
      [ag!.id, '', null, sessoes(rede!.procedureId), '', '', '', slug, null, {}])
  })
  const { data: planos } = await db().from('treatment_plans').select('id, status, evaluation_appointment_id').eq('client_id', cliente)
  expect(planos ?? [], 'o plano nasceu da avaliação concluída').toHaveLength(1)
  expect(planos![0]).toMatchObject({ status: 'PROPOSED', evaluation_appointment_id: ag!.id })
})

test('PT1a: a página do plano mostra os quatro passos, e cada um leva aonde se faz', async ({ browser }) => {
  const { planId } = await rede!.criarPlanoProposto('Passos', { semTermo: true })
  await como(atende!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    const passos = p.locator('[data-passos-do-plano]')
    await expect(passos.locator('[data-passo]')).toHaveCount(4)
    await expect(passos.locator('[data-passo="aceite"]')).toContainText('Aceite')
    await expect(passos.locator('[data-passo="aceite"]')).toContainText('Falta aceitar')
    await expect(passos.locator('[data-passo="documentos"]')).toContainText('Documentos')
    await expect(passos.locator('[data-passo="pagamento"]')).toContainText('Contrato e pagamento')
    await expect(passos.locator('[data-passo="sessoes"]')).toContainText('Sessões')
    await expect(passos.locator('[data-passo="sessoes"]')).toContainText('depois do aceite')
    // O aceite é ali mesmo.
    await passos.locator('[data-passo="aceite"]').getByRole('button', { name: 'Aceitar plano' }).click()
    await expect(passos.locator('[data-passo="aceite"]')).toContainText('Aceito')
    await expect(passos.locator('[data-passo="pagamento"] [data-plano-falta-receber]')).toContainText('PDV')
    await expect(passos.locator('[data-passo="sessoes"]')).toContainText('0 de 1 agendada')
  })
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status).toBe('ACCEPTED')
  const { data: comanda } = await db().from('comandas').select('id').eq('treatment_plan_id', planId).single<{ id: string }>()
  // Quem recebe vai do passo ③ à comanda do plano no PDV.
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    const receber = p.locator('[data-passo="pagamento"]').getByRole('link', { name: 'Receber no PDV' })
    await expect(receber).toHaveAttribute('href', new RegExp(`/pdv\\?unidade=${rede!.branchId}&comanda=${comanda!.id}`))
  })
})

test('PT1d: depois do aceite, "Agendar todas" abre o agendar da sessão com a cliente, o procedimento e a duração', async ({ browser }) => {
  const { planId, sessaoId } = await planoAceito('Agendar')
  const dia = diaEmQueAUnidadeAbre(2)
  await como(atende!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    const sessoesDoPasso = p.locator('[data-passo="sessoes"]')
    await expect(sessoesDoPasso.locator('[data-sessao-do-plano]')).toHaveCount(1)
    await expect(sessoesDoPasso.locator('[data-sessao-do-plano]').getByRole('button', { name: 'Agendar' })).toBeVisible()
    await sessoesDoPasso.getByRole('button', { name: 'Agendar todas' }).click()
    const agendar = p.locator('[data-agendar-sessao]')
    await expect(agendar.locator('[data-procedimento-da-sessao]')).toContainText(nomeDoProcedimento)
    // O nome do membro é "[e2e] Atende ptla<marca>" (criarMembro).
    const quem = agendar.getByLabel('Profissional').locator('option', { hasText: `Atende ptla${marca}` })
    await expect(quem).toHaveCount(1)
    await agendar.getByLabel('Profissional').selectOption(await quem.getAttribute('value') ?? '')
    await agendar.getByLabel('Data').fill(dia)
    await agendar.getByLabel('Outro horário (encaixe)').fill('10:00')
    await agendar.getByRole('button', { name: 'Confirmar agendamento' }).click()
    await expect(agendar).toHaveCount(0, { timeout: 20_000 })
  })
  const { data: s } = await db().from('treatment_plan_sessions').select('appointment_id').eq('id', sessaoId).single<{ appointment_id: string | null }>()
  expect(s!.appointment_id, 'a sessão ficou agendada').toBeTruthy()
  const { data: a } = await db().from('appointments').select('treatment_plan_id, client_id, procedure_id, price')
    .eq('id', s!.appointment_id!).single<{ treatment_plan_id: string; procedure_id: string; price: number }>()
  expect(a).toMatchObject({ treatment_plan_id: planId, procedure_id: rede!.procedureId })
  expect(Number(a!.price), 'o preço é o da sessão do plano').toBe(50)

  // Antes do aceite, não há o que agendar.
  const { planId: proposto } = await rede!.criarPlanoProposto('Sem aceite', { semTermo: true })
  await como(atende!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${proposto}`)
    await expect(p.locator('[data-passo="sessoes"]')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Agendar todas' })).toHaveCount(0)
  })
})

test('PT1e: a sessão do plano não cobra nada; a parcela que venceu aparece no PDV', async ({ browser }) => {
  const { planId, clientId, sessaoId } = await planoAceito('Parcela')
  const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const { error: eTx } = await db().from('financial_transactions').insert([
    { branch_id: rede!.branchId, client_id: clientId, treatment_plan_id: planId, type: 'INCOME', category: 'Serviços',
      description: `${PREFIXO} entrada ${marca}`, amount: 20, is_paid: true, payment_method: 'PIX', created_by: 'e2e' },
    { branch_id: rede!.branchId, client_id: clientId, treatment_plan_id: planId, type: 'INCOME', category: 'Serviços',
      description: `${PREFIXO} parcela ${marca}`, amount: 30, is_paid: false, due_date: ontem, parcela_numero: 2, parcela_total: 2, created_by: 'e2e' },
  ])
  expect(eTx).toBeNull()
  // A sessão agendada e iniciada (a comanda do atendimento nasce ao iniciar).
  await como(atende!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await chamarAcao(p, 'actions/appointments.ts', 'schedulePlanSession', `/${slug}/planejamentos/${planId}`, [{
      planId, sessionId: sessaoId, branchId: rede!.branchId, professionalId: atende!.userId,
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(), clientId, procedureId: rede!.procedureId,
      price: 0, durationMin: 30, slug,
    }])
  })
  const { data: s } = await db().from('treatment_plan_sessions').select('appointment_id').eq('id', sessaoId).single<{ appointment_id: string | null }>()
  expect(s!.appointment_id).toBeTruthy()
  await db().from('appointments').update({ status: 'IN_PROGRESS' }).eq('id', s!.appointment_id!)
  const { data: comandaDaSessao } = await db().from('comandas').select('id').eq('appointment_id', s!.appointment_id!)
  expect(comandaDaSessao ?? [], 'a sessão do plano não abre comanda: não cobra nada').toHaveLength(0)

  await como(balcao!, browser, async p => {
    const venda = await abrirVendaNoPdv(p, `/${slug}`, clientId)
    const parcela = venda.locator('[data-parcela-em-aberto]')
    await expect(parcela).toHaveCount(1)
    await expect(parcela).toContainText(/Parcela 2 de 2/)
    await expect(parcela).toContainText(/Vencida/)
  })
})

test('PT1f: Tratamentos filtra por situação — Proposto, Aceito (falta assinar), Falta pagar, Em andamento, Concluído, Cancelado', async ({ browser }) => {
  const proposto = (await rede!.criarPlanoProposto('Fp', { semTermo: true })).planId
  const faltaAssinar = (await planoAceito('Fa')).planId
  const faltaPagar = await planoAceito('Fg')
  const andamento = await planoAceito('Fe')
  const concluido = (await planoAceito('Fc')).planId
  const cancelado = (await planoAceito('Fx')).planId
  await db().from('treatment_plans').update({ status: 'COMPLETED' }).eq('id', concluido)
  await db().from('treatment_plans').update({ status: 'CANCELLED', cancelado_em: new Date().toISOString() }).eq('id', cancelado)

  // O contrato de plano da rede (a rede de verdade nasce com ele; a de teste o
  // semeia aqui): assinado no "falta pagar", por emitir no "falta assinar".
  expect((await db().rpc('documentos_modelos_padrao', { p_tenant: rede!.tenantId })).error).toBeNull()
  const { data: modelo } = await db().from('document_templates').select('id')
    .eq('tenant_id', rede!.tenantId).eq('kind', 'CONTRATO_PLANO').eq('is_active', true).limit(1).maybeSingle<{ id: string }>()
  expect(modelo, 'a rede tem o contrato de plano ativo').toBeTruthy()
  const versao = (await db().from('document_template_versions').select('id').eq('template_id', modelo!.id)
    .order('version', { ascending: false }).limit(1).single<{ id: string }>()).data!.id
  const { error: eDoc } = await db().from('issued_documents').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: faltaPagar.clientId, treatment_plan_id: faltaPagar.planId,
    template_id: modelo!.id, template_version_id: versao, kind: 'CONTRATO_PLANO', source: 'EDITOR', title: `${PREFIXO} contrato ${marca}`,
    moment: 'FECHAMENTO_PLANO', enforcement: 'BLOQUEIA', status: 'ASSINADO', signed_at: new Date().toISOString(),
  })
  expect(eDoc).toBeNull()
  // O recebido: um lançamento vivo do plano.
  expect((await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: andamento.clientId, treatment_plan_id: andamento.planId, type: 'INCOME', category: 'Serviços',
    description: `${PREFIXO} recebido ${marca}`, amount: 50, is_paid: true, payment_method: 'PIX', created_by: 'e2e',
  })).error).toBeNull()

  const casos: [string, string][] = [
    ['Proposto', proposto], ['Aceito (falta assinar)', faltaAssinar], ['Falta pagar', faltaPagar.planId],
    ['Em andamento', andamento.planId], ['Concluído', concluido], ['Cancelado', cancelado],
  ]
  await como(atende!, browser, async p => {
    await p.goto(`/${slug}/planejamentos`)
    const filtro = p.getByLabel('Filtrar por situação do plano')
    // A rede tem os planos dos outros testes também: a prova é cada um na
    // SUA situação, e nenhum dos outros cinco junto dele.
    for (const [rotulo, id] of casos) {
      await filtro.selectOption({ label: rotulo })
      await expect(p.locator(`[data-plano-da-lista][href$="/${id}"]`), `${rotulo}: o plano dele aparece`).toHaveCount(1)
      await expect(p.locator(`[data-plano-da-lista][href$="/${id}"]`)).toContainText(rotulo)
      for (const [outro, idDoOutro] of casos) {
        if (idDoOutro !== id) await expect(p.locator(`[data-plano-da-lista][href$="/${idDoOutro}"]`), `${rotulo}: sem o "${outro}"`).toHaveCount(0)
      }
    }
  })
})

test('"Só os meus": os passos do plano de quem ela não atende não abrem — pelo id também', async ({ browser }) => {
  const { planId, clientId } = await rede!.criarPlanoProposto('Alheio', { semTermo: true })
  await como(dela!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await expect(p.getByText('Plano não encontrado.')).toBeVisible()
    await expect(p.locator('[data-passos-do-plano]')).toHaveCount(0)
    const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'aceitarPlano', `/${slug}/planejamentos/${planId}`, [planId])
    expect(r.texto).toContain('Plano não encontrado')
  })
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status, 'nada mudou').toBe('PROPOSED')
  // Controle: a cliente que ela atende — o plano é dela também.
  await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, professional_id: dela!.userId, procedure_id: rede!.procedureId,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED',
  })
  await como(dela!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await expect(p.locator('[data-passos-do-plano] [data-passo]')).toHaveCount(4)
  })
})
