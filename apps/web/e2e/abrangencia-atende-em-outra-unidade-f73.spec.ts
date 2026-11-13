import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * F73 — A20 da 14ª simulação (princípio 3). A Bianca é fixa na Savassi e
 * ATENDE também na Pampulha (§11, o "Atende" é por unidade). Abrindo
 * /pampulha/agenda, lia "Você não tem acesso a essa unidade. Abrimos a sua." e
 * não sabia que os atendimentos dela na Pampulha estão na agenda da Savassi.
 * Para quem atende ali, o aviso diz isso e abre a agenda dela; para quem não
 * atende, segue o de sempre (e2e/abrangencia-aviso-ao-redirecionar.spec.ts).
 */

const marca = `aa${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede
let bianca: MembroDeTeste
let slugA = ''
let slugB = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slugA = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Pampulha ${marca}`, slug: `e2e-aab-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(error).toBeNull()
  slugB = b!.slug
  bianca = await criarMembro(`b${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional da Savassi',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ atende_em: [rede.branchId, b!.id] }).eq('id', bianca.userId)).error).toBeNull()
})

test.afterAll(async () => {
  await bianca?.limpar()
  await rede?.limpar()
})

test('A20: quem atende na outra unidade é levado à própria agenda, e o aviso diz onde estão os atendimentos', async ({ browser }) => {
  await como(browser, bianca.estado, async p => {
    await p.goto(`/${slugB}/agenda`)
    await expect(p).toHaveURL(new RegExp(`/${slugA}/agenda`))
    await expect(p.getByText('Os seus atendimentos nessa unidade estão na sua agenda, aqui.', { exact: false })).toBeVisible()
    await expect(p.getByText('Você não tem acesso a essa unidade. Abrimos a sua.')).toHaveCount(0)
  })
})
