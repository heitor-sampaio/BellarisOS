import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * O telefone que já é de alguém, no cadastro (5ª simulação, 2026-11-01):
 * - A20: o telefone de uma ficha ARQUIVADA não avisava — e virou o "Valdir
 *   Duplicado" (D10). Agora avisa e oferece "Reativar a ficha de …".
 * - A18: a pergunta do telefone (desde o r2-cli-01, 2026-11-03, "Já existe a
 *   ficha de X", com "Cadastrar mesmo assim" e "Atualizar a ficha") só aparecia depois do
 *   primeiro "Cadastrar", no pé da página, com a página rolada para cima — o
 *   clique parecia não fazer nada. Agora aparecem JUNTO ao telefone, assim que
 *   ele está completo, antes do clique.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
const nome = (r: string) => `${PREFIXO} Tel ${r} ${marca}`
let seq = 0
const telefone = () => `(47) 9${String(Date.now()).slice(-4)}-${String(2000 + ++seq).slice(-4)}`

const fichasDe = async (n: string) => ((await db().from('clients').select('id, is_active')
  .eq('tenant_id', rede!.tenantId).eq('name', n)).data ?? []) as { id: string; is_active: boolean }[]

async function ficha(n: string, fone: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db().from('clients').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, name: n, phone: fone, is_active: true, tags: [], ...extra,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Nome e telefone, e sai do campo do telefone (repetindo até a hidratação). */
async function digitar(p: Page, n: string, fone: string) {
  await p.goto('/admin/clients/new')
  await expect(async () => {
    await p.locator('input[name="name"]').fill(n)
    await p.locator('input[name="phone"]').fill('')
    await p.locator('input[name="phone"]').fill(fone)
    await expect(p.locator('input[name="phone"]')).toHaveValue(/\(\d\d\)/, { timeout: 1000 })
  }).toPass()
  await p.locator('input[name="phone"]').blur()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`tj${marca}`)
  recepcao = await criarMembro(`tj${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const { data } = await db().from('clients').select('id').eq('tenant_id', rede!.tenantId).like('name', `%Tel %${marca}`)
  expect(await apagarClientes((data ?? []).map(c => c.id as string))).toEqual([])
  await recepcao?.limpar()
  await rede?.limpar()
})

test('A20: o telefone de uma ficha ARQUIVADA avisa antes do clique e oferece "Reativar" — que reativa, sem ficha nova', async ({ browser }) => {
  const fone = telefone()
  const valdir = nome('Valdir arquivado')
  const id = await ficha(valdir, fone, { is_active: false, document: null })
  const nova = nome('Valdir de novo')
  await como(browser, async p => {
    await digitar(p, nova, fone)
    const aviso = p.getByRole('alert').filter({ hasText: 'arquivada' })
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText(valdir)
    await aviso.getByRole('button', { name: `Reativar a ficha de ${valdir}` }).click()
    await expect(p).toHaveURL(new RegExp(`/clients/${id}`))
  })
  expect((await fichasDe(valdir))[0]!.is_active).toBe(true)
  expect(await fichasDe(nova)).toEqual([])
})

test('A20: "É outra pessoa" cadastra a ficha nova, e a arquivada fica como está', async ({ browser }) => {
  const fone = telefone()
  const arquivada = nome('arquivada outra')
  await ficha(arquivada, fone, { is_active: false, document: '52998224725' })
  const nova = nome('nova outra')
  await como(browser, async p => {
    await digitar(p, nova, fone)
    const aviso = p.getByRole('alert').filter({ hasText: 'arquivada' })
    await aviso.getByRole('button', { name: 'É outra pessoa' }).click()
    await expect(aviso).toBeHidden()
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p).toHaveURL(/\/clients\/[0-9a-f-]{36}/)
  })
  expect((await fichasDe(nova)).length).toBe(1)
  expect((await fichasDe(arquivada))[0]!.is_active).toBe(false)
})

test('A18: "Já existe a ficha de X" aparece junto ao telefone, antes do clique em Cadastrar', async ({ browser }) => {
  const fone = telefone()
  const mae = nome('mãe')
  await ficha(mae, fone, { document: '11144477735' })
  await como(browser, async p => {
    await digitar(p, nome('filha'), fone)
    const aviso = p.getByRole('alert').filter({ hasText: 'Já existe a ficha de' })
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText(mae)
    // Junto ao campo: entre o telefone e as observações, não no pé da página.
    const caixa = (await aviso.boundingBox())!
    const obs = (await p.locator('textarea[name="notes"]').boundingBox())!
    const tel = (await p.locator('input[name="phone"]').boundingBox())!
    expect(caixa.y).toBeGreaterThan(tel.y)
    expect(caixa.y).toBeLessThan(obs.y)
  })
})

test('A18: a ficha rápida também pergunta antes do clique; "Atualizar a ficha" completa a ficha dela', async ({ browser }) => {
  const fone = telefone()
  const rapida = nome('rápida')
  const id = await ficha(rapida, fone, { document: null })
  await como(browser, async p => {
    await digitar(p, rapida, fone)
    const aviso = p.getByRole('alert').filter({ hasText: 'Já existe a ficha de' })
    await expect(aviso).toBeVisible()
    await p.locator('input[name="email"]').fill(`e2e-tj${marca}@bellaris.invalid`)
    await aviso.getByRole('button', { name: `Atualizar a ficha de ${rapida}` }).click()
    await expect(p).toHaveURL(new RegExp(`/clients/${id}`))
  })
  expect((await fichasDe(rapida)).length).toBe(1)
  const { data } = await db().from('clients').select('email').eq('id', id).single<{ email: string | null }>()
  expect(data!.email).toBe(`e2e-tj${marca}@bellaris.invalid`)
})
