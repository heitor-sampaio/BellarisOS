import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarRedeCriada } from './apoio/rede-criada'

/**
 * F62 — o fuso da clínica (o Heitor, 2026-11-11: "Não, deixa a clinica
 * configurar o seu fuso"). A Acácia é de Manaus (UTC−4) e o sistema inteiro
 * trabalhava no horário de Brasília: o agendamento das 00:00 na tela era às
 * 23:00 no relógio da parede, e o "hoje", o Fechamento e as campanhas das
 * 09:00 seguiam Brasília.
 *
 * A unidade tem "Fuso horário" (Configurações → Unidade, o "Nova unidade" e o
 * setup), com o horário de Brasília como padrão — quem não mexer não vê nada
 * mudar —, e o CEP sugere o fuso pelo estado.
 *
 * Uma rede `[e2e]` só deste spec, com a unidade em Manaus.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestora: MembroDeTeste | null = null

async function como<T>(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fz${marca}`)
  gestora = await criarMembro(`fzg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora', permissoes: [
      { modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' },
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'reports', nivel: 'VIEW' },
    ],
  })
})

test.afterAll(async () => {
  if (rede) await db().from('branches').delete().eq('tenant_id', rede.tenantId).neq('id', rede.branchId)
  await gestora?.limpar()
  await rede?.limpar()
})

test.describe('o campo', () => {
  test('a unidade nasce no horário de Brasília, e Configurações → Unidade troca o fuso', async ({ browser }) => {
    const { data: antes } = await db().from('branches').select('fuso').eq('id', rede!.branchId).single<{ fuso: string }>()
    expect(antes?.fuso, 'o padrão, sem ninguém mexer').toBe('America/Sao_Paulo')

    await como(browser, gestora!, async p => {
      await p.goto(`/admin/branches/${rede!.branchId}`)
      const fuso = p.getByLabel('Fuso horário')
      await expect(fuso).toHaveValue('America/Sao_Paulo')
      await expect(fuso.locator('option:checked')).toHaveText(/Horário de Brasília/)
      await fuso.selectOption('America/Manaus')
      await p.getByRole('button', { name: 'Salvar alterações' }).click()
      await expect(p.getByText('Dados salvos com sucesso.')).toBeVisible()
    })
    const { data: depois } = await db().from('branches').select('fuso').eq('id', rede!.branchId).single<{ fuso: string }>()
    expect(depois?.fuso).toBe('America/Manaus')
  })

  test('o banco só aceita um fuso da lista', async () => {
    const { error } = await db().from('branches').update({ fuso: 'Europe/Lisbon' }).eq('id', rede!.branchId)
    expect(error?.message ?? '').toMatch(/branches_fuso_valido/)
  })

  test('o "Nova unidade" sugere o fuso pelo estado do CEP, e a unidade nasce com ele', async ({ browser }) => {
    const nome = `${PREFIXO} Cuiabá ${marca}`
    await como(browser, gestora!, async p => {
      await p.route('https://viacep.com.br/**', r => r.fulfill({
        json: { logradouro: 'Avenida Getúlio Vargas', bairro: 'Centro', localidade: 'Cuiabá', uf: 'MT' },
      }))
      await p.goto('/admin/settings?tab=unidades')
      await p.getByRole('button', { name: 'Nova unidade' }).click()
      const janela = p.getByRole('dialog', { name: 'Nova unidade' })
      await janela.locator('#br-name').fill(nome)
      await expect(janela.getByLabel('Fuso horário')).toHaveValue('America/Sao_Paulo')
      await janela.getByLabel('CEP').pressSequentially('78005000')
      await expect(janela.locator('#br-city')).toHaveValue('Cuiabá')
      await expect(janela.getByLabel('Fuso horário')).toHaveValue('America/Cuiaba')
      await expect(janela.locator('[data-fuso-sugerido]')).toContainText('MT')
      await janela.getByRole('button', { name: 'Criar unidade' }).click()
      await janela.getByRole('alertdialog', { name: 'Unidade sem CNPJ' }).getByRole('button', { name: 'Criar sem CNPJ' }).click()
      await expect(janela).toBeHidden({ timeout: 15_000 })
    })
    const { data } = await db().from('branches').select('fuso').eq('tenant_id', rede!.tenantId).eq('name', nome).single<{ fuso: string }>()
    expect(data?.fuso).toBe('America/Cuiaba')
  })

  test('o detalhe da unidade, com o CEP de outro fuso, sugere sem trocar sozinho', async ({ browser }) => {
    await db().from('branches').update({ fuso: 'America/Sao_Paulo' }).eq('id', rede!.branchId)
    await como(browser, gestora!, async p => {
      await p.route('https://viacep.com.br/**', r => r.fulfill({
        json: { logradouro: 'Rua Rio Negro', bairro: 'Adrianópolis', localidade: 'Manaus', uf: 'AM' },
      }))
      await p.goto(`/admin/branches/${rede!.branchId}`)
      const cep = p.getByLabel('CEP')
      await cep.fill('')
      await cep.pressSequentially('69057000')
      await expect(p.locator('#be-city')).toHaveValue('Manaus')
      await expect(p.getByLabel('Fuso horário'), 'nada se move sozinho').toHaveValue('America/Sao_Paulo')
      await expect(p.locator('[data-fuso-sugerido]')).toContainText('horário de Manaus')
      await p.locator('[data-fuso-sugerido]').getByRole('button', { name: 'Usar este' }).click()
      await expect(p.getByLabel('Fuso horário')).toHaveValue('America/Manaus')
    })
  })

  test('o setup sugere o fuso pelo CEP, e a primeira unidade nasce nele', async ({ browser }) => {
    const { data: t, error } = await db().from('tenants').insert({
      name: `${PREFIXO} Rede fuso setup ${marca}`, slug: `e2e-fzs-${marca}`, email: `e2e-fzs-${marca}@bellaris.invalid`,
      plan_status: 'trial',
    }).select('id').single<{ id: string }>()
    expect(error, 'criar a rede').toBeNull()
    const dona = await criarMembro(`fzs${marca}`, { tenant: t!.id, rotulo: 'Dona', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
    try {
      await como(browser, dona, async p => {
        await p.route('https://viacep.com.br/**', r => r.fulfill({
          json: { logradouro: 'Rua Rio Negro', bairro: 'Adrianópolis', localidade: 'Manaus', uf: 'AM' },
        }))
        await p.goto('/setup')
        await p.getByRole('button', { name: /Continuar/ }).click()
        await expect(p.getByText('Primeira unidade').first()).toBeVisible()
        await p.locator('#br-name').fill(`${PREFIXO} Adrianópolis ${marca}`)
        await p.locator('#br-zip').pressSequentially('69057000')
        await expect(p.locator('#br-city')).toHaveValue('Manaus')
        await expect(p.getByLabel('Fuso horário')).toHaveValue('America/Manaus')
        await expect(p.locator('[data-fuso-sugerido]')).toContainText('AM')
        await p.getByRole('button', { name: /Continuar/ }).click()
        await p.getByRole('alertdialog', { name: 'Unidade sem CNPJ' }).getByRole('button', { name: 'Criar sem CNPJ' }).click()
        await expect(p.getByText('Tudo pronto!')).toBeVisible()
      })
      const { data: b } = await db().from('branches').select('fuso').eq('tenant_id', t!.id).single<{ fuso: string }>()
      expect(b?.fuso).toBe('America/Manaus')
    } finally {
      await dona.limpar()
      await db().from('branches').delete().eq('tenant_id', t!.id)
      expect(await apagarRedeCriada(t!.id)).toEqual([])
    }
  })
})
