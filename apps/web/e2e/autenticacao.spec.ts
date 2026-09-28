import { test, expect, type Browser } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Entrar, recuperar a senha e cadastrar — pela tela, sem sessão.
 *
 * Nenhum e-mail sai: o link de recuperação vem do `generateLink` do admin
 * (que só devolve o token), e o cadastro testado é o do e-mail que JÁ existe —
 * o Supabase não manda nada nesse caso. Cadastro novo mandaria confirmação de
 * verdade, e fica de fora de propósito.
 *
 * Achados corrigidos junto:
 *  - o link do "esqueci minha senha" apontava para /auth/update-password, que
 *    não existia: a recuperação inteira terminava num 404. Agora
 *    /auth/confirm abre a sessão e /update-password troca a senha;
 *  - cadastrar um e-mail que já tem conta criava uma rede "Minha Clínica"
 *    órfã: com confirmação de e-mail ligada, o Supabase não dá erro, devolve
 *    um usuário disfarçado.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const SENHA = `Senha-e2e-${marca}`
const NOVA  = `Nova-e2e-${marca}`

interface Fx { outra: OutraRede; membro: MembroDeTeste; email: string; authId: string }
let f: Fx | null = null

test.beforeAll(async () => {
  const outra = await criarOutraRede(`auth${marca}`)
  const membro = await criarMembro(`auth${marca}`, {
    tenant: outra.tenantId, rotulo: 'Login', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  const { data, error } = await db().from('users').select('auth_id, email').eq('id', membro.userId).single()
  expect(error).toBeNull()
  const { error: erroSenha } = await db().auth.admin.updateUserById(data!.auth_id as string, { password: SENHA })
  expect(erroSenha).toBeNull()
  f = { outra, membro, email: data!.email as string, authId: data!.auth_id as string }
})

test.afterAll(async () => {
  if (!f) return
  const falhas: string[] = []
  // Com o defeito de volta, o cadastro repetido deixa rede E membro (com o id
  // fictício do Supabase): o membro sai antes, senão a rede não apaga.
  const { data: orfas } = await db().from('tenants').select('id').eq('email', f.email)
  for (const { id } of orfas ?? []) {
    const r1 = await db().from('users').delete().eq('tenant_id', id)
    if (r1.error) falhas.push(`membro órfão: ${r1.error.message}`)
    const r2 = await db().from('tenants').delete().eq('id', id)
    if (r2.error) falhas.push(`rede órfã: ${r2.error.message}`)
  }
  await f.membro.limpar()
  await f.outra.limpar()
  expect(falhas).toEqual([])
})

/** Uma aba sem sessão nenhuma — é assim que a pessoa chega a estas telas. */
async function semSessao<T>(browser: Browser, fn: (p: import('@playwright/test').Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function entrar(p: import('@playwright/test').Page, senha: string) {
  await p.goto('/login')
  await p.locator('input[name="email"]').fill(f!.email)
  await p.locator('input[name="password"]').fill(senha)
  await p.getByRole('button', { name: /Entrar/ }).click()
}

/** O link que o e-mail de recuperação traria — sem mandar e-mail. */
async function linkDeRecuperacao() {
  const { data, error } = await db().auth.admin.generateLink({ type: 'recovery', email: f!.email })
  expect(error).toBeNull()
  return `/auth/confirm?token_hash=${data.properties!.hashed_token}&type=recovery&next=/update-password`
}

test.describe.serial('autenticação pela tela', () => {
  test('login: senha errada avisa; a certa leva ao portal da pessoa', async ({ browser }) => {
    await semSessao(browser, async p => {
      await entrar(p, 'senha-errada-123')
      await expect(p.getByText('E-mail ou senha incorretos')).toBeVisible()
      await entrar(p, SENHA)
      await expect(p).toHaveURL(/\/admin\/dashboard/)
    })
  })

  test('recuperação: o link abre a tela da nova senha, que troca a senha e entra', async ({ browser }) => {
    const link = await linkDeRecuperacao()
    await semSessao(browser, async p => {
      await p.goto(link)
      await expect(p).toHaveURL(/\/update-password$/)
      await p.locator('input[name="password"]').fill(NOVA)
      await p.locator('input[name="confirmPassword"]').fill(`${NOVA}x`)
      await p.getByRole('button', { name: 'Salvar nova senha' }).click()
      await expect(p.getByText('As senhas não coincidem')).toBeVisible()

      // A <form action> do React limpa os campos a cada envio.
      await p.locator('input[name="password"]').fill(NOVA)
      await p.locator('input[name="confirmPassword"]').fill(NOVA)
      await p.getByRole('button', { name: 'Salvar nova senha' }).click()
      await expect(p).toHaveURL(/\/admin\/dashboard/)
    })
    // A senha trocou de verdade: a nova entra, a antiga não.
    await semSessao(browser, async p => {
      await entrar(p, SENHA)
      await expect(p.getByText('E-mail ou senha incorretos')).toBeVisible()
      await entrar(p, NOVA)
      await expect(p).toHaveURL(/\/admin\/dashboard/)
    })
  })

  test('recuperação: link usado ou inválido diz que expirou; next para fora não sai do app', async ({ browser }) => {
    const link = await linkDeRecuperacao()
    await semSessao(browser, async p => {
      await p.goto(link)
      await expect(p).toHaveURL(/\/update-password$/)
    })
    await semSessao(browser, async p => {
      await p.goto(link)   // o mesmo, já usado
      await expect(p).toHaveURL(/\/update-password\?erro=link/)
      await expect(p.getByText('Link expirado')).toBeVisible()

      await p.goto('/auth/confirm?token_hash=nao-existe&type=recovery&next=//exemplo.invalid/roubo')
      await expect(p).toHaveURL(/localhost:\d+\/login\?erro=link/)
    })
  })

  test('nova senha sem a sessão do link: recusa sem trocar nada', async ({ browser }) => {
    await semSessao(browser, async p => {
      await p.goto('/update-password')
      await p.locator('input[name="password"]').fill('Outra-senha-123')
      await p.locator('input[name="confirmPassword"]').fill('Outra-senha-123')
      await p.getByRole('button', { name: 'Salvar nova senha' }).click()
      await expect(p.getByText('O link expirou ou já foi usado')).toBeVisible()
    })
    await semSessao(browser, async p => {
      await entrar(p, NOVA)
      await expect(p, 'a senha continua a mesma').toHaveURL(/\/admin\/dashboard/)
    })
  })

  test('cadastro: e-mail que já tem conta avisa e não cria rede nenhuma', async ({ browser }) => {
    const redes = async () => (await db().from('tenants').select('id').eq('email', f!.email)).data?.length ?? 0
    await semSessao(browser, async p => {
      await p.goto('/register')
      await p.locator('input[name="email"]').fill(f!.email)
      await p.locator('input[name="password"]').fill(SENHA)
      await p.locator('input[name="confirmPassword"]').fill(`${SENHA}x`)
      await p.getByRole('button', { name: /Criar/ }).click()
      await expect(p.getByText('As senhas não coincidem')).toBeVisible()

      await p.locator('input[name="email"]').fill(f!.email)
      await p.locator('input[name="password"]').fill(SENHA)
      await p.locator('input[name="confirmPassword"]').fill(SENHA)
      await p.getByRole('button', { name: /Criar/ }).click()
      await expect(p.getByText('Este e-mail já está cadastrado.')).toBeVisible()
    })
    expect(await redes(), 'nenhuma "Minha Clínica" órfã').toBe(0)
    const { data } = await db().from('users').select('tenant_id').eq('auth_id', f!.authId)
    expect(data, 'o acesso da pessoa segue na rede dela').toEqual([{ tenant_id: f!.outra.tenantId }])
  })
})
