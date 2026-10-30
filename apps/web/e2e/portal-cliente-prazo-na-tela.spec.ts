import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-61 e J-64 das simulações. O prazo do portal aparecia genérico ("até 24
 * horas antes"), sem o dia e a hora em que acaba; o cartão da agenda não
 * parecia tocável; e o cancelamento pedia "Motivo" como se fosse obrigatório.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let longe = ''
let perto = ''

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function agendado(quando: Date) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente!.clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'CLIENT_APP', duration_min: 30, price: 0, scheduled_at: quando.toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}
/** "ter, 03/11 às 10:00" — o dia e a hora em Brasília. */
function emBrasilia(d: Date) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...o }).format(d)
  return `${f({ weekday: 'short' }).replace('.', '')}, ${f({ day: '2-digit', month: '2-digit' })} às ${f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
}

const QUANDO = new Date(Date.now() + 5 * 86_400_000)
QUANDO.setUTCMinutes(0, 0, 0)
QUANDO.setUTCHours(13)

test.beforeAll(async () => {
  rede = await criarOutraRede(`pz${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`pzc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  longe = await agendado(QUANDO)
  perto = await agendado(new Date(Date.now() + 3 * 3600_000))
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await cliente?.limpar(); await rede?.limpar()
})

test('a agenda diz até quando dá para alterar, na hora de Brasília, e o cartão tem a seta', async ({ browser }) => {
  const limite = emBrasilia(new Date(QUANDO.getTime() - 24 * 3600_000))
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/agendamentos`)
    const cartao = p.locator(`a[href$="/cliente/agendamentos/${longe}"]`)
    await expect(cartao).toContainText(`Alterar até ${limite}`)
    await expect(cartao).toContainText('10:00')
    await expect(cartao.locator('[data-abre-detalhe]')).toBeVisible()
  })
})

test('o detalhe diz o dia e a hora do prazo; o cancelamento pede "Motivo (opcional)"', async ({ browser }) => {
  const limite = emBrasilia(new Date(QUANDO.getTime() - 24 * 3600_000))
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/${longe}`)
    await expect(p.getByText(`Pelo app, você cancela ou remarca até ${limite} (24 horas antes do horário).`)).toBeVisible()
    await expect(async () => {
      await p.getByRole('button', { name: 'Cancelar agendamento' }).click({ timeout: 1000 })
      await expect(p.getByLabel('Motivo (opcional)')).toBeVisible({ timeout: 1000 })
    }).toPass()
  })
})

test('dentro do prazo, diz quando o prazo terminou', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/${perto}`)
    await expect(p.getByText(/O prazo para alterar pelo app terminou em .+ às \d\d:\d\d/)).toBeVisible()
  })
})
