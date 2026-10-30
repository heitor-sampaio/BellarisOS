import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-29 (simulação): quem tem unidade fixa e abria pela URL OUTRA unidade, ou o
 * portal da rede (/admin), voltava ao dashboard da sua unidade sem nenhuma
 * palavra — parecia que o link estava quebrado. O redirecionamento continua
 * (§11: a abrangência é do membro); agora a tela diz por quê.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let membroDeA: MembroDeTeste | null = null
let slugA = ''
let unidadeB = ''
let slugB = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`ar${marca}`)
  slugA = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-arb-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(error).toBeNull()
  unidadeB = b!.id; slugB = b!.slug
  membroDeA = await criarMembro(`ara${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção de A',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await membroDeA?.limpar()
  if (unidadeB) await db().from('branches').delete().eq('id', unidadeB)
  await rede?.limpar()
})

test('abrir outra unidade pela URL leva à sua, dizendo por quê', async ({ browser }) => {
  await como(browser, membroDeA!.estado, async p => {
    await p.goto(`/${slugB}/agenda`)
    await expect(p).toHaveURL(new RegExp(`/${slugA}/dashboard`))
    await expect(p.getByText('Você não tem acesso a essa unidade. Abrimos a sua.')).toBeVisible()
    // O aviso sai da URL depois de mostrado: recarregar não o repete.
    await expect(p).not.toHaveURL(/aviso=/)
  })
})

test('abrir o portal da rede sem ser da rede leva à sua unidade, dizendo por quê', async ({ browser }) => {
  await como(browser, membroDeA!.estado, async p => {
    await p.goto('/admin/dashboard')
    await expect(p).toHaveURL(new RegExp(`/${slugA}/dashboard`))
    await expect(p.getByText('O portal da rede é de quem atende todas as unidades. Abrimos a sua.')).toBeVisible()
  })
})
