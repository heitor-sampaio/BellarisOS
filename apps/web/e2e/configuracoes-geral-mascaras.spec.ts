import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-2 (2026-10-30): a aba Geral mostrava o CNPJ e o telefone crus
 * ("11222333000181", "5548999990000"), e o telefone mudava de formato depois de
 * salvar. Agora os dois têm a máscara enquanto se digita, e o telefone é
 * gravado no formato que a tela mostra — salvar não o muda.
 *
 * Rede `[e2e]` própria: o teste mexe nos dados da REDE.
 */

const marca = Date.now().toString(36)
const db = () => banco()
// O documento da rede é único no banco: um por rodada.
const CNPJ_ANTES = ('1' + Date.now()).slice(-14)
const CNPJ_DEPOIS = ('2' + Date.now()).slice(-14)
const comMascara = (d: string) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`gm${marca}`)
  const { error } = await db().from('tenants')
    .update({ document: CNPJ_ANTES, phone: '5548999990000' }).eq('id', rede.tenantId)
  expect(error, 'o CNPJ e o telefone da rede').toBeNull()
  dona = await criarMembro(`gm${marca}`, { tenant: rede.tenantId, rotulo: 'Dona', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
})
test.afterAll(async () => { await dona?.limpar(); await rede?.limpar() })

test('CNPJ e telefone com máscara; o telefone salvo é o que a tela mostra', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/settings?tab=general')
    const doc = p.locator('input[name="document"]')
    const fone = p.locator('input[name="phone"]')
    await expect(doc, 'o CNPJ gravado só com dígitos aparece com a máscara').toHaveValue(comMascara(CNPJ_ANTES))
    await expect(fone, 'o telefone com o DDI aparece com a máscara, sem o 55').toHaveValue('(48) 99999-0000')

    await fone.fill('')
    await fone.pressSequentially('4833334444')
    await expect(fone).toHaveValue('(48) 3333-4444')
    await doc.fill('')
    await doc.pressSequentially(CNPJ_DEPOIS)
    await expect(doc).toHaveValue(comMascara(CNPJ_DEPOIS))

    await p.getByRole('button', { name: 'Salvar' }).click()
    await expect(p.getByText('Salvo', { exact: true })).toBeVisible()
    await expect(fone, 'salvar não muda o formato').toHaveValue('(48) 3333-4444')

    const { data: t } = await db().from('tenants').select('document, phone').eq('id', rede!.tenantId).single()
    expect(t!.document, 'o CNPJ vai só com os dígitos').toBe(CNPJ_DEPOIS)
    expect(t!.phone, 'o telefone vai no formato da tela').toBe('(48) 3333-4444')

    await p.reload()
    await expect(fone, 'e volta igual').toHaveValue('(48) 3333-4444')
    await expect(doc).toHaveValue(comMascara(CNPJ_DEPOIS))
  } finally { await ctx.close() }
})
