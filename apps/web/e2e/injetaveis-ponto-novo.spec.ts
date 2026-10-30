import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-38 (ajustes J, 2026-10-30): no mapa de injetáveis, todo ponto nascia com o
 * PRIMEIRO produto da lista ("Ácido hialurônico") e dose 0 — quem marcava
 * toxina e não reparava gravava ácido. O rótulo "Nome" do "Novo planejamento"
 * não estava ligado ao campo, e o ponto não tinha onde dizer a região.
 *
 * Agora: o PRIMEIRO ponto nasce sem produto (a linha pede "Escolha o
 * produto"); os seguintes repetem o produto, a dose e a unidade do último
 * ponto marcado (na toxina, os pontos vizinhos são do mesmo produto). O ponto
 * tem "Região (opcional)". A lista de produtos continua texto livre.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let mapa = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ipn${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`ipnp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE' },
    ],
  })
  // A rede tem produtos no catálogo: era o primeiro deles que todo ponto ganhava.
  await rede.criarProduto('Ácido hialurônico')
  await rede.criarProduto('Toxina do catálogo')
  const { data, error } = await db().from('injectable_maps').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, name: `[e2e] Toxina ${marca}`, view: 'rosto_f', points: [],
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  mapa = data!.id
})
test.afterAll(async () => {
  if (rede) await db().from('injectable_maps').delete().eq('tenant_id', rede.tenantId)
  await profissional?.limpar(); await rede?.limpar()
})

async function marcar(p: Page, fx: number, fy: number) {
  const svg = p.locator('svg').filter({ has: p.locator('image') }).first()
  await expect(svg).toBeVisible()
  await svg.scrollIntoViewIfNeeded()
  const box = (await svg.boundingBox())!
  await p.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
}

test('o rótulo "Nome" do novo planejamento é o do campo', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/injetaveis`)
    await p.getByRole('button', { name: 'Novo planejamento' }).first().click()
    const janela = p.getByRole('dialog', { name: 'Novo planejamento' })
    await expect(janela.getByLabel('Nome'), 'clicar no rótulo leva ao campo').toHaveAttribute('placeholder', 'Ex.: Toxina — terço superior')
  })
})

test('o primeiro ponto nasce sem produto; o seguinte repete o último; a região é opcional e é gravada', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/injetaveis/${mapa}`)
    await marcar(p, 0.45, 0.3)
    const pontos = p.locator('[data-ponto-do-mapa]')
    await expect(pontos).toHaveCount(1)
    const primeiro = pontos.nth(0)
    await expect(primeiro.getByPlaceholder('Produto'), 'nada de "Ácido hialurônico" escolhido sozinho').toHaveValue('')
    await expect(primeiro.getByText('Escolha o produto')).toBeVisible()

    await primeiro.getByPlaceholder('Produto').fill('Toxina botulínica')
    await primeiro.getByLabel('Plano').fill('4')
    await primeiro.getByLabel('Região (opcional)').fill('Glabela')
    await expect(primeiro.getByText('Escolha o produto')).toHaveCount(0)

    await marcar(p, 0.55, 0.3)
    await expect(pontos).toHaveCount(2)
    const segundo = pontos.nth(1)
    await expect(segundo.getByPlaceholder('Produto'), 'o ponto vizinho repete o produto do último').toHaveValue('Toxina botulínica')
    await expect(segundo.getByLabel('Plano'), 'e a dose').toHaveValue('4')
    await expect(segundo.getByLabel('Região (opcional)'), 'a região é de cada ponto').toHaveValue('')

    await p.getByRole('button', { name: 'Salvar planejamento' }).click()
    await expect.poll(async () => {
      const { data } = await db().from('injectable_maps').select('points').eq('id', mapa).single()
      return ((data?.points ?? []) as { product: string; dose: number; regiao?: string }[])
        .map(pt => ({ product: pt.product, dose: pt.dose, regiao: pt.regiao ?? null }))
    }).toEqual([
      { product: 'Toxina botulínica', dose: 4, regiao: 'Glabela' },
      { product: 'Toxina botulínica', dose: 4, regiao: null },
    ])
  })
})
