import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Atritos do atendimento vistos na simulação de um dia de clínica
 * (2026-10-20):
 * - a dona não achava o prontuário na ficha da cliente: a aba "Fichas" só
 *   aparecia depois de algum atendimento registrado — a anamnese ficava
 *   escondida;
 * - a alergia (a da Joana, a dipirona) não tinha destaque nenhum;
 * - "Aguardando confirmação do cliente pelo app" aparecia para quem não tem
 *   o app.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let cliente = ''
let concluido = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pr${marca}`)
  dona = await criarMembro(`prd${marca}`, {
    tenant: rede.tenantId, rotulo: 'Dona',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Joana')
  expect((await db().from('medical_records').upsert({
    client_id: cliente,
    general_anamnesis: { versao: 2, respostas: { allergies: `Dipirona ${marca}` }, respondidoEm: new Date().toISOString(), origem: 'EQUIPE' },
  }, { onConflict: 'client_id' })).error).toBeNull()
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  concluido = data!.id
})
test.afterAll(async () => { await dona?.limpar(); await rede?.limpar() })

test('a aba Prontuário aparece para quem pode ver o clínico — mesmo sem atendimento — com a anamnese', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    await p.getByRole('link', { name: 'Prontuário', exact: true }).click()
    await expect(p.getByText(`Dipirona ${marca}`).first()).toBeVisible()
  })
})

test('a alergia aparece em destaque na ficha e no atendimento', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    await expect(p.locator('[data-alerta-alergia]')).toContainText(`Dipirona ${marca}`)
    await p.goto(`/admin/agenda/${concluido}`)
    await expect(p.locator('[data-alerta-alergia]')).toContainText(`Dipirona ${marca}`)
  })
})

test('sem o app, o atendimento concluído não fica "aguardando confirmação do cliente pelo app"', async ({ browser }) => {
  expect((await db().from('appointments').update({ status: 'IN_PROGRESS', started_at: new Date(Date.now() - 3600_000).toISOString() }).eq('id', concluido)).error).toBeNull()
  expect((await db().from('appointments').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', concluido)).error).toBeNull()
  await como(browser, async p => {
    await p.goto(`/admin/agenda/${concluido}`)
    await expect(p.getByText('Cliente não compareceu.')).toHaveCount(0)
    await expect(p.getByText(/Aguardando confirmação do cliente pelo app/)).toHaveCount(0)
    await expect(p.getByText(/sem o app/)).toBeVisible()
  })
})
