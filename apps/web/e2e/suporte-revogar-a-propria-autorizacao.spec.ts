import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * PLAT-05 da varredura de conformidade (18/11). plataforma.md: quem autoriza
 * o suporte é a Admin da rede — "em Configurações → Suporte ou no chamado" —,
 * e "Revogar: a própria pessoa (a conta é dela) e a Admin da rede".
 *
 * A autorização dada em Configurações → Suporte não tem chamado, e a aba é só
 * da Admin da rede: a própria pessoa não a via nem a revogava em lugar
 * nenhum. Agora a Ajuda (a lista dos chamados dela) mostra a autorização da
 * conta dela, com o "Revogar" — e só a dela.
 */

test.setTimeout(120_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let pessoa: MembroDeTeste
let colega: MembroDeTeste
let dona: MembroDeTeste
const grants: string[] = []

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function autorizar(alvo: string): Promise<string> {
  const { data, error } = await db().from('support_grants').insert({
    tenant_id: rede.tenantId, target_user_id: alvo, granted_by_user_id: dona.userId, via: 'configuracoes',
    expires_at: new Date(Date.now() + 72 * 3_600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  grants.push(data!.id)
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`srpa${marca}`)
  dona = await criarMembro(`srpad${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  pessoa = await criarMembro(`srpap${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Agenda da unidade',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  colega = await criarMembro(`srpac${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Colega',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  if (grants.length) await db().from('support_grants').delete().in('id', grants)
  await pessoa?.limpar(); await colega?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('a pessoa vê na Ajuda a autorização da PRÓPRIA conta e a revoga; a da colega não aparece', async ({ browser }) => {
  const minha = await autorizar(pessoa.userId)
  const daColega = await autorizar(colega.userId)
  await como(browser, pessoa, async p => {
    const slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
    await p.goto(`/${slug}/agenda`)
    await p.getByRole('button', { name: 'Ajuda' }).click()
    const aviso = p.locator('[data-minha-autorizacao]')
    await expect(aviso).toContainText('O suporte está autorizado a entrar na sua conta até')
    await expect(aviso, 'uma só: a dela').toHaveCount(1)
    await aviso.getByRole('button', { name: 'Revogar' }).click()
    await expect(aviso).toHaveCount(0)
  })
  const lidos = (await db().from('support_grants').select('id, revoked_at').in('id', [minha, daColega])).data ?? []
  expect(lidos.find(g => g.id === minha)?.revoked_at, 'a dela foi revogada').not.toBeNull()
  expect(lidos.find(g => g.id === daColega)?.revoked_at, 'a da colega segue').toBeNull()
})
