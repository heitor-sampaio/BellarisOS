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
 * Este teste mexe na configuração real da rede, então guarda o estado anterior
 * e devolve no `finally` — a regra é não alterar o que eu não criei.
 */

const TAB = '/admin/settings?tab=integrations'

async function abrirOficial(page: import('@playwright/test').Page) {
  await page.goto(TAB)
  await page.waitForLoadState('networkidle')

  // O cartão do WhatsApp abre por clique no cabeçalho.
  const cartao = page.locator('#whatsapp')
  if (await cartao.count()) await cartao.first().click()

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
  const db = banco()
  const { data: antes } = await db.from('integration_configs')
    .select('id, config, is_active').eq('provider', 'official').maybeSingle()

  try {
    await abrirOficial(page)

    await page.getByRole('button', { name: 'Cloud API', exact: true }).click()

    // O formulário só salva com as quatro credenciais preenchidas.
    await page.locator('input[name="wabaId"]').fill('[e2e] waba')
    await page.locator('input[name="phoneNumberId"]').fill('[e2e] phone')
    await page.locator('input[name="accessToken"]').fill('[e2e] token')
    await page.locator('input[name="verifyToken"]').fill('[e2e] verify')
    await page.locator('input[name="appSecret"]').fill('[e2e] secret')

    await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(page.getByText('Configuração salva.')).toBeVisible()

    const { data: depois } = await db.from('integration_configs')
      .select('config').eq('provider', 'official').maybeSingle()
    expect((depois?.config as Record<string, unknown>)?.modo,
      'a escolha tem de sobreviver ao salvamento, senão é enfeite').toBe('cloud_api')
  } finally {
    // Devolve exatamente o que estava lá — inclusive a ausência da linha.
    if (antes) {
      await db.from('integration_configs')
        .update({ config: antes.config, is_active: antes.is_active })
        .eq('id', antes.id as string)
    } else {
      await db.from('integration_configs').delete().eq('provider', 'official')
    }
  }
})

test('quem já tem configuração volta no modo que escolheu', async ({ page }) => {
  const db = banco()
  const { data: antes } = await db.from('integration_configs')
    .select('id, config').eq('provider', 'official').maybeSingle()
  test.skip(!antes, 'a rede não tem configuração oficial para reabrir')

  try {
    await db.from('integration_configs')
      .update({ config: { ...(antes!.config as object), modo: 'cloud_api' } })
      .eq('id', antes!.id as string)

    await abrirOficial(page)

    // Reabriu no modo gravado, não no padrão.
    await expect(page.getByText(/número passa a viver só no sistema/i)).toBeVisible()
  } finally {
    await db.from('integration_configs')
      .update({ config: antes!.config }).eq('id', antes!.id as string)
  }
})
