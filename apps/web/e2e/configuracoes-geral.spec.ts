import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'

/**
 * Configurações → Geral: os dados da rede, editáveis.
 *
 * A aba dizia "em breve" desde que a tela nasceu, e o dado já estava no banco:
 * nome, documento e contato da rede só mudavam por SQL. Pedido do Heitor em
 * 2026-09-25.
 *
 * O teste devolve o telefone ao que era: este é o banco de desenvolvimento e a
 * rede é a de verdade — o que se cria aqui se limpa, o que já existia não se
 * mexe (memória, §1).
 */
test('a aba Geral mostra os dados da rede e salva a edição', async ({ page }) => {
  const db = banco()
  const { data: antes, error } = await db.from('tenants').select('id, name, phone').limit(1).single()
  if (error) throw new Error(`não li a rede: ${error.message}`)

  const telefoneOriginal = (antes.phone as string | null) ?? ''
  const novo = '(47) 99999-0000'

  try {
    await page.goto('/admin/settings?tab=general')
    await page.waitForLoadState('networkidle')

    // O nome da rede chegou do banco, em vez do "em breve".
    await expect(page.locator('input[name="name"]')).toHaveValue(antes.name as string)

    // O que não se edita está na tela, não escondido.
    await expect(page.getByText('Endereço do portal')).toBeVisible()

    const telefone = page.locator('input[name="phone"]')
    await telefone.fill(novo)
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Salvo', { exact: true })).toBeVisible()

    // Gravou de verdade, não só na tela.
    const { data: depois } = await db.from('tenants').select('phone').eq('id', antes.id).single()
    expect(depois?.phone).toBe(novo)
  } finally {
    await db.from('tenants').update({ phone: telefoneOriginal || null }).eq('id', antes.id)
  }
})

test('documento com máscara é gravado só com os dígitos', async ({ page }) => {
  const db = banco()
  const { data: antes } = await db.from('tenants').select('id, document').limit(1).single()
  const original = (antes!.document as string | null) ?? ''

  try {
    await page.goto('/admin/settings?tab=general')
    await page.waitForLoadState('networkidle')

    await page.locator('input[name="document"]').fill('11.222.333/0001-81')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Salvo', { exact: true })).toBeVisible()

    // Com máscara, "11.222.333/0001-81" e "11222333000181" seriam dois
    // documentos diferentes para qualquer busca.
    const { data: depois } = await db.from('tenants').select('document').eq('id', antes!.id).single()
    expect(depois?.document).toBe('11222333000181')
  } finally {
    await db.from('tenants').update({ document: original || null }).eq('id', antes!.id)
  }
})
