import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre, cabeHoje } from './apoio/datas'
import { cartaoNaGradeDoDia } from './apoio/agenda'

/**
 * Os atritos da agenda e do atendimento da 12ª simulação (2026-11-10/11, a
 * Gabi, a Heloísa e a Bianca da Acácia), numa rede [e2e] própria:
 *
 * - A26: às 00:3x, o "Próximo atendimento" da Gabi mostrava 22:00 (a tela
 *   aberta na véspera congelava o "agora"), com a avaliação das 00:30 em aberto
 *   e atrasada. O destaque anda com o relógio e diz o atrasado em aberto.
 * - A27: antes do horário, a falta não aparecia, e a janela não dizia quando
 *   aparece (a regra fica: "Não compareceu" só depois do início).
 * - A28: no celular, o título do dia quebrava em 4 linhas, a legenda saía
 *   cortada e "Minhas comissões" só estava no menu.
 * - A29: "Aceitar plano" com a observação digitada e não salva dava "Preencha
 *   as observações antes de enviar." (e o botão se chama "Aceitar").
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const DIA = diaEmQueAUnidadeAbre(2)
let rede: OutraRede
let dona: MembroDeTeste
let gabi: MembroDeTeste
let recepcao: MembroDeTeste
let slug = ''
let cliente = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendar(profissional: string, quando: Date, minutos = 30): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: profissional,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: minutos, price: 0, scheduled_at: quando.toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ag12${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  // 24 h: os horários de qualquer hora do teste cabem no expediente.
  const inteiro = [{ de: '00:00', ate: '24:00' }]
  expect((await b.from('branches').update({ horario: { dias: { 0: inteiro, 1: inteiro, 2: inteiro, 3: inteiro, 4: inteiro, 5: inteiro, 6: inteiro } } }).eq('id', rede.branchId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`ag12d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  gabi = await criarMembro(`ag12g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gabi',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' },
    ],
  })
  expect((await b.from('users').update({ atende_em: [rede.branchId], provides_services: true }).eq('id', gabi.userId)).error).toBeNull()
  recepcao = await criarMembro(`ag12r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Juliana')
})

test.afterAll(async () => {
  await dona?.limpar(); await gabi?.limpar(); await recepcao?.limpar()
  await rede?.limpar()
})

test('A26: o destaque da "Minha agenda" anda com o relógio e diz o atendimento atrasado em aberto', async ({ browser }) => {
  test.skip(!cabeHoje(60), 'perto da meia-noite: o horário do teste cairia amanhã')
  const daqui20 = new Date(Date.now() + 20 * 60_000)
  await agendar(gabi.userId, daqui20)
  await como(browser, gabi, async p => {
    await p.clock.install({ time: new Date() })
    await p.goto(`/${slug}/agenda`)
    const destaque = p.locator('[data-destaque-de-hoje]')
    await expect(destaque).toContainText('Próximo atendimento')
    // 25 minutos depois, com a tela aberta: o horário começou e ninguém fechou.
    await p.clock.fastForward('25:00')
    await expect(destaque).toContainText('Atrasado')
    await expect(destaque).toContainText('Juliana')
  })
})

test('A27: antes do horário, a janela diz quando o "Não compareceu" aparece', async ({ browser }) => {
  const ag = await agendar(rede.professionalId, new Date(`${DIA}T15:00:00-03:00`))
  expect((await db().from('users').update({ atende_em: [rede.branchId], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await (await cartaoNaGradeDoDia(p, ag)).click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.getByRole('button', { name: 'Não compareceu' })).toHaveCount(0)
    await expect(janela.locator('[data-falta-depois-do-horario]')).toContainText('15:00')
  })
})

test('A28: no celular, o título do dia cabe numa linha, a legenda não corta e "Minhas comissões" está à mão', async ({ browser }) => {
  await como(browser, gabi, async p => {
    await p.goto(`/${slug}/agenda`)
    const titulo = p.locator('[data-titulo-do-dia]')
    await expect(titulo).toBeVisible()
    const alturas = await titulo.evaluate(el => ({ altura: el.getBoundingClientRect().height, linha: parseFloat(getComputedStyle(el).lineHeight) || 20 }))
    expect(alturas.altura, 'uma linha só').toBeLessThan(alturas.linha * 1.6)
    const legenda = p.locator('[data-legenda-da-agenda]')
    const corte = await legenda.evaluate(el => el.scrollWidth - el.clientWidth)
    expect(corte, 'a legenda não sai cortada').toBeLessThanOrEqual(1)
    await expect(p.locator('[data-minhas-comissoes]')).toHaveAttribute('href', `/${slug}/financeiro/comissoes`)
  }, { width: 390, height: 844 })
})

test('A29: "Aceitar plano" leva a observação que está na tela', async ({ browser }) => {
  const b = db()
  const { data: pl, error } = await b.from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente, status: 'DRAFT', name: `${PREFIXO} Plano A29 ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: s } = await b.from('treatment_plan_sessions').insert({ plan_id: pl!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect((await b.from('treatment_plan_session_procedures').insert({ session_id: s!.id, procedure_id: rede.procedureId, price: 200 })).error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/planejamentos/${pl!.id}`)
    await p.getByLabel('Observações da profissional').fill('Sem ácidos na semana anterior.')
    await p.getByRole('button', { name: 'Aceitar plano' }).click()
    await expect(p.getByText(/Preencha as observações/)).toHaveCount(0)
    // Fase 3 do PDV: aceitar leva o plano a ACEITO (antes, a PROPOSTO).
    await expect.poll(async () => (await db().from('treatment_plans').select('status, professional_notes').eq('id', pl!.id)
      .single<{ status: string; professional_notes: string | null }>()).data).toEqual({ status: 'ACCEPTED', professional_notes: 'Sem ácidos na semana anterior.' })
  })
})
