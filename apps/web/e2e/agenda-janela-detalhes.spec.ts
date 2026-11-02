import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * A29 da 5ª simulação — a janela do agendamento:
 * - não mostrava a sala nem a duração (e o cartão da grade, a sala);
 * - o cancelado só dizia "já foi encerrado", sem "Reagendar".
 */

const marca = `jd${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let recepcao: MembroDeTeste | null = null
let cliente = ''
let sala = ''
const nomeDaSala = `Sala Rosa ${marca}`
const DIA = diaEmQueAUnidadeAbre(2)
let ativo = ''
let cancelado = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  const { data: s, error: eS } = await db().from('rooms').insert({ branch_id: rede.branchId, name: nomeDaSala }).select('id').single<{ id: string }>()
  expect(eS).toBeNull()
  sala = s!.id
  cliente = await rede.criarCliente('Janela')
  const { data, error } = await db().from('appointments').insert([
    { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId, room_id: sala,
      status: 'SCHEDULED', source: 'INTERNAL', duration_min: 45, price: 0, scheduled_at: new Date(`${DIA}T10:00:00-03:00`).toISOString() },
    { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      status: 'CANCELLED', source: 'INTERNAL', duration_min: 30, price: 0, cancelled_at: new Date().toISOString(),
      cancellation_reason: 'A cliente pediu', scheduled_at: new Date(`${DIA}T14:00:00-03:00`).toISOString() },
  ]).select('id, status')
  expect(error).toBeNull()
  ativo = data!.find(a => a.status === 'SCHEDULED')!.id
  cancelado = data!.find(a => a.status === 'CANCELLED')!.id
})

test.afterAll(async () => {
  if (rede) {
    const ids = ((await db().from('appointments').select('id').eq('branch_id', rede.branchId)).data ?? []).map(a => a.id)
    if (ids.length) {
      await db().from('domain_events').delete().in('entidade_id', ids)
      await db().from('appointment_history').delete().in('appointment_id', ids)
      await db().from('appointments').delete().in('id', ids)
    }
    await db().from('rooms').delete().eq('branch_id', rede.branchId)
  }
  await recepcao?.limpar(); await rede?.limpar()
})

test('a janela e o cartão mostram a sala e a duração; o cancelado ganha "Reagendar"', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    const cartao = p.locator(`[data-agendamento="${ativo}"]`).first()
    await expect(cartao).toContainText(nomeDaSala)
    await cartao.click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.locator('[data-detalhes-do-agendamento]')).toContainText('45 min')
    await expect(janela.locator('[data-detalhes-do-agendamento]')).toContainText(nomeDaSala)
    await janela.getByRole('button').first().click()

    await p.goto(`/${slug}/agenda?date=${DIA}&cancelados=1`)
    await p.locator(`[data-agendamento="${cancelado}"]`).first().click()
    const doCancelado = p.getByRole('dialog', { name: 'Agendamento' })
    await doCancelado.getByRole('button', { name: 'Reagendar' }).click()
    // Abre o novo agendamento já com a cliente escolhida.
    const novo = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(novo).toContainText(`${PREFIXO} Janela ${marca}`)
  })
})
