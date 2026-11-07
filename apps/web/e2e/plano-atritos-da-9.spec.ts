import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * O plano e o pacote da 9ª simulação (F41), numa rede [e2e] própria.
 *
 * O plano FECHADO da Luana alterna criolipólise (R$ 585, 60 min, só a clínica
 * marca) e drenagem (R$ 144, 50 min, no app): a sessão 1 feita, a 2 e a 3 a
 * agendar, entrada paga e uma parcela a vencer.
 *
 * - D5: a sessão do plano grava o preço e a duração DELA (a drenagem a R$ 144 e
 *   50 min), mesmo que a tela mande os da sessão vizinha — o servidor lê a sessão.
 * - A18: o "+ Agendar" da ficha oferece a sessão do plano no "Já pago" (como o
 *   pacote), e o cartão "Tratamento em andamento" diz que abre.
 * - A28: o rodapé do plano fechado diz a quem a recepção (sem o Financeiro) pede
 *   a parcela que vence depois.
 * - A35: o checkout avisa, antes de emitir, que o contrato vai sem o documento
 *   da cliente (sem recusar — princípio 2).
 * - A36: reabrir o checkout com o contrato assinado traz o pagamento assinado
 *   e diz que mudar as condições pede um contrato novo (princípio 3).
 * - A47: no app, cada sessão "A agendar" diz se a cliente marca pelo app ou se
 *   quem marca é a clínica.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let crio = ''
let drenagem = ''
let plano = ''
const sessoes: string[] = []
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()

async function comSessao<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um plano PROPOSTO de uma sessão de drenagem, para uma cliente nova (sem CPF). */
async function planoProposto(rotulo: string) {
  const clientId = await rede!.criarCliente(`Cliente ${rotulo}`)
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: clientId,
    status: 'PROPOSED', name: `${PREFIXO} Plano ${rotulo} ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: s } = await db().from('treatment_plan_sessions').insert({ plan_id: pl!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect((await db().from('treatment_plan_session_procedures').insert({ session_id: s!.id, procedure_id: drenagem, price: 144 })).error).toBeNull()
  return { planId: pl!.id, clientId }
}

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
  rede = await criarOutraRede(`pla9${marca}`)
  crio = rede.procedureId
  expect((await db().from('procedures').update({ name: `${PREFIXO} Criolipólise ${marca}`, price: 650, duration_min: 60, visible_on_client_app: false }).eq('id', crio)).error).toBeNull()
  const { data: dr, error: eD } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Drenagem ${marca}`, category: 'Corporal', price: 160, duration_min: 50,
    is_active: true, visible_on_client_app: true,
  }).select('id').single<{ id: string }>()
  expect(eD).toBeNull()
  drenagem = dr!.id
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // O contrato de plano padrão, o que toda rede ganha.
  expect((await db().rpc('documentos_modelos_padrao', { p_tenant: rede.tenantId })).error).toBeNull()
  cliente = await clienteComSessao(`pla9c${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  gestor = await criarMembro(`pla9g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    permissoes: (['procedures', 'financial', 'clients', 'agenda', 'medical_records', 'cashier', 'documents'] as const).map(modulo => ({ modulo, nivel: 'MANAGE' as const })),
  })
  recepcao = await criarMembro(`pla9r${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })

  // O plano fechado: S1 criolipólise (feita), S2 drenagem, S3 criolipólise.
  const { data: pl, error: ePl } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, professional_id: rede.professionalId,
    status: 'ACCEPTED', name: `${PREFIXO} Plano corporal ${marca}`, aceito_em: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  plano = pl!.id
  const { data: ss } = await db().from('treatment_plan_sessions').insert([0, 1, 2].map(i => ({ plan_id: plano, sort_order: i }))).select('id, sort_order')
  sessoes.push(...[...ss!].sort((a, b) => a.sort_order - b.sort_order).map(s => s.id as string))
  expect((await db().from('treatment_plan_session_procedures').insert([
    { session_id: sessoes[0], procedure_id: crio, price: 585 },
    { session_id: sessoes[1], procedure_id: drenagem, price: 144 },
    { session_id: sessoes[2], procedure_id: crio, price: 585 },
  ])).error).toBeNull()
  const { data: feita, error: eF } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, professional_id: rede.professionalId, procedure_id: crio,
    scheduled_at: daqui(-3), completed_at: daqui(-3), duration_min: 60, price: 585, status: 'COMPLETED', source: 'INTERNAL', treatment_plan_id: plano,
  }).select('id').single<{ id: string }>()
  expect(eF).toBeNull()
  expect((await db().from('treatment_plan_sessions').update({ appointment_id: feita!.id }).eq('id', sessoes[0])).error).toBeNull()
  const lanc = { branch_id: rede.branchId, client_id: cliente.clientId, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços', created_by: 'e2e' }
  expect((await db().from('financial_transactions').insert([
    { ...lanc, description: 'Plano de tratamento — entrada', amount: 900, is_paid: true, paid_at: daqui(-3), payment_method: 'PIX' },
    { ...lanc, description: 'Plano de tratamento — parcela 1/1', amount: 414, is_paid: false, due_date: daqui(30), parcela_numero: 1, parcela_total: 1 },
  ])).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  }
  await gestor?.limpar(); await recepcao?.limpar(); await cliente?.limpar()
  await rede?.limpar()
})

test.describe.serial('o plano e o pacote da 9ª', () => {
  test('A18: o "+ Agendar" da ficha oferece a sessão do plano no "Já pago", e o cartão do tratamento diz que abre', async ({ browser }) => {
    await comSessao(browser, gestor!.estado, async p => {
      await p.goto(`/admin/clients/${cliente!.clientId}`)
      await expect(p.locator('[data-tratamento-que-abre]')).toContainText('Abrir para ver e agendar as sessões')
      await p.getByRole('button', { name: '+ Agendar' }).click()
      const jaPago = p.getByLabel('Usar o que já foi pago')
      await expect(jaPago).toBeVisible()
      await expect(jaPago.locator('option', { hasText: 'Plano de tratamento' })).toHaveCount(2)
      await p.locator('#ag-procedimento').selectOption(drenagem)
      await expect(p.locator('[data-credito-pre-escolhido]')).toContainText('Plano de tratamento (sessão 2 de 3)')
    })
  })

  test('D5: a sessão de drenagem do plano grava R$ 144 e 50 min, mesmo com a tela mandando os da criolipólise', async ({ browser }) => {
    await comSessao(browser, gestor!.estado, async p => {
      await p.goto(`/admin/clients/${cliente!.clientId}`)
      const quando = daqui(5)
      const r = await chamarAcao(p, 'actions/appointments.ts', 'schedulePlanSession', `/admin/clients/${cliente!.clientId}`, [{
        planId: plano, sessionId: sessoes[1], branchId: rede!.branchId, professionalId: rede!.professionalId,
        scheduledAt: quando, clientId: cliente!.clientId, procedureId: drenagem, price: 585, durationMin: 60, slug,
      }])
      expect(r.texto).toMatch(/appointmentId/)
      const { data: s2 } = await db().from('treatment_plan_sessions').select('appointment_id').eq('id', sessoes[1]).single()
      const { data: ag } = await db().from('appointments').select('price, duration_min, procedure_id, treatment_plan_id').eq('id', s2!.appointment_id!).single()
      expect({ preco: Number(ag!.price), duracao: ag!.duration_min, proc: ag!.procedure_id, plano: ag!.treatment_plan_id })
        .toEqual({ preco: 144, duracao: 50, proc: drenagem, plano })

      // A sessão de criolipólise não se agenda como drenagem (o servidor lê a sessão).
      const outro = await chamarAcao(p, 'actions/appointments.ts', 'schedulePlanSession', `/admin/clients/${cliente!.clientId}`, [{
        planId: plano, sessionId: sessoes[2], branchId: rede!.branchId, professionalId: rede!.professionalId,
        scheduledAt: daqui(6), clientId: cliente!.clientId, procedureId: drenagem, price: 144, durationMin: 50, slug,
      }])
      expect(outro.texto).toMatch(/outro procedimento/)
    })
  })

  test('A28: o rodapé do plano fechado diz à recepção sem o Financeiro com quem fica a parcela que vence depois', async ({ browser }) => {
    await comSessao(browser, recepcao!.estado, async p => {
      await p.goto(`/admin/planejamentos/${plano}`)
      const resumo = p.locator('[data-resumo-do-plano]')
      await expect(resumo).toBeVisible()
      await expect(resumo.locator('[data-rodape-do-plano]')).toContainText(`com quem tem o Financeiro em Gerenciar: ${PREFIXO} Gestão pla9g${marca}`)
      await expect(resumo.locator('[data-rodape-do-plano]')).not.toContainText('se recebe no financeiro.')
    })
  })

  test('A47: no app, cada sessão a agendar diz se a cliente marca pelo app ou se quem marca é a clínica', async ({ browser }) => {
    // A sessão 2 (drenagem) volta a ficar livre: o D5 a agendou.
    const { data: s2 } = await db().from('treatment_plan_sessions').select('appointment_id').eq('id', sessoes[1]).single()
    if (s2?.appointment_id) {
      expect((await db().from('appointments').update({ status: 'CANCELLED', cancelled_at: new Date().toISOString(), cancellation_reason: 'e2e' }).eq('id', s2.appointment_id)).error).toBeNull()
    }
    await comSessao(browser, cliente!.estado, async p => {
      await p.goto(`/${slug}/cliente/home`)
      const cartao = p.locator('[data-plano-fechado]')
      await cartao.locator('summary').click()
      const detalhe = cartao.locator('[data-plano-detalhe]')
      await expect(detalhe.locator('[data-sessao-do-plano="2"]')).toContainText('A agendar · pelo app')
      await expect(detalhe.locator('[data-sessao-do-plano="3"]')).toContainText('A agendar · quem marca é a clínica')
      const quem = detalhe.locator('[data-quem-marca-a-sessao]')
      await expect(quem).toContainText('Sessão 2: agende pelo app')
      await expect(quem).toContainText('Sessão 3: quem marca é a clínica')
    })
  })

  test('A35: o checkout avisa antes de emitir que o contrato vai sem o documento da cliente, e deixa seguir', async ({ browser }) => {
    const { planId } = await planoProposto('sem CPF')
    await comSessao(browser, gestor!.estado, async p => {
      await p.goto(`/admin/checkout/${planId}`)
      const aviso = p.locator('[data-contrato-sem-documento]')
      await expect(aviso).toContainText('não tem CPF')
      await expect(aviso).toContainText('o contrato do plano sai sem o documento dela')
      await p.getByRole('button', { name: 'Confirmar plano' }).click()
      await expect(p.locator('[data-contrato-sem-documento]'), 'repete antes da documentação').toBeVisible()
      await expect(p.getByRole('button', { name: /Ir para a documentação/ })).toBeEnabled()
    })
  })

  test('A36: reabrir o checkout com o contrato assinado traz o pagamento assinado e diz que mudar pede um contrato novo', async ({ browser }) => {
    const { planId } = await planoProposto('assinado')
    await comSessao(browser, gestor!.estado, async p => {
      const rota = `/admin/checkout/${planId}`
      await p.goto(rota)
      const preparado = await chamarAcao(p, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', rota, [planId, { forma: 'AVISTA', metodo: 'PIX' }])
      expect(preparado.texto).not.toContain('"error"')
      const { data: docs } = await db().from('issued_documents').select('id').eq('treatment_plan_id', planId)
      for (const d of docs ?? []) await assinarNoPapel(d.id as string)

      await p.goto(rota)
      await p.getByRole('button', { name: 'Confirmar plano' }).click()
      const aviso = p.locator('[data-contrato-assinado-com]')
      await expect(aviso).toContainText('já foi assinado com este pagamento')
      await expect(aviso).toContainText('À vista, no Pix')
      await expect(aviso).toContainText('Mudar as condições pede um contrato novo')
      await expect(p.getByRole('button', { name: 'À vista' })).toHaveAttribute('aria-pressed', 'true')
      await expect(p.getByRole('button', { name: 'Pix', exact: true })).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
