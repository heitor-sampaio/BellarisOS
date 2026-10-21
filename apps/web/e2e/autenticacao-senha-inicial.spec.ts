import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * A senha inicial se troca no primeiro acesso (2026-10-21, decisão do Heitor;
 * atrito da simulação de um dia de clínica): o formulário de membro prometia a
 * troca e ninguém era obrigado, e a cliente continuava com o CPF de senha, sem
 * ter onde trocar.
 *
 * Quem nasce com a senha dada por outra pessoa (o membro criado pela Equipe, a
 * cliente com o acesso criado pela clínica) leva a marca
 * `app_metadata.senha_provisoria`; com ela, toda tela leva a
 * `/update-password?primeiro=1` até a senha mudar. E todo mundo troca a senha
 * quando quiser (a cliente, no perfil).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let membro: MembroDeTeste | null = null
let slug = ''
const NOME = `${PREFIXO} Senha inicial ${marca}`
const EMAIL = `e2e-si${marca}@bellaris.invalid`

function cpfDeTeste(): string {
  const base = String(Date.now()).slice(-9).split('').map(Number)
  const dv = (nums: number[]) => {
    const r = (nums.reduce((s, n, i) => s + n * (nums.length + 1 - i), 0) * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(base)
  return [...base, d1, dv([...base, d1])].join('')
}
const CPF = cpfDeTeste()

const marcaDe = async (authId: string) =>
  ((await db().auth.admin.getUserById(authId)).data.user?.app_metadata as { senha_provisoria?: boolean } | undefined)?.senha_provisoria ?? null

async function entrar(p: Page, email: string, senha: string) {
  await p.goto('/login')
  await expect(async () => {
    await p.locator('#email').fill(email)
    await p.locator('#password').fill(senha)
    await p.getByRole('button', { name: 'Entrar' }).click()
    await expect(p).toHaveURL(/\/update-password\?primeiro=1/, { timeout: 10_000 })
  }).toPass({ timeout: 40_000 })
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`si${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  recepcao = await criarMembro(`sir${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const { data } = await db().from('clients').select('id, auth_id').eq('name', NOME)
  for (const c of (data ?? []) as { id: string; auth_id: string | null }[]) {
    if (c.auth_id) await db().auth.admin.deleteUser(c.auth_id)
  }
  expect(await apagarClientes((data ?? []).map(c => c.id as string))).toEqual([])
  await membro?.limpar()
  await recepcao?.limpar()
  await rede?.limpar()
})

test.describe.serial('a senha inicial', () => {
  test('a cliente com o acesso criado pela clínica entra com o CPF e troca a senha antes de tudo', async ({ browser }) => {
    const equipe = await browser.newContext({ storageState: recepcao!.estado })
    try {
      const p = await equipe.newPage()
      await p.goto('/admin/clients/new')
      await p.locator('input[name="name"]').fill(NOME)
      await p.locator('input[name="phone"]').fill('48 9' + String(Date.now()).slice(-8))
      await expect(async () => {
        await p.locator('input[name="email"]').fill('')
        await p.locator('input[name="email"]').fill(EMAIL)
        await p.locator('input[name="document"]').fill('')
        await p.locator('input[name="document"]').fill(CPF)
        await p.getByRole('checkbox', { name: 'Criar o acesso ao app' }).check({ timeout: 1000 })
      }).toPass()
      await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
      await expect(p).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/)
    } finally {
      await equipe.close()
    }
    const authId = (await db().from('clients').select('auth_id').eq('name', NOME).single<{ auth_id: string }>()).data!.auth_id
    expect(await marcaDe(authId), 'o acesso criado pela clínica nasce provisório').toBe(true)

    const dela = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const p = await dela.newPage()
      await entrar(p, EMAIL, CPF)
      await expect(p.getByRole('heading', { name: 'Troque a senha inicial' })).toBeVisible()

      await p.goto(`/${slug}/cliente/home`)
      await expect(p, 'nenhuma tela antes da troca').toHaveURL(/\/update-password\?primeiro=1/)

      await p.locator('#password').fill(`Nova-${marca}-1`)
      await p.locator('#confirmPassword').fill(`Nova-${marca}-1`)
      await p.getByRole('button', { name: 'Salvar nova senha' }).click()
      await expect(p).toHaveURL(new RegExp(`/${slug}/cliente/home`))
      await expect(p.getByText(/^Olá, /), 'a tela inicial carregou').toBeVisible()
      expect(await marcaDe(authId), 'trocada, a marca sai').toBeFalsy()

      await p.goto(`/${slug}/cliente/perfil`)
      await expect(p, 'e a sessão segue sem a marca').toHaveURL(new RegExp(`/${slug}/cliente/perfil`))
      await expect(p.getByRole('link', { name: 'Trocar senha' })).toHaveAttribute('href', '/update-password')
    } finally {
      await dela.close()
    }
  })

  test('o membro com senha provisória também troca antes de entrar', async ({ browser }) => {
    membro = await criarMembro(`sim${marca}`, { tenant: rede!.tenantId, rotulo: 'Novo', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
    const { data: u } = await db().from('users').select('auth_id, email').eq('id', membro.userId).single<{ auth_id: string; email: string }>()
    const { error } = await db().auth.admin.updateUserById(u!.auth_id, { password: `Inicial-${marca}`, app_metadata: { senha_provisoria: true } })
    expect(error).toBeNull()

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const p = await ctx.newPage()
      await entrar(p, u!.email, `Inicial-${marca}`)
      await p.goto('/admin/agenda')
      await expect(p).toHaveURL(/\/update-password\?primeiro=1/)
    } finally {
      await ctx.close()
    }
  })
})
