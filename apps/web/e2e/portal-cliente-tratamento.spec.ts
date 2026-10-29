import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D17 da simulação de 2026-10-29: o portal dizia "Bem-vinda ao seu espaço
 * pessoal" ao Gabriel, cadastrado como Masculino. As boas-vindas seguem o
 * sexo da ficha; sem sexo, o neutro. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`pt${marca}`)
  const { data: un, error } = await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()
  expect(error).toBeNull()
  cliente = await clienteComSessao(`pt${marca}`, { id: rede.branchId, slug: un!.slug }, { tenant: rede.tenantId })
})
test.afterAll(async () => {
  if (cliente) await cliente.limpar()
  if (rede) await rede.limpar()
})

test('as boas-vindas do portal seguem o sexo da ficha; sem sexo, o neutro', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: cliente!.estado })
  try {
    const p = await ctx.newPage()
    const home = `/${cliente!.slug}/cliente/home`
    const sexo = async (g: string | null) => {
      const { error } = await db().from('clients').update({ gender: g }).eq('id', cliente!.clientId)
      expect(error).toBeNull()
      await p.goto(home)
    }

    await sexo('M')
    await expect(p.getByText('Bem-vindo ao seu espaço pessoal.')).toBeVisible()
    await expect(p.getByText('Bem-vinda ao seu espaço pessoal.')).toHaveCount(0)

    await sexo('F')
    await expect(p.getByText('Bem-vinda ao seu espaço pessoal.')).toBeVisible()

    await sexo(null)
    await expect(p.getByText('Boas-vindas ao seu espaço pessoal.')).toBeVisible()
  } finally { await ctx.close() }
})
