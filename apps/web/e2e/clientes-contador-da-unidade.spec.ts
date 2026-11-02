import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A24 da 5ª simulação: em `/admin/clients?unidade=<zona sul>` a lista trazia
 * quem frequenta a Zona Sul (a tag da unidade), mas o contador continuava "4
 * ativos" — o da rede inteira. O contador acompanha o recorte, contado no
 * banco (lib/metrics).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let zonaSul = { id: '', slug: '', name: '' }

test.beforeAll(async () => {
  rede = await criarOutraRede(`cc${marca}`)
  const { data, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Zona Sul ${marca}`, slug: `e2e-cczs-${marca}` })
    .select('id, slug, name').single<typeof zonaSul>()
  expect(error).toBeNull()
  zonaSul = data!
  gestor = await criarMembro(`ccg${marca}`, { tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
  const ids = [await rede.criarCliente('Marlene'), await rede.criarCliente('Otavio'), await rede.criarCliente('Carla'), await rede.criarCliente('Diego')]
  // Marlene e Otávio frequentam a Zona Sul; os quatro estão ativos.
  for (const id of ids.slice(0, 2)) {
    expect((await db().from('clients').update({ tags: [`Unidade: ${zonaSul.name}`] }).eq('id', id)).error).toBeNull()
  }
})
test.afterAll(async () => {
  await gestor?.limpar()
  await db().from('branches').delete().eq('id', zonaSul.id)
  await rede?.limpar()
})

test('com ?unidade=, o contador é o das clientes da unidade, não o da rede', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/clients')
    await expect(p.locator('[data-contador-de-clientes]')).toHaveText(/^\s*4 ativos\s*$/)
    await p.goto(`/admin/clients?unidade=${zonaSul.slug}`)
    await expect(p.locator('[data-contador-de-clientes]')).toHaveText(new RegExp(`^\\s*2 ativos na .*Zona Sul ${marca}\\s*$`))
  } finally { await ctx.close() }
})
