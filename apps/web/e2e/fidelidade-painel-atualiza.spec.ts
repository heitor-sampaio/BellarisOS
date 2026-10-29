import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D16 da simulação de 2026-10-29: logo depois de vender o pacote ao Gabriel, o
 * cartão "Pontos" da ficha dizia 800 e o painel Fidelidade, "Nenhum ponto
 * ainda" — até recarregar a página. O painel copiava as props para o estado
 * (`useState(fidelidade.saldo)`), e o `router.refresh` da venda trazia as
 * props novas sem que o estado mudasse.
 *
 * Os pontos aqui chegam por fora (como o gatilho do pagamento) e a tela faz o
 * mesmo `router.refresh` que a venda faz — sem recarregar a página.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`fp${marca}`)
  cliente = await rede.criarCliente('Cliente painel')
  gestor = await criarMembro(`fpg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção pontos',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'loyalty', nivel: 'VIEW' }],
  })
  const { error } = await db().from('loyalty_configs').upsert({
    tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1,
    redeem_points_value: 0.1, redeem_min_points: 0, redeem_max_pct: 100,
  }, { onConflict: 'tenant_id' })
  expect(error).toBeNull()
})
test.afterAll(async () => {
  if (gestor) await gestor.limpar()
  if (rede) await rede.limpar()
})

test('os pontos que chegam aparecem no painel Fidelidade com o refresh da tela, sem recarregar', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/clients/${cliente}`)
    const painel = p.getByTestId('fidelidade-do-cliente')
    await expect(painel).toBeVisible()
    await expect(p.getByTestId('saldo-de-pontos')).toHaveText('0 pontos')

    const { error } = await db().rpc('ajustar_pontos', {
      p_tenant: rede!.tenantId, p_cliente: cliente, p_unidade: rede!.branchId, p_pontos: 800,
      p_motivo: 'pontos da venda', p_ator: 'e2e',
    })
    expect(error).toBeNull()

    // O mesmo router.refresh que a venda do pacote faz (a página não recarrega).
    await p.evaluate(() => { (window as unknown as { __marca: number }).__marca = 1 })
    await p.evaluate(() => (window as unknown as { next: { router: { refresh(): void } } }).next.router.refresh())
    // O cartão do cabeçalho (props do servidor) já mostra os 800…
    await expect(p.getByText('PONTOS', { exact: true }).locator('xpath=..')).toContainText('800')
    // …e o painel também — antes ficava em 0 até recarregar.
    await expect(p.getByTestId('saldo-de-pontos')).toHaveText('800 pontos')
    await expect(painel.getByTestId('linha-do-extrato').first()).toContainText('pontos da venda')
    expect(await p.evaluate(() => (window as unknown as { __marca?: number }).__marca), 'a página não recarregou').toBe(1)
  } finally { await ctx.close() }
})
