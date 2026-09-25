import { test, expect } from '@playwright/test'

/**
 * Clicar num horário vazio da agenda da rede abre o agendamento ali.
 *
 * A grade mostrava os buracos do dia e não deixava preencher nenhum: só o
 * agendamento já existente era clicável, e marcar exigia achar o botão no topo
 * e redigitar dia, hora e unidade que já estavam na ponta do dedo. Pedido do
 * Heitor em 2026-09-25.
 *
 * Nada é gravado aqui — o teste abre o modal e confere o que veio preenchido.
 * Criar agendamento de verdade já é coberto em `fase2-agenda`.
 */
test('clicar num horário vazio abre o agendamento naquele horário e unidade', async ({ page }) => {
  await page.goto('/admin/agenda')
  await page.waitForLoadState('networkidle')

  const coluna = page.locator('.agenda-coluna').first()
  await expect(coluna).toBeVisible()
  const unidadeClicada = await coluna.getAttribute('data-unidade')

  const caixa = await coluna.boundingBox()
  if (!caixa) throw new Error('não achei a coluna da grade')

  // Duas horas abaixo do topo da grade (07:00) → 09:00. HOUR_H é 72px.
  await page.mouse.click(caixa.x + caixa.width / 2, caixa.y + 2 * 72)

  await expect(page.getByRole('heading', { name: 'Novo agendamento' })).toBeVisible()

  // O horário do clique chegou ao campo, em vez de o modal abrir vazio.
  await expect(page.locator('input[type="datetime-local"]').first()).toHaveValue(/T09:00$/)

  // E a unidade é a COLUNA clicada, não a do filtro do topo — com "Toda a rede"
  // escolhido o modal abriria pedindo de novo o que o clique já disse.
  await expect(page.locator('select').first()).toHaveValue(unidadeClicada!)
})
