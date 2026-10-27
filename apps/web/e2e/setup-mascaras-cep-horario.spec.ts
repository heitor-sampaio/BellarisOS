import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { apagarRedeCriada } from './apoio/rede-criada'

/**
 * O setup (/setup) mascara o que a pessoa digita, completa o endereço pelo CEP
 * e pergunta o horário de funcionamento. A simulação de 2026-10-27 (A1-A3):
 * CNPJ, telefone e CEP ficavam crus; o CEP só buscava ao SAIR do campo; e o
 * horário só se ajustava escondido em Configurações → Unidades.
 */
const marca = Date.now().toString(36)
const db = () => banco()
let tenantId = ''
let dona: MembroDeTeste | null = null

test.beforeAll(async () => {
  const { data: t, error } = await db().from('tenants').insert({
    name: `${PREFIXO} Rede mascaras ${marca}`, slug: `e2e-mask-${marca}`, email: `e2e-mask-${marca}@bellaris.invalid`,
    plan_status: 'trial',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a rede').toBeNull()
  tenantId = t!.id
  dona = await criarMembro(`msk${marca}`, { tenant: tenantId, rotulo: 'Dona', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
})

test.afterAll(async () => {
  await dona?.limpar()
  if (tenantId) {
    await db().from('branches').delete().eq('tenant_id', tenantId)
    expect(await apagarRedeCriada(tenantId)).toEqual([])
  }
})

test('CNPJ, telefone e CEP com máscara; o CEP completa o endereço sozinho; o horário é perguntado e gravado', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  const p = await ctx.newPage()
  try {
    await p.route('https://viacep.com.br/ws/88010400/json/', r => r.fulfill({
      json: { logradouro: 'Rua Felipe Schmidt', bairro: 'Centro', localidade: 'Florianópolis', uf: 'SC' },
    }))
    await p.goto('/setup')
    await p.locator('#net-doc').pressSequentially('12345678000195')
    await expect(p.locator('#net-doc')).toHaveValue('12.345.678/0001-95')
    await p.locator('#net-phone').fill('')
    await p.locator('#net-phone').pressSequentially('48999990000')
    await expect(p.locator('#net-phone')).toHaveValue('(48) 99999-0000')
    await p.getByRole('button', { name: /Continuar/ }).click()

    await expect(p.getByText('Primeira unidade').first()).toBeVisible()
    await p.locator('#br-name').fill(`${PREFIXO} Unidade ${marca}`)
    await p.locator('#br-phone').pressSequentially('4833334444')
    await expect(p.locator('#br-phone')).toHaveValue('(48) 3333-4444')
    // 8 dígitos digitados: o endereço vem SEM sair do campo
    await p.locator('#br-zip').pressSequentially('88010400')
    await expect(p.locator('#br-zip')).toHaveValue('88010-400')
    await expect(p.locator('#br-city')).toHaveValue('Florianópolis')
    await expect(p.locator('#br-address')).toHaveValue(/Rua Felipe Schmidt/)

    // o horário: padrão seg–sáb 08–20, editável ali
    await expect(p.getByText('Horário de funcionamento').first()).toBeVisible()
    await expect(p.getByLabel('Segunda abre')).toBeChecked()
    await expect(p.getByLabel('Domingo abre')).not.toBeChecked()
    await p.getByLabel('Sábado abre').uncheck()
    await p.getByRole('button', { name: /Continuar/ }).click()
    await expect(p.getByText('Tudo pronto!')).toBeVisible()
  } finally { await ctx.close() }

  const { data: b } = await db().from('branches').select('horario, zip_code, phone').eq('tenant_id', tenantId).single()
  expect(b!.zip_code).toBe('88010-400')
  const h = b!.horario as { dias: Record<string, { de: string; ate: string }[]> }
  expect(h.dias['1']).toEqual([{ de: '08:00', ate: '20:00' }])
  expect(h.dias['6']).toEqual([])
  expect(h.dias['0']).toEqual([])
  const { data: t } = await db().from('tenants').select('document, phone').eq('id', tenantId).single()
  expect(t!.document, 'o CNPJ vai só com os dígitos').toBe('12345678000195')
})
