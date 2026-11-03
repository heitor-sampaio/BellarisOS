import { expect, type Locator } from '@playwright/test'

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
