import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { haMinutosHoje } from './apoio/datas'

/**
 * A agenda da 2ª unidade na 9ª simulação (2026-11-07):
 * - D10: "Seus atendimentos em outras unidades" levava quem é da rede a
 *   `/menino-deus/agenda/<id da Moinhos>` (404), e listava o já concluído.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let moinhos = ''
let slugMoinhos = ''
let menino = ''
let slugMenino = ''
let carolina: MembroDeTeste | null = null
let cliente = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`ag9${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  moinhos = rede.branchId
  slugMoinhos = (await db().from('branches').select('slug').eq('id', moinhos).single<{ slug: string }>()).data!.slug
  slugMenino = `e2e-md-ag9${marca}`
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Menino Deus ag9${marca}`, slug: slugMenino, horario: null }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  menino = b!.id
  cliente = await rede.criarCliente('Juliana')
  // A dona que atende, nas duas unidades.
  carolina = await criarMembro(`ag9c${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Carolina', permissoes: [] })
  expect((await db().from('users').update({ atende_em: [moinhos, menino] }).eq('id', carolina.userId)).error).toBeNull()
})

test.afterAll(async () => {
  await carolina?.limpar()
  await rede?.limpar()
})

test('D10: o atendimento de outra unidade abre no endereço dela, e o concluído não aparece como pendente', async ({ browser }) => {
  const daqui = Date.now()
  const futuro = new Date(daqui + 2 * 3_600_000).toISOString()
  const passado = haMinutosHoje(1)
  const { data: ags, error } = await db().from('appointments').insert([
    { branch_id: moinhos, client_id: cliente, procedure_id: rede!.procedureId, professional_id: carolina!.userId,
      scheduled_at: futuro, duration_min: 30, price: 100, status: 'SCHEDULED' },
    { branch_id: moinhos, client_id: cliente, procedure_id: rede!.procedureId, professional_id: carolina!.userId,
      scheduled_at: passado, duration_min: 30, price: 100, status: 'COMPLETED', completed_at: new Date().toISOString() },
  ]).select('id, status')
  expect(error).toBeNull()
  const aberto = ags!.find(a => a.status === 'SCHEDULED')!.id as string
  const concluido = ags!.find(a => a.status === 'COMPLETED')!.id as string
  await como(browser, carolina!.estado, async p => {
    await p.goto(`/${slugMenino}/agenda`)
    const painel = p.locator('[data-meus-de-outras-unidades]')
    await expect(painel.locator(`a[href$="/agenda/${aberto}"]`)).toHaveCount(1)
    await expect(painel.locator(`a[href$="/agenda/${concluido}"]`), 'o concluído não é pendente').toHaveCount(0)
    await painel.locator(`a[href$="/agenda/${aberto}"]`).click()
    await expect(p).toHaveURL(new RegExp(`/${slugMoinhos}/agenda/${aberto}`))
    await expect(p.getByText('Página não encontrada')).toHaveCount(0)
    await expect(p.getByText(`${PREFIXO} Juliana`).first()).toBeVisible()
    // O endereço velho (da unidade da tela) também leva ao certo.
    await p.goto(`/${slugMenino}/agenda/${aberto}`)
    await expect(p).toHaveURL(new RegExp(`/${slugMoinhos}/agenda/${aberto}`))
  })
})
