import { test, expect } from '@playwright/test'
import { banco, tenantId, nomeDeTeste } from './apoio/banco'

/**
 * Ficha do cliente pela rede: editar os dados e desativar/reativar.
 *
 * As duas ações existiam no back-end sem nenhuma porta na interface —
 * `updateClientContactData` não recebia nome nem gênero, e `toggleClientStatus`
 * não tinha um único chamador. Este teste é o que impede que voltem a ficar
 * sem porta.
 */

const nomeOriginal = nomeDeTeste('Cliente ficha')
const nomeEditado  = `${nomeOriginal} (editado)`

let clientId: string | null = null

test.beforeAll(async () => {
  const db = banco()
  const { data, error } = await db.from('clients').insert({
    tenant_id: await tenantId(),
    name:      nomeOriginal,
    phone:     '(47) 98877-' + String(Date.now()).slice(-4),
    is_active: true,
  }).select('id').single()
  if (error) throw new Error(`Não consegui criar o cliente de teste: ${error.message}`)
  clientId = data.id as string
})

test.afterAll(async () => {
  if (clientId) await banco().from('clients').delete().eq('id', clientId)
})

async function abrirMenuDeAcoes(page: import('@playwright/test').Page) {
  const acoes = page.getByRole('button', { name: '+ Agendar' }).locator('xpath=..')
  await acoes.locator('button').nth(1).click()
}

test('editar nome e gênero, depois desativar e reativar — sem sair do /admin', async ({ page }) => {
  const db = banco()
  await page.goto(`/admin/clients/${clientId}?tab=dados`)

  // A aba Dados pode abrir por link ou por clique — o clique cobre os dois.
  const abaDados = page.getByRole('button', { name: 'Dados' }).or(page.getByRole('link', { name: 'Dados' })).first()
  if (await abaDados.isVisible()) await abaDados.click()

  // Ancorado no rótulo: o primeiro input da página é a busca da lista lateral.
  const campoNome = page.locator('xpath=//p[normalize-space()="Nome *"]/following::input[1]')
  await expect(campoNome).toHaveValue(nomeOriginal)
  await campoNome.fill(nomeEditado)
  await page.locator('xpath=//p[normalize-space()="Gênero"]/following::select[1]').selectOption('F')
  await page.getByRole('button', { name: /Salvar dados/ }).click()

  await expect.poll(async () => {
    const { data } = await db.from('clients').select('name, gender').eq('id', clientId!).single()
    return `${data?.name}|${data?.gender ?? ''}`
  }, { message: 'a aba Dados deveria gravar nome e gênero' }).toBe(`${nomeEditado}|F`)

  // -- Desativar -------------------------------------------------------------
  await page.reload()
  await abrirMenuDeAcoes(page)
  await page.getByRole('button', { name: 'Desativar cliente' }).click()

  await expect.poll(async () => {
    const { data } = await db.from('clients').select('is_active').eq('id', clientId!).single()
    return data?.is_active
  }, { message: 'desativar deveria gravar is_active = false' }).toBe(false)

  // -- Reativar --------------------------------------------------------------
  await page.reload()
  await abrirMenuDeAcoes(page)
  await page.getByRole('button', { name: 'Reativar cliente' }).click()

  await expect.poll(async () => {
    const { data } = await db.from('clients').select('is_active').eq('id', clientId!).single()
    return data?.is_active
  }, { message: 'reativar deveria devolver o cliente às listas' }).toBe(true)
})
