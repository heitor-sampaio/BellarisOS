import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { cartaoNaGradeDoDia } from './apoio/agenda'
import { chamarAcao } from './apoio/acao-direta'
import { addDaysTZ, dayKeyTZ, horaNoFuso, instanteNoFuso } from '../lib/datetime'

/**
 * F64 — o fuso da unidade no que sobrou da F62 (13ª simulação). A Ipê é de
 * Rio Branco (UTC−5) e o navegador está no horário de Brasília (UTC−3): o
 * que se formatava no relógio do APARELHO saía 2 h adiantado, e o modal do
 * agendamento (que convertia duas vezes) 2 h atrasado.
 *
 * - D1: o modal do agendamento diz a hora da unidade.
 * - D3: a ficha (próximos agendamentos e histórico) também.
 * - D6: a tela do atendimento ("concluído em").
 * - D13: a agenda da rede rola até a hora de agora (unidade 24 h).
 * - A7: o "Às" do relógio das automações e os modelos dizem o relógio.
 * - D4: a campanha agendada grava a hora digitada no relógio da rede.
 *
 * Uma rede `[e2e]` só deste spec, com a unidade em Rio Branco, aberta 24 h.
 */

const ACRE = 'America/Rio_Branco'
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let dona: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let futuro = ''
let concluido = ''
// Daqui a 3 dias e ontem, no relógio do Acre.
const DIA = dayKeyTZ(addDaysTZ(new Date(), 3, ACRE), ACRE)
const ONTEM = dayKeyTZ(addDaysTZ(new Date(), -1, ACRE), ACRE)
const brasil = (dia: string) => { const [a, m, d] = dia.split('-'); return `${d}/${m}/${a}` }

async function como<T>(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: quem.estado, viewport: { width: 1440, height: 900 }, timezoneId: 'America/Sao_Paulo' })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fzs${marca}`)
  const b = db()
  const diaInteiro = [{ de: '00:00', ate: '24:00' }]
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await b.from('branches').update({
    fuso: ACRE, horario: { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, diaInteiro])) },
  }).eq('id', rede.branchId)).error).toBeNull()
  expect((await b.from('users').update({ atende_em: [rede.branchId], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await b.from('procedures').update({ duration_min: 60 }).eq('id', rede.procedureId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await rede.criarCliente(`Cliente Acre fzs${marca}`)
  const base = { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId, source: 'INTERNAL', duration_min: 60, price: 0 }
  // 18:00 no Acre = 23:00 UTC = 20:00 em Brasília.
  const f = await b.from('appointments').insert({ ...base, status: 'SCHEDULED', scheduled_at: instanteNoFuso(DIA, '18:00', ACRE).toISOString() })
    .select('id').single<{ id: string }>()
  expect(f.error).toBeNull()
  futuro = f.data!.id
  const c = await b.from('appointments').insert({
    ...base, status: 'COMPLETED', scheduled_at: instanteNoFuso(ONTEM, '17:00', ACRE).toISOString(),
    started_at: instanteNoFuso(ONTEM, '17:00', ACRE).toISOString(), completed_at: instanteNoFuso(ONTEM, '18:00', ACRE).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(c.error).toBeNull()
  concluido = c.data!.id
  recepcao = await criarMembro(`fzsr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  dona = await criarMembro(`fzsd${marca}`, {
    tenant: rede.tenantId, rotulo: 'Dona', permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'marketing', nivel: 'MANAGE' },
      { modulo: 'automations', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  if (rede) {
    await db().from('notification_campaigns').delete().eq('tenant_id', rede.tenantId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await recepcao?.limpar()
  await dona?.limpar()
  await rede?.limpar()
})

test('D1: o modal do agendamento diz a hora do Acre', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await (await cartaoNaGradeDoDia(p, futuro)).click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.locator('strong', { hasText: /^\d{2}:\d{2}$/ }).first()).toHaveText('18:00')
  })
})

test('D3: a ficha diz a hora do Acre nos próximos agendamentos e no histórico', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.getByText('Próximos agendamentos')).toBeVisible()
    await expect(p.getByText(/· 18:00 ·/).first()).toBeVisible()
    await expect(p.getByText(/· 20:00 ·/)).toHaveCount(0)
    await p.goto(`/${slug}/clients/${cliente}?aba=historico`)
    await expect(p.getByText(`${brasil(DIA)} às 18:00`, { exact: false }).first()).toBeVisible()
  })
})

test('D6: a tela do atendimento diz a hora do Acre', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda/${concluido}`)
    await expect(p.getByText(`Atendimento concluído em ${brasil(ONTEM)} às 18:00`)).toBeVisible()
  })
})

test('D13: a agenda da rede rola até a hora de agora numa unidade 24 h', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/agenda')
    const grade = p.locator('[data-grade-da-rede]')
    await expect(grade).toHaveAttribute('data-rolagem', 'pronta')
    const hora = Number(horaNoFuso(new Date(), ACRE).slice(0, 2))
    const { topo, maximo } = await grade.evaluate(e => ({ topo: e.scrollTop, maximo: e.scrollHeight - e.clientHeight }))
    // Uma hora antes de agora, 72 px por hora, a grade a partir das 00:00.
    expect(topo).toBeCloseTo(Math.min(maximo, Math.max(0, (hora - 1) * 72)), -1)
  })
})

test('A7: o relógio das automações diz o fuso da rede', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/automacoes')
    await p.getByRole('button', { name: 'Usar um modelo' }).click()
    await expect(p.locator('[data-modelo="aniversario"] [data-relogio-da-rede]')).toHaveText('No horário de Rio Branco.')
    await expect(p.locator('[data-modelo="agendou-move-o-card"] [data-relogio-da-rede]'), 'sem relógio, sem nota').toHaveCount(0)
  })
})

test('D4: a campanha agendada grava a hora digitada no relógio da rede, e a tela diz qual', async ({ browser }) => {
  const nome = `[e2e] Campanha fuso fzs${marca}`
  await como(browser, dona!, async p => {
    await p.goto('/admin/notificacoes/nova')
    await p.getByRole('button', { name: /Agendada/ }).click()
    await expect(p.getByLabel('Data e hora do disparo')).toBeVisible()
    await expect(p.locator('[data-relogio-da-rede]')).toHaveText('No horário de Rio Branco.')
    const r = await chamarAcao(p, 'actions/notification-campaigns.ts', 'createCampaign', '/admin/notificacoes/nova', [{
      name: nome, type: 'SCHEDULED', title: 'x', body: 'x', notification_type: 'promo', audience_rules: {},
      scheduled_at: `${DIA}T09:00`,
    }])
    expect(r.status).toBe(200)
  })
  const { data } = await db().from('notification_campaigns').select('scheduled_at').eq('tenant_id', rede!.tenantId).eq('name', nome).single<{ scheduled_at: string }>()
  expect(new Date(data!.scheduled_at).toISOString(), '09:00 no Acre = 14:00 UTC').toBe(instanteNoFuso(DIA, '09:00', ACRE).toISOString())
})
