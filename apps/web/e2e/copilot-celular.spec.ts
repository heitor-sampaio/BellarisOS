import { test, expect } from '@playwright/test'
import { redeDoCopilot, contraAFalsa, type RedeDoCopilot } from './apoio/copilot'

/**
 * O Copilot no CELULAR (pedido do Heitor, 2026-10-08): no app Android a folha
 * ia até o fim da tela e o rodapé (o campo e o Enviar) ficava atrás da barra
 * de navegação do sistema. O app desenha de ponta a ponta (a barra é
 * transparente, com a faixa rosé do `html.capacitor::after` por cima) e
 * informa a altura dela em `env(safe-area-inset-bottom)`.
 *
 * O Chromium simula essa barra pelo CDP (`Emulation.setSafeAreaInsetsOverride`):
 * é o que o teste faz, com 48 px — a barra de gestos/botões de um Android.
 */
test.skip(!contraAFalsa(), 'só contra o build: o painel só aparece com a OpenAI configurada')
test.use({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })

const marca = Date.now().toString(36)
const BARRA = 48
let rede: RedeDoCopilot

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await redeDoCopilot(`cel${marca}`)
})
test.afterAll(async () => { await rede?.limpar() })

test('o rodapé do painel fica ACIMA da barra de navegação do Android', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: rede.dono.estado, viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })
  try {
    const p = await ctx.newPage()
    const cdp = await ctx.newCDPSession(p)
    await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: { top: 24, bottom: BARRA } } as never)
    await p.goto('/admin/dashboard')
    // O simulador vale: o env() da página já enxerga a barra.
    const inset = await p.evaluate(() => {
      const d = document.createElement('div')
      d.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px)'
      document.body.appendChild(d)
      const h = d.getBoundingClientRect().height
      d.remove()
      return h
    })
    expect(inset, 'o Chromium simulou a barra').toBe(BARRA)

    await p.getByRole('button', { name: 'Copilot', exact: true }).click()
    const painel = p.getByRole('dialog', { name: 'Copilot' })
    await expect(painel).toBeVisible()
    const altura = p.viewportSize()!.height
    for (const [nome, alvo] of [
      ['o campo', painel.getByRole('textbox', { name: 'Mensagem para o Copilot' })],
      ['o microfone', painel.getByRole('button', { name: 'Gravar áudio' })],
      // O rodapé inteiro: embaixo do campo mora o aviso de não mandar dado clínico.
      ['o aviso', painel.getByText('Não envie dados de prontuário.', { exact: false })],
    ] as const) {
      const caixa = (await alvo.boundingBox())!
      expect(caixa.y + caixa.height, `${nome} acima da barra`).toBeLessThanOrEqual(altura - BARRA)
    }
  } finally {
    await ctx.close()
  }
})
