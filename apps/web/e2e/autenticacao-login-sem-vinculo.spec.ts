import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'

/**
 * "Não deve ter como ter um login sem vínculo, ou é rede ou é unidade" (o
 * Heitor, 5ª simulação, 2026-11-01). Todo login da CLÍNICA é membro de uma
 * rede ou cliente com ficha. Os caminhos que criam e desfazem vínculo não
 * deixam sobra; como defesa, o login sem vínculo que ainda existir NÃO entra
 * e ouve o porquê — antes voltava mudo ao formulário (o destino era o
 * `/auth/redirect`, que caía no `/login` de novo, com a sessão aberta).
 */

const marca = Date.now().toString(36)
const email = `e2e-sem-vinculo-${marca}@bellaris.invalid`
const senha = `E2e-${marca}-Senha!`
let authId: string | null = null

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  const { data, error } = await banco().auth.admin.createUser({ email, password: senha, email_confirm: true })
  expect(error).toBeNull()
  authId = data.user!.id
})

test.afterAll(async () => {
  if (authId) expect((await banco().auth.admin.deleteUser(authId)).error).toBeNull()
})

test('o login sem rede nem ficha não entra e diz que a conta não tem acesso a nenhuma clínica', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText('Esta conta não tem acesso a nenhuma clínica.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
  // E a sessão não ficou aberta: o /admin manda de volta ao login.
  await page.goto('/admin/dashboard')
  await expect(page).toHaveURL(/\/login/)
  const cookies = await page.context().cookies()
  expect(cookies.filter(c => c.name.startsWith('sb-') && c.value), 'sem cookie de sessão').toEqual([])
})
