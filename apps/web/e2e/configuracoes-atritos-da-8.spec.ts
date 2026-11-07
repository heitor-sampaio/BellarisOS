import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A2 da 8ª simulação (2026-11-06; os dois times esbarraram): "Preencher pela
 * taxa por parcela" multiplica (a regra do Heitor, r4-f15-01) e ninguém via
 * antes o que ia sair — 1x 2,80% virou 0,99% e o 2x 1,98%, mais barato que o
 * à vista; a tabela com o 2x abaixo do 1x salvava calada. Decidido pelo
 * princípio 2 (no máximo, avisar): a caixa mostra o que vai preencher e aponta
 * para "Colar a tabela da operadora"; o Salvar grava e AVISA a taxa que baixa
 * com mais vezes, sem recusar.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`cf8${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`cf8d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await db().from('payment_fees').delete().eq('tenant_id', rede.tenantId)
  await dona?.limpar()
  await rede?.limpar()
})

test('A2: "Preencher pela taxa por parcela" mostra antes o que vai preencher e aponta para "Colar a tabela"', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=comissoes')
    const card = p.getByLabel('Taxas da maquininha')
    await card.getByLabel('Taxa Crédito à vista', { exact: true }).fill('2,80')
    await card.getByRole('button', { name: 'Preencher pela taxa por parcela' }).click()
    const caixa = card.locator('[data-por-parcela]')
    await caixa.getByLabel('Taxa por parcela (%)').fill('0,99')
    await expect(caixa.locator('[data-vai-preencher]')).toContainText('1x 0,99% · 2x 1,98% · 3x 2,97%')
    await expect(caixa.locator('[data-vai-preencher]'), 'diz que o à vista muda').toContainText('o crédito à vista (1x) deixa de ser 2,80%')
    // A tabela da operadora não é assim? O caminho está ali.
    await caixa.getByRole('button', { name: 'Colar a tabela da operadora' }).click()
    await expect(card.locator('[data-colar-tabela]')).toBeVisible()
    await expect(card.getByLabel('Taxa Crédito à vista', { exact: true }), 'nada mudou sem o Preencher').toHaveValue('2,80')
  })
})

test('A2: a tabela com mais vezes MAIS BARATA salva e avisa, sem recusar', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=comissoes')
    const card = p.getByLabel('Taxas da maquininha')
    await card.getByLabel('Taxa Crédito à vista', { exact: true }).fill('2,80')
    await card.getByLabel('Taxa 2x', { exact: true }).fill('1,98')
    await card.getByRole('button', { name: 'Salvar taxas' }).click()
    await expect(card.locator('[data-aviso-taxa-menor]')).toContainText('2x (1,98%) sai mais barato que o crédito à vista (2,80%)')
  })
  await expect.poll(async () => ((await db().from('payment_fees').select('parcelas, taxa_pct')
    .eq('tenant_id', rede.tenantId).eq('metodo', 'CREDIT_CARD').order('parcelas')).data ?? [])
    .map(t => `${t.parcelas}x ${Number(t.taxa_pct)}`), { message: 'gravou como a clínica escolheu' }).toEqual(['1x 2.8', '2x 1.98'])
})

/**
 * A4 da 9ª simulação (2026-11-07): com a tabela da operadora "de 3,1 a 11,9",
 * os dois times digitaram as 12 caixas — ninguém achou o "Colar a tabela".
 * Agora ele é o caminho principal (o botão cheio), e o "de X a Y" digitado na
 * taxa por parcela é reconhecido como a FAIXA da tabela: não se inventa o
 * meio (princípio 4) — a tela leva ao colar já com o 1x e o último.
 */
test('A4 da 9ª: "Colar a tabela" é o caminho principal, e "de 3,1 a 11,9" leva a ele com as pontas', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=comissoes')
    const card = p.getByLabel('Taxas da maquininha')
    await expect(card.getByRole('button', { name: 'Colar a tabela da operadora' })).toHaveClass(/btn-primary/)
    await card.getByRole('button', { name: 'Preencher pela taxa por parcela' }).click()
    const caixa = card.locator('[data-por-parcela]')
    await caixa.getByLabel('Taxa por parcela (%)').fill('de 3,1 a 11,9')
    const faixa = caixa.locator('[data-faixa-da-operadora]')
    await expect(faixa).toContainText('é a faixa da tabela da operadora')
    await faixa.getByRole('button', { name: /Colar a tabela com 1x 3,1%/ }).click()
    const colada = card.getByLabel('Tabela da operadora')
    await expect(colada).toHaveValue(/^1x 3,1%\n/)
    await expect(colada).toHaveValue(/\n12x 11,9%$/)
    await expect(card.locator('[data-tabela-colada]')).toContainText('1x 3,10% · 12x 11,90%')
  })
})
