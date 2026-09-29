import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, tenantId, PREFIXO } from './apoio/banco'
import { apagarClientes } from './apoio/limpeza'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Fidelidade pela tela: ligar o programa, ver o saldo na ficha e ajustar à mão.
 *
 * Numa rede [e2e] própria (a rede real nem é lida). O gestor tem Configurações
 * e Fidelidade para gerenciar; a recepção só VÊ os pontos. O ajuste é pela
 * action — cada recusa tem o gestor como controle.
 */

const marca = Date.now().toString(36)
const db = () => banco()

let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let cliente = ''
const alheios: string[] = []

test.beforeAll(async () => {
  rede = await criarOutraRede(`fa${marca}`)
  cliente = await rede.criarCliente('Cliente pontos')
  gestor = await criarMembro(`fag${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestor fidelidade',
    permissoes: [
      { modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'loyalty', nivel: 'MANAGE' },
    ],
  })
  recepcao = await criarMembro(`far${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção fidelidade',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'loyalty', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  for (const m of [gestor, recepcao]) if (m) await m.limpar()
  if (alheios.length) expect(await apagarClientes(alheios)).toEqual([])
  if (rede) await rede.limpar()
})

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function saldo(clientId: string) {
  const { data } = await db().rpc('saldo_de_pontos', { p_cliente: clientId, p_unidade: null })
  return Number(data)
}

test.describe.serial('fidelidade pela tela', () => {
  test('desligada, a ficha não mostra pontos; o gestor liga o programa em Configurações', async ({ browser }) => {
    await como(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      await expect(p.getByRole('heading').first()).toBeVisible()
      await expect(p.getByTestId('fidelidade-do-cliente')).toHaveCount(0)

      await p.goto('/admin/settings?tab=fidelidade')
      await p.getByRole('button', { name: 'Programa desligado' }).click()
      await expect(p.getByRole('button', { name: 'Programa ligado' })).toBeVisible()
      await p.getByRole('button', { name: 'Salvar', exact: true }).click()
      await expect(p.getByText('Salvo')).toBeVisible()
    })
    const { data } = await db().from('loyalty_configs').select('enabled, earn_mode').eq('tenant_id', rede!.tenantId).single()
    expect(data).toEqual({ enabled: true, earn_mode: 'POR_REAL' })
  })

  test('o gestor credita com motivo; debitar além do saldo é recusado', async ({ browser }) => {
    await como(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      const secao = p.getByTestId('fidelidade-do-cliente')
      await expect(secao).toBeVisible()

      await secao.getByRole('button', { name: 'Ajustar pontos' }).click()
      await secao.locator('input[name="pontos"]').fill('50')
      await secao.locator('input[name="motivo"]').fill('Cortesia de teste')
      await secao.getByRole('button', { name: 'Salvar ajuste' }).click()
      await expect(p.getByTestId('saldo-de-pontos')).toHaveText('50 pontos')
      await expect(secao.getByTestId('linha-do-extrato').first()).toContainText('Cortesia de teste')
      await expect(secao.getByTestId('linha-do-extrato').first()).toContainText('Gestor')

      await secao.getByRole('button', { name: 'Ajustar pontos' }).click()
      await secao.getByRole('button', { name: 'Debitar' }).click()
      await secao.locator('input[name="pontos"]').fill('100')
      await secao.locator('input[name="motivo"]').fill('Uso maior que o saldo')
      await secao.getByRole('button', { name: 'Salvar ajuste' }).click()
      await expect(secao.getByRole('alert')).toContainText('Saldo insuficiente')
    })
    expect(await saldo(cliente)).toBe(50)
  })

  test('a recepção só vê: sem botão, e a action recusa (o gestor é o controle)', async ({ browser }) => {
    const rota = `/admin/clients/${cliente}`
    await como(browser, recepcao!, async p => {
      await p.goto(rota)
      await expect(p.getByTestId('saldo-de-pontos')).toHaveText('50 pontos')
      await expect(p.getByRole('button', { name: 'Ajustar pontos' })).toHaveCount(0)
      await chamarAcao(p, 'actions/fidelidade.ts', 'ajustarPontos', rota,
        [{ clientId: cliente, branchId: rede!.branchId, pontos: 999, motivo: 'tentativa sem permissão' }])
    })
    expect(await saldo(cliente), 'a recepção não credita').toBe(50)

    await como(browser, gestor!, async p => {
      // Motivo em branco: o servidor recusa, sem depender da tela.
      await chamarAcao(p, 'actions/fidelidade.ts', 'ajustarPontos', rota,
        [{ clientId: cliente, branchId: rede!.branchId, pontos: 5, motivo: '  ' }])
      expect(await saldo(cliente)).toBe(50)
      // Controle: o mesmo pedido, com motivo, grava.
      await chamarAcao(p, 'actions/fidelidade.ts', 'ajustarPontos', rota,
        [{ clientId: cliente, branchId: rede!.branchId, pontos: 5, motivo: 'controle do teste' }])
    })
    expect(await saldo(cliente)).toBe(55)
  })

  test('cliente de outra rede é recusado', async ({ browser }) => {
    const { data: alheio, error } = await db().from('clients')
      .insert({ tenant_id: await tenantId(), name: `${PREFIXO} Alheio fidelidade ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
      .select('id').single<{ id: string }>()
    expect(error).toBeNull()
    alheios.push(alheio!.id)
    await como(browser, gestor!, async p => {
      await chamarAcao(p, 'actions/fidelidade.ts', 'ajustarPontos', `/admin/clients/${cliente}`,
        [{ clientId: alheio!.id, branchId: rede!.branchId, pontos: 500, motivo: 'furo entre redes' }])
    })
    expect(await saldo(alheio!.id)).toBe(0)
  })
})
