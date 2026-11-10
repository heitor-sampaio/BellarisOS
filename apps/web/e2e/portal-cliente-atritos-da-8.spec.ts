import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos do portal da cliente na 8ª simulação (2026-11-06), da F38:
 * - A51: as sessões "A agendar" do plano não diziam que quem marca é a clínica
 *   (o laser não está no app).
 * - A52: o Confirmar não avisava que o horário fica dentro do prazo do app — o
 *   agendamento nascia "Prazo do app encerrado".
 * - A53: o Início não dizia a unidade do próximo agendamento (a drenagem da
 *   Água Verde aparecia no portal do Batel, sem dizer onde).
 * - A54: o histórico mostrava o comentário e as estrelas sem a nota em texto;
 *   "Aguardando sua confirmação" não dizia que é opcional.
 * - A55: na tela de confirmar, o bloco de nota do procedimento tinha o mesmo
 *   nome do procedimento do resumo ("Avaliação" e "Avaliação").
 *
 * Numa rede [e2e] própria, de duas unidades 24 h.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const TODO_DIA = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) }
const PROC = `${PREFIXO} Avaliação ${marca}`
const LASER = `${PREFIXO} Laser ${marca}`
const BATEL = `${PREFIXO} Batel ${marca}`

let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let batel = ''
let laser = ''
let aConfirmar = ''

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendamento(o: { status: string; quando: Date; branch?: string; extra?: Record<string, unknown> }) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: o.branch ?? rede!.branchId, client_id: cliente!.clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: o.quando.toISOString(), duration_min: 30, price: 0, status: o.status, source: 'INTERNAL',
    ...(o.status === 'COMPLETED' ? { completed_at: o.quando.toISOString() } : {}),
    ...(o.extra ?? {}),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendamento').toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`pa8${marca}`)
  const b = db()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('branches').update({ horario: TODO_DIA }).eq('id', rede.branchId)).error).toBeNull()
  const b2 = await b.from('branches').insert({
    tenant_id: rede.tenantId, name: BATEL, slug: `e2e-batel-pa8${marca}`, horario: TODO_DIA,
    address: 'Rua do Batel, 100', city: 'Curitiba', state: 'PR',
  }).select('id').single<{ id: string }>()
  expect(b2.error).toBeNull()
  batel = b2.data!.id
  expect((await b.from('tenants').update({ portal_prazo_alteracao_horas: 12 }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await b.from('procedures').update({ name: PROC, visible_on_client_app: true, price: 0, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  const l = await b.from('procedures').insert({ tenant_id: rede.tenantId, name: LASER, category: 'e2e', duration_min: 30, price: 300, visible_on_client_app: false })
    .select('id').single<{ id: string }>()
  expect(l.error).toBeNull()
  laser = l.data!.id
  expect((await b.from('users').update({ provides_services: true, branch_id: null, atende_em: [rede.branchId, batel] }).eq('id', rede.professionalId)).error).toBeNull()
  cliente = await clienteComSessao(`pa8c${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })

  // A51: o plano fechado com uma sessão de laser a agendar.
  const pl = await b.from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, professional_id: rede.professionalId,
    status: 'ACCEPTED', name: `${PREFIXO} Plano laser ${marca}`, aceito_em: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(pl.error).toBeNull()
  const s = await b.from('treatment_plan_sessions').insert({ plan_id: pl.data!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect(s.error).toBeNull()
  expect((await b.from('treatment_plan_session_procedures').insert({ session_id: s.data!.id, procedure_id: laser, price: 300 })).error).toBeNull()

  // A53: o próximo agendamento é no Batel; o portal aberto é o da outra unidade.
  await agendamento({ status: 'SCHEDULED', quando: new Date(Date.now() + 5 * 86_400_000), branch: batel })
  // A54: um confirmado e avaliado, e um esperando a confirmação (A55).
  await agendamento({
    status: 'COMPLETED', quando: new Date(Date.now() - 3 * 86_400_000),
    extra: { client_confirmed_at: new Date().toISOString(), client_rating: 4, client_feedback: 'Adorei a limpeza' },
  })
  aConfirmar = await agendamento({ status: 'COMPLETED', quando: new Date(Date.now() - 1 * 86_400_000) })
})

test.afterAll(async () => {
  await cliente?.limpar()
  await rede?.limpar()
})

test('A51: a sessão "A agendar" do plano diz que quem marca é a clínica (o laser não se agenda pelo app)', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const cartao = p.locator('[data-plano-fechado]')
    await cartao.getByText('Plano de tratamento', { exact: false }).first().click()
    const detalhe = cartao.locator('[data-plano-detalhe]')
    await expect(detalhe).toContainText('A agendar')
    await expect(detalhe.locator('[data-quem-marca-a-sessao]')).toContainText('quem marca é a clínica')
  })
})

test('A53: o Início diz a unidade (e o endereço dela) do próximo agendamento', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const proximo = p.locator('[data-proximo-agendamento]')
    await expect(proximo.locator('[data-unidade-do-agendamento]')).toContainText(BATEL)
    await expect(proximo.locator('[data-unidade-do-agendamento]')).toContainText('Rua do Batel, 100')
  })
})

test('A54: "Aguardando sua confirmação" diz que é opcional, e o histórico diz a nota em texto', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/home`)
    await expect(p.locator('[data-aguardando-confirmacao]')).toContainText('opcional')
    await p.goto(`/${slug}/cliente/historico`)
    const avaliado = p.locator('[data-avaliacao-dada]').first()
    await expect(avaliado).toContainText('Atendimento')
    await expect(avaliado).toContainText('4/5')
    await expect(avaliado.getByRole('img', { name: 'Atendimento: 4 de 5 estrelas' })).toBeVisible()
    await expect(avaliado).toContainText('Adorei a limpeza')
    // A53: com duas unidades, o histórico diz onde foi cada atendimento.
    await expect(p.locator('[data-unidade-do-atendimento]').first()).toContainText('[e2e] Unidade')
  })
})

test('A55: na tela de confirmar, a nota do procedimento não tem o mesmo nome do resumo', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/atendimentos/${aConfirmar}/confirmar`)
    await expect(p.getByRole('group', { name: `Procedimento: ${PROC}` })).toBeVisible()
    await expect(p.getByRole('group', { name: PROC, exact: true })).toHaveCount(0)
  })
})

test('A52: o Confirmar avisa antes quando o horário fica dentro do prazo do app', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    const escolher = async (dias: number) => {
      await p.goto(`/${slug}/cliente/agendamentos/novo`)
      // Duas unidades: a do endereço já vem escolhida.
      await p.getByRole('button', { name: new RegExp(`Avaliação ${marca}`) }).first().click()
      // A2 da 10ª: com UMA profissional, o passo dela some e a tela vai à data.
      const prof = p.getByRole('button', { name: /\[e2e\] Prof/ }).first()
      await expect(prof.or(p.getByText('Escolha a data e o horário disponível.'))).toBeVisible()
      if (await prof.isVisible()) await prof.click()
      const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + dias * 86_400_000))
      await p.locator('input[type="date"]').fill(dia)
      await p.getByRole('button', { name: /^\s*\d{2}:\d{2}\s*$/ }).first().click()
      await expect(p.getByText('Confirme os detalhes do seu agendamento.')).toBeVisible()
    }
    // Hoje, o primeiro horário livre fica a menos de 12 h.
    await escolher(0)
    await expect(p.locator('[data-dentro-do-prazo]')).toContainText('12 horas')
    // Daqui a três dias, não.
    await escolher(3)
    await expect(p.locator('[data-dentro-do-prazo]')).toHaveCount(0)
  })
})
