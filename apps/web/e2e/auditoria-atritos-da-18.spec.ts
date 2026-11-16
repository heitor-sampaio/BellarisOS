import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A32 da 18ª simulação (2026-11-16), a Auditoria, numa rede [e2e] própria:
 * - o "Abriu o prontuário" leva a unidade em que foi aberto: entra no filtro
 *   por ela.
 * - Era também: "quem tem unidades vê o que ELA MESMA gravou sem unidade, e
 *   nunca a abertura do prontuário". A regra mudou no mesmo dia (o Heitor:
 *   "Auditoria é só admin"): quem tem unidades não abre a Auditoria, e a
 *   Admin da rede lê tudo — o que cada um gravou sem unidade e a abertura,
 *   também no portal da unidade.
 * A parte pura está em `tests/auditoria-atritos-da-18.test.ts`.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY!
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slugA = ''
let clienteId = ''
let daRede: MembroDeTeste | null = null
let daA: MembroDeTeste | null = null

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado, viewport: { width: 1440, height: 900 } })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um contato gravado pelo servidor em nome de um membro (o cabeçalho que as actions mandam). */
async function contatoEmNomeDe(membro: MembroDeTeste, nome: string) {
  const { data: u } = await db().from('users').select('auth_id').eq('id', membro.userId).single<{ auth_id: string }>()
  const r = await fetch(`${URL_}/rest/v1/contacts?select=id`, {
    method: 'POST',
    headers: {
      apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'content-type': 'application/json',
      Prefer: 'return=representation', 'x-bellaris-ator': u!.auth_id,
    },
    body: JSON.stringify({ tenant_id: rede!.tenantId, name: nome }),
  })
  expect(r.status, await r.clone().text()).toBe(201)
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`a32${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slugA = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  daRede = await criarMembro(`a32r${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Da rede', permissoes: [] })
  daA = await criarMembro(`a32a${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Da A', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
  await contatoEmNomeDe(daA, `${PREFIXO} Contato dela ${marca}`)
  await contatoEmNomeDe(daRede, `${PREFIXO} Contato da rede ${marca}`)
  const { data: c, error } = await db().from('clients')
    .insert({ tenant_id: rede.tenantId, branch_id: rede.branchId, name: `${PREFIXO} Cliente A32 ${marca}`, phone: '5548' + String(Date.now()).slice(-9) }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  clienteId = c!.id
  // A abertura do prontuário NA unidade A (a do endereço, que o servidor passa).
  expect((await db().rpc('prontuario_registrar_acesso', {
    p_tenant: rede.tenantId, p_cliente: clienteId, p_usuario: daRede.userId, p_nome: 'Da rede',
    p_ponto: 'ficha', p_referencia: null, p_unidade: rede.branchId,
  })).error).toBeNull()
})

test.afterAll(async () => {
  await daA?.limpar(); await daRede?.limpar()
  await rede?.limpar()
})

test('A32: o acesso ao prontuário grava a unidade do endereço', async () => {
  const { data } = await db().from('auditoria').select('branch_id').eq('tenant_id', rede!.tenantId).eq('operacao', 'abriu')
  expect((data ?? []).map(l => l.branch_id)).toEqual([rede!.branchId])
})

test('quem tem unidades não abre a Auditoria; a Admin da rede, no portal da unidade, lê o que cada um gravou sem unidade e a abertura do prontuário', async ({ browser }) => {
  await como(browser, daA!.estado, async p => {
    await p.goto(`/${slugA}/auditoria`)
    await expect(p.getByText('Você não tem acesso a esta área')).toBeVisible()
  })
  await como(browser, daRede!.estado, async p => {
    await p.goto(`/${slugA}/auditoria`)
    const linhas = p.locator('[data-linha-da-auditoria]')
    await expect(linhas.filter({ hasText: 'Contato dela' })).toHaveCount(1, { timeout: 30_000 })
    await expect(linhas.filter({ hasText: 'Contato da rede' })).toHaveCount(1)
    await expect(linhas.filter({ hasText: 'Abriu o prontuário' })).toHaveCount(1)
  })
})

test('A32: quem é da rede acha a abertura do prontuário no filtro pela unidade', async ({ browser }) => {
  await como(browser, daRede!.estado, async p => {
    await p.goto(`/admin/auditoria?unidade=${rede!.branchId}`)
    await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Abriu o prontuário' })).toHaveCount(1, { timeout: 30_000 })
  })
})
