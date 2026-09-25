import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO } from './apoio/banco'

/**
 * A rede enxerga as caixas que tem, e escolhe qual é o padrão.
 *
 * Enquanto o WhatsApp era um número só, o cartão de integrações podia ser só um
 * formulário. Com dois, ele não conseguia nem dizer QUAL conexão estava no ar —
 * e "padrão da rede" (por onde sai tudo que o sistema inicia) não tinha como
 * ser escolhido.
 *
 * O teste mexe no padrão REAL da rede, então guarda qual era e devolve no
 * `finally`. Trocar o padrão e deixar assim faria as automações passarem a
 * falar por outro número sem ninguém ter pedido.
 */

const TAB   = '/admin/settings?tab=integrations'
const marca = Date.now().toString(36)

type Linha = { id: string; is_default: boolean; label: string }

test('a lista mostra as caixas, e trocar o padrão move o selo', async ({ page }) => {
  const db     = banco()
  const tenant = await tenantId()

  const { data: padraoAntes } = await db.from('whatsapp_numbers')
    .select('id, is_default, label').eq('tenant_id', tenant).eq('is_default', true)
    .maybeSingle<Linha>()

  const rotulo = `${PREFIXO} Comercial ${marca}`
  let criada: string | null = null

  try {
    const { data, error } = await db.from('whatsapp_numbers')
      .insert({
        tenant_id: tenant, provider: 'uazapi', label: rotulo,
        is_active: true, config: { token: `e2e-tela-${marca}` },
      })
      .select('id').single<Linha>()
    expect(error, 'criar a caixa de teste').toBeNull()
    criada = data!.id

    await page.goto(TAB)
    await page.waitForLoadState('networkidle')
    const cartao = page.locator('#whatsapp')
    if (await cartao.count()) await cartao.first().click()

    // A caixa nova aparece na lista, com o nome que a rede deu.
    const linha = page.locator(`[data-numero="${criada}"]`)
    await expect(linha).toBeVisible()
    await expect(linha.getByText(rotulo, { exact: true })).toBeVisible()

    // Ela NÃO é o padrão: o selo está na outra.
    await expect(linha.getByText('Padrão', { exact: true })).toHaveCount(0)

    // Tornar padrão move o selo — e é o banco que garante que só há um.
    await linha.getByRole('button', { name: /Tornar padrão/ }).click()
    await expect.poll(async () => {
      const { data } = await db.from('whatsapp_numbers')
        .select('id').eq('tenant_id', tenant).eq('is_default', true)
      return (data ?? []).map(n => n.id as string)
    }, { message: 'um padrão, e o que foi escolhido' }).toEqual([criada])
  } finally {
    if (criada) await db.from('whatsapp_numbers').delete().eq('id', criada)
    // Devolve o padrão de antes. Sem isto, as automações da rede passariam a
    // sair por outro número por causa de um teste.
    if (padraoAntes) {
      await db.from('whatsapp_numbers')
        .update({ is_default: true }).eq('id', padraoAntes.id)
    }
  }
})

test('o banco recusa dois padrões, mesmo que a tela tente', async () => {
  const db     = banco()
  const tenant = await tenantId()

  const { data: jaTem } = await db.from('whatsapp_numbers')
    .select('id').eq('tenant_id', tenant).eq('is_default', true).maybeSingle<Linha>()
  test.skip(!jaTem, 'a rede não tem padrão para conflitar')

  let criada: string | null = null
  try {
    const { data } = await db.from('whatsapp_numbers')
      .insert({
        tenant_id: tenant, provider: 'uazapi',
        label: `${PREFIXO} segunda ${marca}`, is_active: true,
        config: { token: `e2e-seg-${marca}` },
      })
      .select('id').single<Linha>()
    criada = data!.id

    const { error } = await db.from('whatsapp_numbers')
      .update({ is_default: true }).eq('id', criada)

    // A garantia é do índice, não da action: um `update` direto — de um script,
    // de uma migração, do próximo caminho de escrita — não passa por ela.
    expect(error?.code, 'o índice único parcial é quem garante').toBe('23505')
  } finally {
    if (criada) await db.from('whatsapp_numbers').delete().eq('id', criada)
  }
})
