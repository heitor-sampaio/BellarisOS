import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { apagarRedeCriada } from './apoio/rede-criada'

/**
 * O setup (/setup), ajustes de 2026-10-30:
 * - J-1: o telefone gravado com o DDI ("5548999990000") voltava cortado;
 * - J-3: recarregar no passo da unidade voltava ao passo 1;
 * - J-6: a primeira unidade nascia sem CNPJ — agora herda o da rede.
 */
const marca = Date.now().toString(36)
const db = () => banco()
// O documento da rede é único no banco: um por rodada.
const CNPJ = ('3' + Date.now()).slice(-14)
const comMascara = (d: string) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
let tenantId = ''
let dona: MembroDeTeste | null = null

test.beforeAll(async () => {
  const { data: t, error } = await db().from('tenants').insert({
    name: `${PREFIXO} Rede passo ${marca}`, slug: `e2e-passo-${marca}`, email: `e2e-passo-${marca}@bellaris.invalid`,
    document: CNPJ, phone: '5548999990000', plan_status: 'trial',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a rede').toBeNull()
  tenantId = t!.id
  dona = await criarMembro(`pss${marca}`, { tenant: tenantId, rotulo: 'Dona', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
})

test.afterAll(async () => {
  await dona?.limpar()
  if (tenantId) {
    await db().from('branches').delete().eq('tenant_id', tenantId)
    expect(await apagarRedeCriada(tenantId)).toEqual([])
  }
})

test('o telefone com DDI inteiro; recarregar fica no passo da unidade; a unidade herda o CNPJ', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  const p = await ctx.newPage()
  try {
    await p.goto('/setup')
    await expect(p.locator('#net-phone'), 'J-1: o DDI sai, nada é cortado').toHaveValue('(48) 99999-0000')
    await p.getByRole('button', { name: /Continuar/ }).click()
    await expect(p.locator('#br-name')).toBeVisible()

    await p.reload()
    await expect(p.locator('#br-name'), 'J-3: recarregar fica no passo da unidade').toBeVisible()
    await expect(p.locator('#net-name')).toHaveCount(0)

    await expect(p.locator('#br-doc'), 'J-6: o CNPJ da rede vem preenchido').toHaveValue(comMascara(CNPJ))
    await p.locator('#br-name').fill(`${PREFIXO} Unidade ${marca}`)
    await p.getByRole('button', { name: /Continuar/ }).click()
    await expect(p.getByText('Tudo pronto!')).toBeVisible()
  } finally { await ctx.close() }

  const { data: b } = await db().from('branches').select('document').eq('tenant_id', tenantId).single<{ document: string | null }>()
  expect(b!.document?.replace(/\D/g, ''), 'a unidade nasce com o CNPJ da rede').toBe(CNPJ)
})
