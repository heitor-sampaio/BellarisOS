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

/**
 * Só se vende pelo PDV (PDV7, a revisão do Heitor de 2026-11-13): a "Nova
 * venda" abre com a cliente escolhida (`?nova=1&cliente=`), no portal pedido
 * (`/<slug>` ou `/admin`). No portal da rede com mais de uma unidade, a
 * unidade da venda é a do PDV (`unidadeId` → `?unidade=`). Devolve a região
 * "Vender", que tem o mesmo conteúdo da antiga janela da ficha.
 */
export async function abrirVendaNoPdv(page: Page, portal: string, clienteId: string, unidadeId?: string | null): Promise<Locator> {
  const q = new URLSearchParams({ nova: '1', cliente: clienteId })
  if (unidadeId) q.set('unidade', unidadeId)
  await page.goto(`${portal}/pdv?${q.toString()}`)
  const venda = page.getByRole('region', { name: 'Vender' })
  await expect(venda.locator('[data-cliente-da-venda]')).toBeVisible()
  return venda
}

/**
 * Na rede com mais de uma unidade, a "Nova venda" que chega sem `?unidade=`
 * (o inbox, a busca) pergunta "Em qual unidade?" antes (F33). Escolhe a
 * unidade pelo nome (ou a primeira) quando a pergunta aparece.
 */
export async function escolherAUnidadeDaVenda(venda: Locator, nome?: string | RegExp) {
  const pergunta = venda.locator('[data-unidade-da-venda]')
  await expect(pergunta.or(venda.locator('[data-cliente-da-venda]')).first()).toBeVisible({ timeout: 20_000 })
  if (await pergunta.count() === 0) return
  const opcoes = pergunta.getByRole('button')
  await (nome ? opcoes.filter({ hasText: nome }).first() : opcoes.first()).click()
  await expect(venda.locator('[data-cliente-da-venda]')).toBeVisible({ timeout: 20_000 })
}
