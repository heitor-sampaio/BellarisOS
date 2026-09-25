import { test, expect, type Page } from '@playwright/test'

/**
 * Toda tela do portal da rede abre — e abre com conteúdo.
 *
 * O erro que este arquivo persegue não é o 500: é a consulta que falha em
 * silêncio e vira tela vazia, 404 ou "R$ 0,00". Por isso cada rota é checada
 * em três frentes: o HTTP não é de erro, a página não caiu no `notFound` e o
 * título esperado está lá.
 */

const TELAS: { rota: string; titulo: RegExp }[] = [
  { rota: '/admin/dashboard',     titulo: /dashboard|bom dia|boa tarde|boa noite/i },
  { rota: '/admin/agenda',        titulo: /agenda/i },
  { rota: '/admin/clients',       titulo: /clientes/i },
  { rota: '/admin/planejamentos', titulo: /planejamentos|tratamentos/i },
  { rota: '/admin/injetaveis',    titulo: /injet/i },
  { rota: '/admin/inbox',         titulo: /inbox|conversas/i },
  { rota: '/admin/oportunidades', titulo: /oportunidades/i },
  { rota: '/admin/notificacoes',  titulo: /notifica/i },
  { rota: '/admin/marketing',     titulo: /marketing/i },
  { rota: '/admin/templates',     titulo: /templates/i },
  { rota: '/admin/financeiro',    titulo: /financeiro|caixa/i },
  { rota: '/admin/estoque',       titulo: /estoque/i },
  { rota: '/admin/reports',       titulo: /relat/i },
  // A antiga /admin/comercial agora redireciona para esta aba.
  { rota: '/admin/reports?tab=comercial', titulo: /comercial/i },
  { rota: '/admin/team',          titulo: /equipe/i },
  { rota: '/admin/procedures',    titulo: /procedimentos/i },
  { rota: '/admin/branches',      titulo: /unidades|filiais/i },
  { rota: '/admin/settings',      titulo: /configura/i },
]

/** As abas de Configurações são telas distintas atrás da mesma rota. */
const ABAS_DE_CONFIG = ['unidades', 'permissions', 'fichas', 'integrations', 'lgpd', 'eventos', 'general']

async function abrir(page: Page, rota: string) {
  const res = await page.goto(rota, { waitUntil: 'domcontentloaded' })
  expect(res, `sem resposta em ${rota}`).not.toBeNull()
  expect(res!.status(), `${rota} respondeu ${res!.status()}`).toBeLessThan(400)
  // Nem o 404 do Next nem o erro de runtime do App Router.
  await expect(page.locator('body')).not.toContainText('This page could not be found')
  await expect(page.locator('body')).not.toContainText('Application error')
}

test.describe('portal da rede', () => {
  for (const { rota, titulo } of TELAS) {
    test(`abre ${rota}`, async ({ page }) => {
      await abrir(page, rota)
      await expect(page.locator('body')).toContainText(titulo)
    })
  }

  for (const aba of ABAS_DE_CONFIG) {
    test(`abre a aba ${aba} de Configurações`, async ({ page }) => {
      await abrir(page, `/admin/settings?tab=${aba}`)
      await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible()
    })
  }

  test('quem é da rede não é expulso para o portal de uma unidade', async ({ page }) => {
    await abrir(page, '/admin/dashboard')
    expect(page.url()).toContain('/admin/')
  })
})
