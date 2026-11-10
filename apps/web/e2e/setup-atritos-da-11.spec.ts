import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { apagarRedeDeTeste } from './apoio/limpeza-adiada'

/**
 * A11 da 11ª simulação (2026-11-10): a Renata abriu a Violeta 24 h no setup
 * com 7 pares de hora e o domingo à mão — o "Repetir o horário de segunda"
 * existia e não foi notado. O atalho "Aberta 24 horas, todos os dias" grava a
 * meia-noite à meia-noite nos 7 dias (o `24:00` que o horário aceita), e a
 * linha do dia diz "24 horas" (o campo de hora não mostra 24:00).
 * Numa rede [e2e] própria, sem unidade (o setup).
 */

const marca = Date.now().toString(36)
const db = () => banco()
const CNPJ = ('5' + Date.now()).slice(-14)
let tenantId = ''
let dona: MembroDeTeste | null = null

test.beforeAll(async () => {
  const { data: t, error } = await db().from('tenants').insert({
    name: `${PREFIXO} Rede setup11 ${marca}`, slug: `e2e-s11-${marca}`, email: `e2e-s11-${marca}@bellaris.invalid`,
    document: CNPJ, plan_status: 'trial',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a rede').toBeNull()
  tenantId = t!.id
  dona = await criarMembro(`s11d${marca}`, { tenant: tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  if (tenantId) expect(await apagarRedeDeTeste(tenantId)).toEqual([])
})

test('A11: "Aberta 24 horas, todos os dias" no passo da unidade grava os 7 dias de 00:00 a 24:00', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  const p = await ctx.newPage()
  try {
    await p.goto('/setup')
    await p.getByRole('button', { name: /Continuar/ }).click()
    await p.locator('#br-name').fill(`${PREFIXO} Unidade s11 ${marca}`)
    await p.getByRole('button', { name: 'Aberta 24 horas, todos os dias' }).click()
    await expect(p.locator('[data-dia-inteiro]')).toHaveCount(7)
    await expect(p.getByLabel('Domingo abre')).toBeChecked()
    await p.locator('#br-address').fill('Rua da Bahia')
    await p.locator('#br-number').fill('10')
    await p.getByRole('button', { name: /Continuar/ }).click()
    await expect(p.getByText('Tudo pronto!')).toBeVisible()
    const { data: unidade } = await db().from('branches').select('horario').eq('tenant_id', tenantId)
      .single<{ horario: { dias: Record<string, { de: string; ate: string }[]> } }>()
    for (const dia of ['0', '1', '2', '3', '4', '5', '6']) {
      expect(unidade!.horario.dias[dia], `dia ${dia}`).toEqual([{ de: '00:00', ate: '24:00' }])
    }
  } finally {
    await ctx.close()
  }
})
