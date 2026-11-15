import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D7 da 15ª simulação (2026-11-15): no portal da Carol (uma unidade), as
 * linhas da Auditoria tinham ações do Rafael (da rede inteira), e o filtro
 * "Qualquer pessoa" trazia só Ana, Carol e Henrique — a lista eram os membros
 * com `users.branch_id` nas unidades dela, e quem tem "A rede inteira" (o
 * `branch_id` nulo) ficava de fora. A lista sai das LINHAS que a pessoa
 * alcança: quem agiu nas unidades dela. Numa rede [e2e] própria.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY!
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let unidadeB = ''
let slugA = ''
let daRede: MembroDeTeste | null = null
let daB: MembroDeTeste | null = null
let daA: MembroDeTeste | null = null

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado, viewport: { width: 1440, height: 900 } })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Uma sala gravada pelo servidor em nome de um membro (o cabeçalho que as actions mandam). */
async function salaEmNomeDe(branchId: string, membro: MembroDeTeste, nome: string) {
  const { data: u } = await db().from('users').select('auth_id').eq('id', membro.userId).single<{ auth_id: string }>()
  const r = await fetch(`${URL_}/rest/v1/rooms?select=id`, {
    method: 'POST',
    headers: {
      apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'content-type': 'application/json',
      Prefer: 'return=representation', 'x-bellaris-ator': u!.auth_id,
    },
    body: JSON.stringify({ branch_id: branchId, name: nome }),
  })
  expect(r.status, await r.clone().text()).toBe(201)
}

const nomeDe = async (m: MembroDeTeste) => (await db().from('users').select('name').eq('id', m.userId).single<{ name: string }>()).data!.name

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`d7${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slugA = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-un-d7b-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  unidadeB = b!.id
  daRede = await criarMembro(`d7r${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Da rede', permissoes: [] })
  daB = await criarMembro(`d7b${marca}`, { tenant: rede.tenantId, branchId: unidadeB, rotulo: 'Da B', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
  daA = await criarMembro(`d7a${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Da A', permissoes: [{ modulo: 'audit', nivel: 'VIEW' }] })
  await salaEmNomeDe(rede.branchId, daRede, `${PREFIXO} Sala A ${marca}`)
  await salaEmNomeDe(unidadeB, daB, `${PREFIXO} Sala B ${marca}`)
})

test.afterAll(async () => {
  await daA?.limpar(); await daB?.limpar(); await daRede?.limpar()
  if (unidadeB) await db().from('rooms').delete().eq('branch_id', unidadeB)
  await rede?.limpar()
})

test('D7: o filtro "Quem" da Auditoria traz quem agiu nas unidades da pessoa — inclusive quem é da rede', async ({ browser }) => {
  const [nomeDaRede, nomeDaB] = [await nomeDe(daRede!), await nomeDe(daB!)]
  await como(browser, daA!.estado, async p => {
    await p.goto(`/${slugA}/auditoria`)
    await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Sala A' })).toHaveCount(1, { timeout: 30_000 })
    const quem = p.getByLabel('Quem')
    // A linha da sala A é de quem tem "A rede inteira": a pessoa está no filtro.
    await expect(quem.locator('option', { hasText: nomeDaRede })).toHaveCount(1)
    // Quem só agiu na B (fora do alcance) não aparece.
    await expect(quem.locator('option', { hasText: nomeDaB })).toHaveCount(0)
    // E filtrar por ela traz a linha.
    await p.goto(`/${slugA}/auditoria?pessoa=${daRede!.userId}`)
    await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Sala A' })).toHaveCount(1)
  })
})
