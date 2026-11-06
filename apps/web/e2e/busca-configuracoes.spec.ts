import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A18 da 8ª simulação (2026-11-06): no Ctrl K, "Funil" abria Oportunidades
 * (o quadro), e a configuração dos funis é a janela "Configurar funis" dele;
 * "Termos" abria Documentos (os emitidos), sem dizer onde ficam os modelos.
 * Agora "funil" acha "Oportunidades → Configurar funis", que abre a janela, e
 * as duas telas de "termos" dizem qual é qual. O catálogo e as regras estão no
 * Vitest (`tests/busca-configuracoes.test.ts`); aqui, a porta pela URL.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`bcf${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`bcfd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A18: "funil" no Ctrl K leva à configuração dos funis, e "termos" diz qual é a dos modelos', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/dashboard')
    const campo = p.getByRole('combobox', { name: 'Busca universal' })
    await campo.click()
    await campo.fill('termos')
    await expect(p.getByRole('option', { name: /Configurações → Documentos.*modelos de termo e contrato/ })).toBeVisible()
    await campo.fill('funil')
    await p.getByRole('option', { name: /Oportunidades → Configurar funis/ }).click()
    await expect(p.getByRole('heading', { name: 'Configurar funis' })).toBeVisible({ timeout: 20_000 })
    await expect(p, 'o parâmetro sai da URL ao abrir').not.toHaveURL(/configurar=/)
  } finally { await ctx.close() }
})
