import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D-18 ("Reforça", item 12) e A68 da 5ª simulação: a Rosana via no app o
 * plano proposto de R$ 3.600 (2× Bioestimulador) e, ao lado, o
 * Bioestimulador de R$ 1.800 agendado pelo médico, sem ligação nenhuma — "a
 * cliente não sabe se paga os dois". O agendar avisa do plano com o mesmo
 * procedimento; o checkout do plano e o app avisam do avulso.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let recepcao: MembroDeTeste
let cliente: ClienteDeTeste
let slug = ''
let planId = ''
let procNome = ''

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`pea${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  procNome = `${PREFIXO} Bioestimulador ${marca}`
  expect((await db().from('procedures').update({ name: procNome, price: 1800 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`pear${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  cliente = await clienteComSessao(`peac${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  // O plano proposto: 2 sessões de Bioestimulador, R$ 3.600.
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente.clientId, status: 'PROPOSED', name: `${PREFIXO} Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  planId = pl!.id
  const { data: ss } = await db().from('treatment_plan_sessions').insert([{ plan_id: planId, sort_order: 0 }, { plan_id: planId, sort_order: 1 }]).select('id')
  expect((await db().from('treatment_plan_session_procedures').insert(
    (ss ?? []).map(s => ({ session_id: s.id, procedure_id: rede.procedureId, price: 1800 })),
  )).error).toBeNull()
})
test.afterAll(async () => {
  test.setTimeout(120_000)
  await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await db().from('treatment_plans').delete().eq('id', planId)
  await recepcao?.limpar(); await cliente?.limpar(); await rede?.limpar()
})

test('o agendar avisa do plano com o mesmo procedimento: "agendar pelo plano?"', async ({ browser }) => {
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda?novo=1&cliente=${cliente.clientId}`)
    const janela = p.getByRole('dialog', { name: 'Novo agendamento' })
    await janela.getByLabel('Procedimento *').selectOption(rede.procedureId)
    const aviso = janela.locator('[data-aviso-do-plano]')
    await expect(aviso).toContainText(`tem um plano proposto com ${procNome}`)
    await expect(aviso).toContainText('Agendar pelo plano?')
    await expect(aviso.getByRole('link', { name: 'Abrir o plano' })).toHaveAttribute('href', `/${slug}/planejamentos/${planId}`)
  })
})

test('com o avulso agendado, o checkout do plano e o app da cliente avisam que ele é à parte', async ({ browser }) => {
  const quando = new Date(Date.now() + 3 * 86_400_000)
  quando.setUTCHours(19, 0, 0, 0) // 16:00 em Brasília
  expect((await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 60, price: 1800, scheduled_at: quando.toISOString(),
  })).error).toBeNull()
  const dia = quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await p.getByRole('button', { name: 'Fechar checkout' }).click()
    const aviso = p.getByRole('dialog', { name: 'Checkout' }).locator('[data-avulso-do-plano]')
    await expect(aviso).toContainText(`${procNome} agendado à parte em ${dia} às 16:00`)
    await expect(aviso).toContainText('paga os dois')
  })
  await como(browser, cliente, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const aviso = p.locator('[data-plano-proposto] [data-avulso-do-plano]')
    await expect(aviso).toContainText(`${procNome} agendado à parte em ${dia} às 16:00`)
    await expect(aviso).toContainText('Fale com a clínica')
  })
})
