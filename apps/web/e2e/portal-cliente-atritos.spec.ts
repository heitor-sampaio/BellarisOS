import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Atritos do portal da cliente vistos na simulação de um dia de clínica
 * (2026-10-20):
 * - o login dizia "Portal de gestão" e não avisava que a senha inicial é o CPF;
 * - a tela de "sem acesso" falava de cargo e de rede com a CLIENTE, e o
 *   "Voltar" dela, aberta direto, ia para about:blank;
 * - o CEP do perfil não tinha máscara nem preenchia o endereço.
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`pa${marca}`)
  slug = (await banco().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`pa${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})
test.afterAll(async () => { await cliente?.limpar(); await rede?.limpar() })

test('o login fala com a clínica E com a cliente, e diz que a senha inicial é o CPF', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const p = await ctx.newPage()
    await p.goto('/login')
    await expect(p.getByText('Portal de gestão')).toHaveCount(0)
    await expect(p.getByText(/primeiro acesso, a senha é o seu CPF/)).toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('a cliente que abre uma tela da equipe vai ao portal dela (a tela de sem acesso falava de cargo e rede)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: cliente!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/financeiro`)
    await expect(p).toHaveURL(new RegExp(`/${slug}/cliente`))
    await expect(p.getByText('Você não tem acesso a esta área')).toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('a equipe, na tela de sem acesso aberta direto, vai ao início — não a about:blank', async ({ browser }) => {
  const { criarMembro } = await import('./apoio/sessao')
  const membro = await criarMembro(`pam${marca}`, { tenant: rede!.tenantId, rotulo: 'Sem financeiro', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  const ctx = await browser.newContext({ storageState: membro.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/financeiro')
    await expect(p.getByRole('heading', { name: 'Você não tem acesso a esta área' })).toBeVisible()
    await p.getByRole('button', { name: 'Ir para o início' }).click()
    await expect(p).toHaveURL(/\/admin\/dashboard/)
  } finally {
    await ctx.close()
    await membro.limpar()
  }
})

test('o CEP do perfil tem máscara e preenche o endereço', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: cliente!.estado })
  try {
    const p = await ctx.newPage()
    // O ViaCEP de mentira: o teste não depende da rede de fora.
    await p.route('https://viacep.com.br/**', r => r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' }),
    }))
    await p.goto(`/${slug}/cliente/perfil`)
    const cep = p.locator('input[name="zip_code"]')
    await expect(async () => {
      await p.getByRole('button', { name: 'Editar' }).click({ timeout: 1000 })
      await expect(cep).toBeVisible({ timeout: 1000 })
    }).toPass()
    await expect(async () => {
      await cep.fill('')
      await cep.pressSequentially('01001000')
      await expect(cep).toHaveValue('01001-000', { timeout: 1000 })
    }).toPass()
    await expect(p.locator('input[name="address"]')).toHaveValue('Praça da Sé')
    await expect(p.locator('input[name="neighborhood"]')).toHaveValue('Sé')
    await expect(p.locator('input[name="city"]')).toHaveValue('São Paulo')
  } finally {
    await ctx.close()
  }
})
