import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { haMinutosHoje } from './apoio/datas'

/**
 * Os atritos da tela do atendimento da 11ª simulação (2026-11-10), numa rede
 * [e2e] própria:
 *
 * - A25: iniciar 57 min depois do horário não avisava nem marcava o atraso
 *   (antes da hora, a tela pergunta).
 * - A29: no celular, o valor do procedimento na linha da sessão do plano
 *   ficava fora da tela — só o "R$" aparecia.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let prof: MembroDeTeste
let slug = ''
let longo = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ storageState: prof.estado, viewport })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendamento(rotulo: string, campos: Record<string, unknown>): Promise<string> {
  const cliente = await rede.criarCliente(rotulo)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: prof.userId,
    source: 'INTERNAL', duration_min: 30, price: 0, ...campos,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`at11${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  prof = await criarMembro(`at11p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  expect((await db().from('users').update({ provides_services: true, atende_em: [rede.branchId] }).eq('id', prof.userId)).error).toBeNull()
  longo = `${PREFIXO} Bioestimulador de colágeno com hidroxiapatita de cálcio ${marca}`
  expect((await db().from('procedures').insert({ tenant_id: rede.tenantId, name: longo, category: 'e2e', duration_min: 60, price: 2600 })).error).toBeNull()
})

test.afterAll(async () => {
  await prof?.limpar()
  await rede?.limpar()
})

test('A25: o atendimento que passou do horário diz o atraso antes de iniciar, e o iniciado atrasado fica marcado', async ({ browser }) => {
  const confirmado = await agendamento('Fernanda atraso', { status: 'CONFIRMED', scheduled_at: haMinutosHoje(57) })
  const iniciado = await agendamento('Isabela atraso', {
    status: 'IN_PROGRESS', scheduled_at: haMinutosHoje(80),
    started_at: new Date(new Date(haMinutosHoje(80)).getTime() + 57 * 60_000).toISOString(),
  })
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${confirmado}`)
    await expect(p.locator('[data-atraso-antes-de-iniciar]')).toContainText(/\d+ min depois do horário marcado/)
    await p.goto(`/${slug}/agenda/${iniciado}`)
    await expect(p.locator('[data-atraso-do-inicio]')).toContainText('57 min depois do horário marcado')
  })
})

test('A29: no celular, o valor do procedimento da sessão do plano fica inteiro na tela', async ({ browser }) => {
  const ag = await agendamento('Lucia plano', { status: 'IN_PROGRESS', scheduled_at: haMinutosHoje(20), started_at: haMinutosHoje(10) })
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${ag}`)
    await p.getByRole('button', { name: 'Nova sessão' }).first().click()
    await p.getByRole('button', { name: 'Adicionar procedimento' }).first().click()
    await p.locator('select').filter({ hasText: 'Selecionar procedimento…' }).first().selectOption({ label: longo })
    const preco = p.locator('input[type="number"][placeholder="0,00"]').first()
    await preco.scrollIntoViewIfNeeded()
    const caixa = await preco.boundingBox()
    expect(caixa, 'o campo do valor existe').not.toBeNull()
    expect(caixa!.x + caixa!.width, 'o valor sai pela direita da tela').toBeLessThanOrEqual(360)
    await expect(preco).toHaveValue('2600')
  }, { width: 360, height: 800 })
})
