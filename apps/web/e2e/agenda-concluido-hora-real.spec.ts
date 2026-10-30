import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-34 (simulação): o concluído aparecia só no horário AGENDADO. A cliente
 * das 23:30 atendida até 00:22 ficava "23:30 · concluído" — sem a hora real,
 * nem a recepção nem a cliente sabiam quando acabou. Agora a agenda e o app
 * da cliente mostram as duas.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let agendamento = ''

/** Anteontem, em Brasília. */
const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - 2 * 86_400_000))
const DIA_SEGUINTE = new Date(new Date(`${DIA}T12:00:00-03:00`).getTime() + 86_400_000).toISOString().slice(0, 10)
const ddmm = `${DIA_SEGUINTE.slice(8, 10)}/${DIA_SEGUINTE.slice(5, 7)}`

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`hr${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  // A unidade abre até meia-noite: o horário das 23:30 está na grade.
  expect((await db().from('branches').update({ horario: { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '08:00', ate: '24:00' }]])) } })
    .eq('id', rede.branchId)).error).toBeNull()
  cliente = await clienteComSessao(`hrc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  recepcao = await criarMembro(`hrr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
  })
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(`${DIA}T23:30:00-03:00`).toISOString(), duration_min: 30, price: 0, status: 'COMPLETED', source: 'INTERNAL',
    completed_at: new Date(`${DIA_SEGUINTE}T00:22:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  agendamento = data!.id
})

test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await recepcao?.limpar(); await cliente?.limpar(); await rede?.limpar()
})

test('a agenda mostra a hora agendada e a hora real do concluído', async ({ browser }) => {
  await como(browser, recepcao!.estado, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    const bloco = p.locator(`[data-agendamento="${agendamento}"]`)
    await expect(bloco).toContainText('23:30')
    await expect(bloco).toContainText(`concluído em ${ddmm} às 00:22`)
  })
})

test('o app da cliente mostra a hora agendada e a hora real do concluído', async ({ browser }) => {
  await como(browser, cliente!.estado, async p => {
    await p.goto(`/${slug}/cliente/agendamentos`)
    const cartao = p.locator(`a[href$="/cliente/agendamentos/${agendamento}"]`)
    await expect(cartao).toContainText('23:30')
    await expect(cartao).toContainText(`concluído em ${ddmm} às 00:22`)
  })
})
