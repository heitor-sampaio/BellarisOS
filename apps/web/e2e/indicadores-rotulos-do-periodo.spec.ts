import { test, expect } from '@playwright/test'

// D36 da simulação de um dia de clínica (2026-10-20): com o filtro "Hoje", os
// cartões do dashboard da rede diziam "Receita bruta do mês" e "vs. mês anterior".
test('o dashboard da rede diz o período escolhido', async ({ page }) => {
  await page.goto('/admin/dashboard?period=today')
  await expect(page.getByText('Receita bruta de hoje')).toBeVisible()
  await expect(page.getByText('Receita bruta do mês')).toHaveCount(0)
  await expect(page.getByText(/vs\. mês anterior/)).toHaveCount(0)
  await page.goto('/admin/dashboard?period=month')
  await expect(page.getByText('Receita bruta do mês')).toBeVisible()
})
