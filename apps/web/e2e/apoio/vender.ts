import { expect, type Locator, type Page } from '@playwright/test'

/**
 * "Quem vendeu" nasce VAZIO em toda venda (r2-ven-12; o Heitor: "nasce sempre
 * vazio"): vazio, a venda pergunta antes. Nos specs que vendem pela tela e
 * não testam o campo, quem registra é quem vendeu — a opção dela diz
 * "(você)".
 */
export async function euVendi(janela: Locator) {
  const campo = janela.getByLabel('Quem vendeu')
  const minha = campo.locator('option', { hasText: '(você)' })
  await expect(minha, 'a opção de quem está registrando').toHaveCount(1)
  await campo.selectOption(await minha.getAttribute('value') ?? '')
}

/**
 * A forma de pagamento nasce VAZIA em toda tela de cobrança (A37 da 6ª
 * simulação: o Pix era o padrão calado). Nos specs que vendem pela tela e não
 * testam a forma, o Pix é escolhido aqui — só quando nada foi escolhido.
 */
export async function pagoNoPix(janela: Locator) {
  const campo = janela.getByLabel('Meio de pagamento')
  if (await campo.count() === 0) return
  if (await campo.inputValue() === '') await campo.selectOption('PIX')
}

/**
 * O checkout do PLANO também tem "Quem vendeu" (decisão 4 da 7ª simulação),
 * nascendo vazio: vazio, "Ir para a documentação" pergunta antes. Nos specs
 * que fecham o plano pela tela e não testam o campo, quem fecha é quem vendeu.
 */
export async function euVendiOPlano(page: Page) {
  await euVendi(page.locator('[data-quem-vendeu-do-plano]'))
}
