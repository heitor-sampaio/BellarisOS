import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { redeDoCopilot, comSessao, TODAS, type RedeDoCopilot } from './apoio/copilot'

/**
 * O USO DO COPILOT de todas as redes, no sistema (pedido do Heitor,
 * 2026-10-08): o mês escolhido, da rede que mais gasta para a que menos, com
 * pedidos, tokens, a cota e o custo estimado (US$, e R$ pela cotação); e o
 * histórico dos últimos meses. O ADMIN e o GERENTE veem.
 *
 * O uso entra direto no banco (`copilot_uso_mensal`), como a clínica grava.
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build')
test.describe.configure({ mode: 'serial' })

const SIS = () => urlDaPlataforma('sistema')
const marca = Date.now().toString(36)
const db = () => banco()
let admin: AtendenteDeTeste
let gerente: AtendenteDeTeste
let a: RedeDoCopilot
let b: RedeDoCopilot

function mes(deslocamento = 0): string {
  const [ano, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(new Date()).split('-').map(Number)
  const d = new Date(Date.UTC(ano!, m! - 1 + deslocamento, 1))
  return d.toISOString().slice(0, 10)
}

test.beforeAll(async () => {
  test.setTimeout(300_000)
  admin = await criarAtendente(`ucad${marca}`, { papel: 'ADMIN' })
  gerente = await criarAtendente(`ucge${marca}`, { papel: 'GERENTE' })
  a = await redeDoCopilot(`uA${marca}`)
  b = await redeDoCopilot(`uB${marca}`)
  await a.plano(TODAS, 1_000_000)
  await b.plano(TODAS, null)
  const { error } = await db().from('copilot_uso_mensal').insert([
    { tenant_id: a.outra.tenantId, mes: mes(), tokens: 400_000, pedidos: 80, custo_usd: 0.5 },
    { tenant_id: b.outra.tenantId, mes: mes(), tokens: 120_000, pedidos: 30, custo_usd: 0.1 },
    { tenant_id: a.outra.tenantId, mes: mes(-1), tokens: 50_000, pedidos: 9, custo_usd: 0.02 },
  ])
  expect(error, 'gravar o uso de teste').toBeNull()
})
test.afterAll(async () => {
  await db().from('copilot_uso_mensal').delete().in('tenant_id', [a?.outra.tenantId, b?.outra.tenantId].filter(Boolean) as string[])
  await a?.limpar()
  await b?.limpar()
  await admin?.limpar()
  await gerente?.limpar()
})

test('o ADMIN vê o mês: da rede que mais gasta para a que menos, com a cota e o custo', async ({ browser }) => {
  await comSessao(browser, admin.estado, async p => {
    await p.goto(`${SIS()}/`)
    await p.getByRole('link', { name: 'Copilot', exact: true }).click()
    await expect(p.getByRole('heading', { name: 'Uso do Copilot' })).toBeVisible()
    // As redes de teste só com o filtro, como na lista de redes.
    await p.goto(`${SIS()}/copilot?teste=1`)
    const linhas = p.locator('[data-uso-por-rede] tbody tr', { hasText: marca })
    await expect(linhas).toHaveCount(2)
    await expect(linhas.nth(0)).toContainText(`uA${marca}`)
    await expect(linhas.nth(0)).toContainText('400.000')
    await expect(linhas.nth(0)).toContainText('40%')
    await expect(linhas.nth(0)).toContainText('US$ 0,50')
    await expect(linhas.nth(1)).toContainText(`uB${marca}`)
    await expect(linhas.nth(1)).toContainText('sem limite')
    await expect(linhas.nth(1)).toContainText('US$ 0,10')
    // O histórico dos últimos meses.
    await expect(p.locator('[data-historico-do-copilot]')).toBeVisible()
  })
})

test('o mês anterior pelo seletor', async ({ browser }) => {
  await comSessao(browser, admin.estado, async p => {
    await p.goto(`${SIS()}/copilot?teste=1&mes=${mes(-1)}`)
    const linhas = p.locator('[data-uso-por-rede] tbody tr', { hasText: marca })
    await expect(linhas.filter({ hasText: `uA${marca}` })).toContainText('50.000')
    await expect(linhas.filter({ hasText: `uB${marca}` })).not.toContainText('120.000')
  })
})

test('o GERENTE também vê (é leitura)', async ({ browser }) => {
  await comSessao(browser, gerente.estado, async p => {
    await p.goto(`${SIS()}/copilot?teste=1`)
    await expect(p.getByRole('heading', { name: 'Uso do Copilot' })).toBeVisible()
    await expect(p.locator('[data-uso-por-rede] tbody tr', { hasText: `uA${marca}` })).toBeVisible()
  })
})
