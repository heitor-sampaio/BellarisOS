import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'

/**
 * O painel de conferência (Fase 6).
 *
 * O que ele existe para responder é uma pergunta só: **este gatilho já
 * disparou alguma vez?** Montar automação sobre um evento que nunca ocorreu é
 * um erro mudo — a automação fica ativa e silenciosa, e o sintoma de "o nome
 * está errado" é idêntico ao de "ainda não aconteceu". Por isso as asserções
 * daqui são sobre o CATÁLOGO INTEIRO aparecer, inclusive o que tem zero
 * ocorrências, e não só sobre a lista das últimas linhas.
 */

test('a aba Eventos mostra o catálogo inteiro e a corrente, com detalhe do payload', async ({ page }) => {
  const db = banco()

  const { data: exemplo } = await db
    .from('domain_events')
    .select('nome')
    .order('ocorrido_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  test.skip(!exemplo, 'a corrente está vazia neste banco')

  await page.goto('/admin/settings?tab=eventos')
  await expect(page.getByRole('heading', { name: 'Eventos do sistema' })).toBeVisible()

  // O catálogo INTEIRO está acessível, não só o que já ocorreu — é a
  // diferença entre "nunca vi esse evento" e "esse evento não existe". Os
  // mudos ficam atrás de um clique só para não empurrarem a corrente para
  // fora da primeira tela no celular.
  const catalogo = page.locator('.card').first()
  await expect(catalogo.getByText(/eventos declarados/)).toBeVisible()
  await catalogo.getByRole('button', { name: /nunca ocorreram/ }).click()
  await expect(catalogo.getByRole('button', { name: /agendamento\.criado/ })).toBeVisible()

  // Uma linha da corrente abre o payload; sem ele o painel só diria que algo
  // aconteceu, e quem monta automação precisa ver o formato dos dados.
  const primeira = page.locator('button', { hasText: exemplo!.nome as string }).last()
  await primeira.click()
  await expect(page.locator('pre')).toBeVisible()
  await expect(page.locator('pre')).toContainText('"dados"')

  // Filtrar por um evento existente não pode esvaziar a lista.
  await page.locator('select').first().selectOption(exemplo!.nome as string)
  await expect(page.getByText('Nenhum evento com esses filtros.')).toBeHidden()
})
