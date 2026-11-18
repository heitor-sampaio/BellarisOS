import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * PLAT-04 da varredura de conformidade (18/11). Desativar e reativar unidade é
 * configuração da rede toda, só da Admin da rede (o Heitor, 18/11:
 * "Configuração da rede toda só pela conta admin"; plataforma.md). O detalhe
 * da unidade mostrava os dois botões a quem tem Configurações em Gerenciar e
 * a rede inteira, e a action LANÇAVA — a pessoa via "algo deu errado". Agora
 * a tela não os mostra (§14) e a action devolve a recusa com o motivo.
 */

test.setTimeout(150_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gerente: MembroDeTeste
let dona: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`eus${marca}`)
  gerente = await criarMembro(`eusg${marca}`, {
    tenant: rede.tenantId, branchId: null, rotulo: 'Configura a rede',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
  dona = await criarMembro(`eusd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await gerente?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('quem não é a Admin da rede não vê Desativar nem Reativar, e a action diz por quê', async ({ browser }) => {
  const rota = `/admin/branches/${rede.branchId}`
  await como(browser, gerente, async p => {
    await p.goto(rota)
    await expect(p.getByRole('heading').first()).toBeVisible()
    await expect(p.getByRole('button', { name: /Desativar/ }), 'sem o desativar').toHaveCount(0)
    await expect(p.getByRole('button', { name: /Reativar/ }), 'sem o reativar').toHaveCount(0)
    const r = await chamarAcao(p, 'actions/branches.ts', 'toggleBranchStatus', rota, [rede.branchId, false])
    expect(r.texto, 'a recusa volta com o motivo').toContain('Esta configuração é só da Admin da rede.')
  })
  const { data } = await db().from('branches').select('is_active').eq('id', rede.branchId).single<{ is_active: boolean }>()
  expect(data!.is_active, 'a unidade segue ativa').toBe(true)

  // Controle: a Admin da rede vê o botão.
  await como(browser, dona, async p => {
    await p.goto(rota)
    await expect(p.getByRole('button', { name: /Desativar/ })).toBeVisible()
  })
})
