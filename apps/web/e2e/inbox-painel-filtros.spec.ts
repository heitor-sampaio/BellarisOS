import { test, expect } from '@playwright/test'

/**
 * O painel de filtros do inbox cabe na tela.
 *
 * Ele nascia ancorado à ESQUERDA do gatilho, e o gatilho fica no fim da barra
 * de busca. No desktop isso é inofensivo — o painel avança sobre a conversa,
 * que é o que um popover faz. Abaixo de 1024px a lista ocupa a tela inteira, o
 * gatilho encosta na borda direita, e 288px de painel começavam metade fora da
 * tela: a coluna da direita ficava cortada, sem rolagem que a alcançasse.
 *
 * Achado depois da padronização dos seletores, em 2026-09-25.
 */

const LARGURAS = [
  { nome: 'telefone estreito', w: 360, h: 780 },
  { nome: 'telefone',          w: 390, h: 844 },
  { nome: 'tablet',            w: 820, h: 1180 },
  { nome: 'desktop',           w: 1440, h: 950 },
]

for (const { nome, w, h } of LARGURAS) {
  test(`o painel de filtros cabe na tela — ${nome} (${w}px)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/admin/inbox')
    await page.waitForLoadState('networkidle')

    await page.locator('button[title="Filtrar conversas"]').click()
    const painel = page.locator('.painel-de-filtros')
    await expect(painel).toBeVisible()

    const caixa = await painel.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { esquerda: Math.round(r.left), direita: Math.round(r.right) }
    })

    expect(caixa.esquerda, `${nome}: o painel começa fora da tela`).toBeGreaterThanOrEqual(0)
    expect(caixa.direita, `${nome}: o painel passa da borda direita`).toBeLessThanOrEqual(w)

    // E o conteúdo de dentro não estoura o painel: foi o que fez a coluna da
    // direita sumir na primeira vez.
    const estouro = await painel.evaluate(el => el.scrollWidth - el.clientWidth)
    expect(estouro, `${nome}: o conteúdo é mais largo que o painel`).toBeLessThanOrEqual(1)
  })
}
