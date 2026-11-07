import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { apagarRedeDeTeste } from './apoio/limpeza-adiada'

/**
 * O /setup na 9ª simulação (2026-11-07):
 * - A1: criada a unidade, qualquer URL do /admin voltava ao "Tudo pronto!"
 *   até o clique em "Acessar o painel" — quem fechava a aba no passo 3 caía
 *   nele de novo. O setup se dá por concluído quando a unidade existe.
 * - A2: a clínica 24 h preenchia 14 campos de hora (falta "repetir em todos os
 *   dias"); o telefone da unidade tinha `id="br-phone"` duas vezes.
 * - A7: a unidade nova não tinha o número do endereço (o CEP preenche só o
 *   logradouro).
 */
const marca = Date.now().toString(36)
const db = () => banco()
const CNPJ = ('4' + Date.now()).slice(-14)
let tenantId = ''
let dona: MembroDeTeste | null = null

test.beforeAll(async () => {
  const { data: t, error } = await db().from('tenants').insert({
    name: `${PREFIXO} Rede setup9 ${marca}`, slug: `e2e-s9-${marca}`, email: `e2e-s9-${marca}@bellaris.invalid`,
    document: CNPJ, plan_status: 'trial',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a rede').toBeNull()
  tenantId = t!.id
  dona = await criarMembro(`s9d${marca}`, { tenant: tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  if (tenantId) {
    // A rede inteira numa passada no servidor (a dona abriu o painel: há mais que a unidade).
    expect(await apagarRedeDeTeste(tenantId)).toEqual([])
  }
})

test('A2 e A7: um id por campo, "repetir em todos os dias", e o número do endereço; A1: criada a unidade, o /admin não volta ao setup', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  const p = await ctx.newPage()
  try {
    await p.goto('/setup')
    await p.getByRole('button', { name: /Continuar/ }).click()
    await expect(p.locator('#br-name')).toBeVisible()
    await expect(p.locator('[id="br-phone"]'), 'A2: um campo de telefone só').toHaveCount(1)

    await p.locator('#br-name').fill(`${PREFIXO} Unidade s9 ${marca}`)
    // A2: a clínica 24 h ajusta a segunda e repete em todos os dias (o domingo também).
    await p.getByLabel('Segunda, abre às').fill('00:00')
    await p.getByLabel('Segunda, fecha às').fill('23:30')
    await p.getByRole('button', { name: /Repetir o horário de segunda em todos os dias/ }).click()
    await expect(p.getByLabel('Domingo abre')).toBeChecked()
    await expect(p.getByLabel('Domingo, fecha às')).toHaveValue('23:30')

    // A7: o número vai junto do logradouro.
    await p.locator('#br-address').fill('Rua Padre Chagas')
    await p.locator('#br-number').fill('123')
    await p.getByRole('button', { name: /Continuar/ }).click()
    await expect(p.getByText('Tudo pronto!')).toBeVisible()

    const { data: unidade } = await db().from('branches').select('address, horario').eq('tenant_id', tenantId).single<{ address: string; horario: { dias: Record<string, { de: string; ate: string }[]> } }>()
    expect(unidade!.address).toBe('Rua Padre Chagas, 123')
    expect(unidade!.horario.dias['0']).toEqual([{ de: '00:00', ate: '23:30' }])

    // A1: fechou a aba no "Tudo pronto!" — o /admin abre, sem voltar ao setup.
    await p.goto('/admin/dashboard')
    await expect(p).toHaveURL(/\/admin\/dashboard/)
    await expect(p.getByText('Tudo pronto!')).toHaveCount(0)
  } finally {
    await ctx.close()
  }
})
