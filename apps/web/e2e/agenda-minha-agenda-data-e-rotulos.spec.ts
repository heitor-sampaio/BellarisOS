import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * J-33: na "Minha agenda" (agenda "só os meus"), as setas de dia anterior e
 * próximo não tinham nome para o leitor de tela, e o `?date=` da URL era
 * ignorado — o link do aviso ou da ficha abria sempre em hoje.
 * J-31: o "Motivo do cancelamento" da janela do agendamento não era ligado
 * ao campo (rótulo solto).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let agendamento = ''
const DIA = diaEmQueAUnidadeAbre(3)
const DIA_SEGUINTE = new Date(new Date(`${DIA}T12:00:00-03:00`).getTime() + 86_400_000).toISOString().slice(0, 10)

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`md${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`mdp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  recepcao = await criarMembro(`mdr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  const cliente = await rede.criarCliente('Cliente do dia')
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: profissional.userId,
    scheduled_at: new Date(`${DIA}T10:00:00-03:00`).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  agendamento = data!.id
})

test.afterAll(async () => {
  if (rede) {
    await db().from('appointment_history').delete().eq('appointment_id', agendamento)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await profissional?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('a "Minha agenda" abre no dia do ?date= e as setas têm nome', async ({ browser }) => {
  await como(browser, profissional!.estado, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await expect(p.getByText(`${PREFIXO} Cliente do dia md${marca}`).first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Dia anterior' })).toBeVisible()
    await p.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(p).toHaveURL(new RegExp(`date=${DIA_SEGUINTE}`))
    await expect(p.getByText(`${PREFIXO} Cliente do dia md${marca}`)).toHaveCount(0)
  })
})

test('o motivo do cancelamento é ligado ao campo', async ({ browser }) => {
  await como(browser, recepcao!.estado, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.getByText(`${PREFIXO} Cliente do dia md${marca}`).first().click()
    await p.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await p.getByLabel('Motivo do cancelamento *').fill('A cliente pediu para remarcar')
    await p.getByRole('button', { name: 'Confirmar cancelamento' }).click()
    await expect.poll(async () => (await db().from('appointments').select('cancellation_reason').eq('id', agendamento).single()).data?.cancellation_reason)
      .toBe('A cliente pediu para remarcar')
  })
})
