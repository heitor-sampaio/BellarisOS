import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { unitTag } from '@estetica-os/utils'

/**
 * A17 da 8ª simulação (2026-11-06): a recepção de unidade fixa do Batel não
 * achava na lista a Helena, cliente da Água Verde — a lista da unidade é de
 * quem tem a tag dela —, e pela URL a ficha abria sem nada selecionado na
 * lista. A regra H5 diz que ela cuida da cliente da CLÍNICA. Agora a busca
 * diz "Não está nesta unidade? 1 cliente da clínica com esse nome", com o
 * link, e a ficha aberta pela URL aparece na lista, marcada.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slugB = ''
let helena = ''
let recepcaoB: MembroDeTeste | null = null
const NOME = `${PREFIXO} Helena cdc${marca}`

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cdc${marca}`)
  const a = (await db().from('branches').select('name').eq('id', rede.branchId).single<{ name: string }>()).data!
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Batel cdc${marca}`, slug: `e2e-cdc-${marca}` }).select('id, slug').single<{ id: string; slug: string }>()
  expect(error).toBeNull()
  slugB = b!.slug
  // A Helena é da Água Verde (cadastro e tag), e só dela.
  const { data: c, error: eC } = await db().from('clients').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, name: NOME, phone: '5541' + String(Date.now()).slice(-9), tags: [unitTag(a.name)],
  }).select('id').single<{ id: string }>()
  expect(eC).toBeNull()
  helena = c!.id
  recepcaoB = await criarMembro(`cdcr${marca}`, {
    tenant: rede.tenantId, branchId: b!.id, rotulo: 'Recepção do Batel',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  await recepcaoB?.limpar()
  await rede?.limpar()
})

test('A17: a busca da unidade diz que a cliente é da clínica, e a ficha aberta fica marcada na lista', async ({ browser }) => {
  await como(browser, recepcaoB!.estado, async p => {
    await p.goto(`/${slugB}/clients`)
    await p.getByPlaceholder('Buscar por nome ou telefone…').fill(`Helena cdc${marca}`)
    const fora = p.locator('[data-da-clinica-fora-da-unidade]')
    await expect(fora).toContainText('Não está nesta unidade? 1 cliente da clínica com esse nome')
    await fora.getByRole('link', { name: new RegExp(`Helena cdc${marca}`) }).click()
    await expect(p).toHaveURL(new RegExp(`/${slugB}/clients/${helena}`))
    await expect(p.locator('[data-aberta-fora-da-unidade]'), 'a ficha aberta aparece marcada na lista').toContainText(`Helena cdc${marca}`)
    // Pela URL direto, também.
    await p.goto(`/${slugB}/clients/${helena}`)
    await expect(p.locator('[data-aberta-fora-da-unidade]')).toContainText(`Helena cdc${marca}`)
  })
})
