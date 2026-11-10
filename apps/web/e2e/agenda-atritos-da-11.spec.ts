import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre, cabeHoje } from './apoio/datas'

/**
 * Os atritos da agenda da 11ª simulação (2026-11-10), numa rede [e2e] própria:
 *
 * - A23: em `/admin/agenda` (Dia), o bloqueio de UMA profissional pintava a
 *   coluna inteira da unidade — parecia a clínica fechada.
 * - A24: remarcar para um horário que já passou era aceito sem aviso.
 * - A26: na clínica 24 h, a "Minha agenda" do celular abria às 00:00; o
 *   "Próximo atendimento" saía cortado e não abria nada; e, na agenda da
 *   unidade no celular, a coluna da segunda profissional saía cortada.
 * - A32: "Você não tem acesso a esta área" vinha sem menu e sem topbar.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const DIA = diaEmQueAUnidadeAbre(2)
const ONTEM = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - 86_400_000))
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let recepcao: MembroDeTeste
let sofia: MembroDeTeste
const VINTE_E_QUATRO = { dias: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) }

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendar(prof: string, quando: string, campos: Record<string, unknown> = {}): Promise<string> {
  const cliente = await rede.criarCliente(`Cliente ${Math.random().toString(36).slice(2, 7)}`)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: prof,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando, ...campos,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ag11${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await db().from('branches').update({ horario: VINTE_E_QUATRO }).eq('id', rede.branchId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, atende_em: [rede.branchId] }).eq('id', rede.professionalId)).error).toBeNull()
  dona = await criarMembro(`ag11d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  recepcao = await criarMembro(`ag11r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  sofia = await criarMembro(`ag11s${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Biomedica',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true, atende_em: [rede.branchId] }).eq('id', sofia.userId)).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await recepcao?.limpar(); await sofia?.limpar()
  await rede?.limpar()
})

test('A23: na agenda da rede, o bloqueio de uma profissional é uma faixa estreita, com o nome — não a unidade inteira', async ({ browser }) => {
  expect((await db().from('agenda_bloqueios').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, professional_id: rede.professionalId, motivo: 'Almoço',
    inicio: new Date(`${DIA}T12:00:00-03:00`).toISOString(), fim: new Date(`${DIA}T13:00:00-03:00`).toISOString(), criado_por_nome: 'e2e',
  })).error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto(`/admin/agenda?date=${DIA}`)
    const faixa = p.locator('[data-bloqueio]').first()
    await expect(faixa).toBeAttached()
    const caixa = await faixa.boundingBox()
    expect(caixa!.width, 'a faixa cobre a coluna da unidade inteira').toBeLessThanOrEqual(10)
    await expect(p.locator('[data-rotulo-do-bloqueio]').first()).toContainText('Almoço')
  })
})

test('A24: remarcar para um horário que já passou avisa — e deixa', async ({ browser }) => {
  const ag = await agendar(rede.professionalId, new Date(`${DIA}T10:00:00-03:00`).toISOString())
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.locator(`[data-agendamento="${ag}"]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await janela.getByRole('button', { name: 'Remarcar' }).click()
    await janela.locator('input[type="datetime-local"]').fill(`${ONTEM}T10:00`)
    await expect(janela.locator('[data-aviso-do-remarcar]')).toContainText('já passou')
    await expect(janela.getByRole('button', { name: 'Confirmar novo horário' })).toBeEnabled()
  })
})

test('A26: no celular, a agenda da unidade mostra as duas profissionais inteiras', async ({ browser }) => {
  await agendar(sofia.userId, new Date(`${DIA}T09:00:00-03:00`).toISOString())
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    const colunas = p.locator('[data-coluna-do-profissional]')
    await expect(colunas).toHaveCount(2)
    const segunda = await colunas.nth(1).boundingBox()
    expect(segunda!.x + segunda!.width, 'a segunda coluna sai da tela').toBeLessThanOrEqual(412)
  }, { width: 412, height: 860 })
})

test('A26: na clínica 24 h, a "Minha agenda" do celular abre perto de agora, e o próximo atendimento abre a tela dele', async ({ browser }) => {
  const agora = new Date()
  const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora))
  test.skip(hora < 2 || !cabeHoje(90), 'de madrugada a grade já abre no começo, e perto da meia-noite não cabe o próximo de hoje')
  const proximo = await agendar(sofia.userId, new Date(agora.getTime() + 60 * 60_000).toISOString())
  await como(browser, sofia, async p => {
    await p.goto(`/${slug}/agenda`)
    const rolagem = p.locator('[data-rolagem-minha-agenda][data-rolagem="pronta"]')
    await expect(rolagem).toBeAttached()
    expect(await rolagem.evaluate(el => el.scrollTop), 'a grade abriu na meia-noite').toBeGreaterThan(0)
    const destaque = p.locator('[data-destaque-de-hoje]')
    await expect(destaque).toHaveAttribute('href', new RegExp(`/agenda/${proximo}$`))
  }, { width: 390, height: 844 })
})

test('A32: a tela de sem acesso fica dentro do portal, com o menu', async ({ browser }) => {
  await como(browser, sofia, async p => {
    await p.goto(`/${slug}/clients`)
    await expect(p.getByText('Você não tem acesso a esta área')).toBeVisible()
    await expect(p.getByRole('link', { name: /Agenda/ }).first()).toBeVisible()
  })
})
