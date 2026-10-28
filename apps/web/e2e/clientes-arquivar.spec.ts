import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Arquivar a cliente (A24, simulação de 2026-10-27): a recepção não achou como
 * ("Desativar cliente" escondido no "..."), e a cliente arquivada seguia
 * contando como cliente NOVA no dashboard.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`ar${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // O cargo-modelo Recepcionista: agenda e clientes em Gerenciar.
  recepcao = await criarMembro(`arr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'loyalty', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => { await recepcao?.limpar(); await rede?.limpar() })

const novosNoDashboard = async () => {
  const { data, error } = await db().rpc('metrics_core', {
    p_tenant: rede!.tenantId, p_branch_ids: null,
    p_from: new Date(Date.now() - 3_600_000).toISOString(), p_to: new Date(Date.now() + 3_600_000).toISOString(),
    p_professional_id: null,
  })
  expect(error).toBeNull()
  return Number((data as { new_clients: number }[])[0]!.new_clients)
}

const janela = () => ({ p_from: new Date(Date.now() - 3_600_000).toISOString(), p_to: new Date(Date.now() + 3_600_000).toISOString() })

test.describe.serial('arquivar a cliente', () => {
  test('a cliente arquivada não conta como nova — no cartão, por unidade e na série', async () => {
    const id = await rede!.criarCliente('Teste Cancelamento')
    expect(await novosNoDashboard()).toBe(1)
    expect((await db().from('clients').update({ is_active: false }).eq('id', id)).error).toBeNull()
    expect(await novosNoDashboard(), 'o cartão').toBe(0)
    const porUnidade = await db().rpc('metrics_by_branch', { p_tenant: rede!.tenantId, ...janela() })
    expect((porUnidade.data as { new_clients: number }[])[0]!.new_clients, 'por unidade').toBe(0)
    const serie = await db().rpc('metrics_new_clients_series', { p_tenant: rede!.tenantId, p_branch_ids: null, ...janela(), p_granularity: 'day' })
    expect(serie.data, 'a série').toEqual([])
    expect((await db().from('clients').update({ is_active: true }).eq('id', id)).error).toBeNull()
    expect(await novosNoDashboard(), 'reativada, volta').toBe(1)
  })

  test('a recepção arquiva e reativa pela ficha, no menu "Mais ações"', async ({ browser }) => {
    const id = await rede!.criarCliente('Arquivada pela recepção')
    const ctx = await browser.newContext({ storageState: recepcao!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/${slug}/clients/${id}`)
      await p.getByRole('button', { name: 'Mais ações' }).click()
      await p.getByRole('button', { name: 'Arquivar cliente' }).click()
      await expect.poll(async () => (await db().from('clients').select('is_active').eq('id', id).single()).data?.is_active).toBe(false)
      await p.reload()
      await p.getByRole('button', { name: 'Mais ações' }).click()
      await p.getByRole('button', { name: 'Reativar cliente' }).click()
      await expect.poll(async () => (await db().from('clients').select('is_active').eq('id', id).single()).data?.is_active).toBe(true)
    } finally { await ctx.close() }
  })
})
