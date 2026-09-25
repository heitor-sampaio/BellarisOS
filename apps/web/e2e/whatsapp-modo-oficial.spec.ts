import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'

/**
 * A escolha entre coexistência e Cloud API é real, não decorativa.
 *
 * Pedido do Heitor em 2026-09-25: "o cliente possa escolher se quer conectar
 * com coexistência (explicando o que significa) ou pela Cloud API (explicando
 * o que significa)".
 *
 * A escolha decide o que acontece com o aplicativo WhatsApp Business que está
 * no celular da clínica: na coexistência ele continua atendendo pelo mesmo
 * número; na Cloud API ele para. É uma decisão que não se desfaz clicando, e
 * por isso o aviso da Cloud API precisa estar VISÍVEL antes de alguém escolher,
 * não escondido atrás de um link.
 *
 * ⚠️ **A tabela é `whatsapp_numbers`, não `integration_configs`.** Quando a rede
 * passou a poder ter vários números, a credencial mudou de casa — e esta spec
 * ficou vermelha porque lia e restaurava a tabela antiga. Restaurar a errada é
 * pior que falhar: a asserção quebra e a configuração real fica com os valores
 * de teste dentro, sem ninguém ver.
 *
 * Este teste mexe na configuração real da rede, então guarda o estado anterior
 * e devolve no `finally` — a regra é não alterar o que eu não criei.
 */

const TAB = '/admin/settings?tab=integrations'

type Linha = {
  id: string; config: Record<string, unknown>; is_active: boolean
  label: string; phone_number_id: string | null; waba_id: string | null
}

const CAMPOS = 'id, config, is_active, label, phone_number_id, waba_id'

async function caixaOficial(): Promise<Linha | null> {
  const { data } = await banco().from('whatsapp_numbers')
    .select(CAMPOS).eq('provider', 'official').maybeSingle<Linha>()
  return data ?? null
}

/** Devolve a linha exatamente como estava — inclusive a ausência dela. */
async function restaurar(antes: Linha | null) {
  const db = banco()
  if (antes) {
    await db.from('whatsapp_numbers').update({
      config:          antes.config,
      is_active:       antes.is_active,
      label:           antes.label,
      phone_number_id: antes.phone_number_id,
      waba_id:         antes.waba_id,
    }).eq('id', antes.id)
  } else {
    await db.from('whatsapp_numbers').delete().eq('provider', 'official')
  }
}

/**
 * Abre o formulário da caixa OFICIAL.
 *
 * Desde que a rede passou a ter vários números, o cartão mostra a LISTA e o
 * formulário de credencial fica atrás do botão "Conexão" da linha — antes ele
 * era a primeira coisa do cartão. Não é detalhe de teste: é o fluxo real, e foi
 * a falta desse botão que quebrou estas três specs quando a lista entrou.
 */
async function abrirOficial(page: import('@playwright/test').Page) {
  const caixa = await caixaOficial()
  await page.goto(TAB)
  await page.waitForLoadState('networkidle')

  // O cartão do WhatsApp abre por clique no cabeçalho.
  const cartao = page.locator('#whatsapp')
  if (await cartao.count()) await cartao.first().click()

  if (caixa) {
    // Pela linha daquela caixa — não por texto solto, que casa com as `div`
    // de dentro e não tem os botões.
    await page.locator(`[data-numero="${caixa.id}"]`)
      .getByRole('button', { name: /Conexão/ }).click()
  }

  // O provedor oficial é o segundo botão do seletor de provedor.
  await page.getByRole('button', { name: /WhatsApp Oficial/ }).first().click()
}

test('os dois modos aparecem, e cada um explica o que significa', async ({ page }) => {
  await abrirOficial(page)

  const coexistencia = page.getByRole('button', { name: 'Coexistência', exact: true })
  const cloud        = page.getByRole('button', { name: 'Cloud API', exact: true })
  await expect(coexistencia).toBeVisible()
  await expect(cloud).toBeVisible()

  // Coexistência: o que ela promete é que nada para de funcionar.
  await coexistencia.click()
  await expect(page.getByText(/aplicativo continua funcionando/i)).toBeVisible()
  await expect(page.getByText(/conversas e os contatos.*são trazidos/i)).toBeVisible()

  // Cloud API: o que ela custa tem de estar na tela, não num link.
  await cloud.click()
  await expect(page.getByText(/número passa a viver só no sistema/i)).toBeVisible()
  await expect(page.getByText(/PARA de funcionar com esse número/)).toBeVisible()
})

test('o modo escolhido é gravado junto com a credencial', async ({ page }) => {
  const antes = await caixaOficial()

  try {
    await abrirOficial(page)

    await page.getByRole('button', { name: 'Cloud API', exact: true }).click()

    // O formulário só salva com as credenciais preenchidas.
    await page.locator('input[name="wabaId"]').fill('[e2e] waba')
    await page.locator('input[name="phoneNumberId"]').fill('[e2e] phone')
    await page.locator('input[name="accessToken"]').fill('[e2e] token')
    await page.locator('input[name="verifyToken"]').fill('[e2e] verify')
    await page.locator('input[name="appSecret"]').fill('[e2e] secret')

    await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(page.getByText('Configuração salva.')).toBeVisible()

    const depois = await caixaOficial()
    expect(depois?.config?.modo,
      'a escolha tem de sobreviver ao salvamento, senão é enfeite').toBe('cloud_api')

    // E o roteamento tem de acompanhar: é por `phone_number_id` que o webhook
    // acha a caixa. Gravar só no jsonb deixaria a entrega sem dono.
    expect(depois?.phone_number_id,
      'o id do número é a chave de roteamento, não um detalhe do formulário',
    ).toBe('[e2e] phone')
  } finally {
    await restaurar(antes)
  }
})

test('quem já tem configuração volta no modo que escolheu', async ({ page }) => {
  const antes = await caixaOficial()
  test.skip(!antes, 'a rede não tem caixa oficial para reabrir')

  try {
    await banco().from('whatsapp_numbers')
      .update({ config: { ...antes!.config, modo: 'cloud_api' } })
      .eq('id', antes!.id)

    await abrirOficial(page)

    // Reabriu no modo gravado, não no padrão.
    await expect(page.getByText(/número passa a viver só no sistema/i)).toBeVisible()
  } finally {
    await restaurar(antes)
  }
})
