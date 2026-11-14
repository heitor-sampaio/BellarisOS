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
 * PDV8: a forma é um bloco (rádio) ao lado do Crediário e do A receber.
 */
export async function pagoNoPix(janela: Locator) {
  const formas = janela.getByRole('radiogroup', { name: /Forma de pagamento/ })
  if (await formas.count() === 0) return
  if (await formas.locator('[aria-checked="true"]').count() === 0) await formas.getByRole('radio', { name: 'Pix', exact: true }).click()
  // No Crediário com entrada, a entrada pede a forma dela.
  const daEntrada = janela.getByLabel('Forma da entrada')
  if (await daEntrada.count() === 1 && await daEntrada.inputValue() === '') await daEntrada.selectOption('PIX')
}

/** PDV8: escolhe o bloco da forma (`Pix`, `Crediário`, `A receber`…) numa venda. */
export async function escolherForma(janela: Locator, nome: string) {
  await janela.getByRole('radiogroup', { name: /Forma de pagamento/ }).getByRole('radio', { name: nome, exact: true }).click()
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

/**
 * O plano se recebe no PDV (fase 3, PT1b — a revisão do Heitor de 2026-11-13):
 * o aceite é um gesto (sem dinheiro), e a comanda do plano nasce no PDV, onde
 * se escolhe a forma, a cliente assina o contrato e paga. Aqui: aceita o plano
 * se ainda estiver proposto (ou em rascunho), abre a comanda dele no PDV do
 * portal pedido (`/<slug>` ou `/admin`) e clica "Receber o plano". Devolve a
 * janela "Receber o plano" — o mesmo assistente do antigo checkout, sem o
 * "Receber no atendimento" e sem o agendamento (as sessões se agendam depois).
 */
export async function receberPlanoNoPdv(page: Page, portal: string, planId: string): Promise<Locator> {
  const { banco } = await import('./banco')
  const { chamarAcao } = await import('./acao-direta')
  const { data: plano } = await banco().from('treatment_plans').select('status, branch_id').eq('id', planId)
    .single<{ status: string; branch_id: string }>()
  expect(plano, 'o plano existe').toBeTruthy()
  if (plano!.status === 'DRAFT' || plano!.status === 'PROPOSED') {
    const r = await chamarAcao(page, 'actions/treatment-plans.ts', 'aceitarPlano', `${portal}/pdv`, [planId])
    expect(r.texto, 'o aceite passou').not.toContain('"error"')
  }
  const { data: comanda } = await banco().from('comandas').select('id').eq('treatment_plan_id', planId)
    .is('cancelada_em', null).single<{ id: string }>()
  expect(comanda, 'a comanda do plano nasceu no aceite').toBeTruthy()
  await page.goto(`${portal}/pdv?unidade=${plano!.branch_id}&comanda=${comanda!.id}`)
  await page.getByRole('button', { name: 'Receber o plano' }).click()
  const janela = page.getByRole('dialog', { name: 'Receber o plano' })
  await expect(janela).toBeVisible()
  return janela
}
