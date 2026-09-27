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

test('um número pode ter várias pessoas falando por ele', async ({ page }) => {
  // O caso que pediu a mudança (2026-09-27): um número de atendimento e as
  // SDRs todas respondendo por ele.
  const db     = banco()
  const tenant = await tenantId()

  const { data: ocupados } = await db.from('whatsapp_number_users').select('user_id')
  const fora = (ocupados ?? []).map(o => o.user_id as string)
  const { data: gente } = await db.from('users')
    .select('id, name').eq('tenant_id', tenant).eq('is_active', true).order('name')
  const livres = (gente ?? []).filter(u => !fora.includes(u.id as string)).slice(0, 2)
  test.skip(livres.length < 2, 'a rede de dev não tem duas pessoas livres')

  let criada: string | null = null
  try {
    const { data } = await db.from('whatsapp_numbers')
      .insert({
        tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} Atendimento ${marca}`,
        is_active: true, config: { token: `e2e-pessoas-${marca}` },
      })
      .select('id').single<Linha>()
    criada = data!.id

    await page.goto(TAB)
    await page.waitForLoadState('networkidle')
    const cartao = page.locator('#whatsapp')
    if (await cartao.count()) await cartao.first().click()

    const linha = page.locator(`[data-numero="${criada}"]`)
    await linha.getByRole('button', { name: /Nome e vínculos/ }).click()
    await linha.getByRole('button', { name: /Escolher pessoas/ }).click()
    for (const p of livres) {
      await linha.getByRole('button', { name: p.name as string, exact: true }).click()
    }
    if (process.env.PRINT_DIR) await page.screenshot({ path: `${process.env.PRINT_DIR}/pessoas.png`, fullPage: true })
    // Fecha o seletor: o clique fora cai no fundo transparente dele.
    const gatilho = (await linha.getByRole('button', { name: /^Editar$/ }).boundingBox())!
    await page.mouse.click(gatilho.x + gatilho.width / 2, gatilho.y + gatilho.height / 2)
    await linha.getByRole('button', { name: 'Salvar' }).click()

    await expect.poll(async () => {
      const { data: v } = await db.from('whatsapp_number_users')
        .select('user_id').eq('whatsapp_number_id', criada!)
      return (v ?? []).map(x => x.user_id as string).sort()
    }, { message: 'as duas pessoas ficam gravadas no número' })
      .toEqual(livres.map(p => p.id as string).sort())

    await expect(linha.getByText(/Falam por aqui/)).toBeVisible()
  } finally {
    if (criada) await db.from('whatsapp_numbers').delete().eq('id', criada)
  }
})
