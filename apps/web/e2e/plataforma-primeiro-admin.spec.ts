import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { plataformaNoAr, urlDaPlataforma } from './apoio/plataforma'

/**
 * O PRIMEIRO admin da plataforma, sem script (2026-10-03): o e-mail mora em
 * `PLATAFORMA_ADMIN_EMAIL`, que o servidor lê ao subir — por isso só contra o
 * build (playwright.build.config.ts define um e-mail de TESTE). No `next dev`,
 * se pula.
 *
 * - sem conta ainda: o "Esqueci minha senha" cria o login já marcado como
 *   ADMIN (e a linha da equipe), e o e-mail de definir senha sai normal;
 * - com conta comum: o login a promove, e a pessoa vai para a verificação em
 *   duas etapas da plataforma.
 * Desde 2026-10-06 isso mora SÓ no sistema (admin.*): a clínica não promove
 * ninguém.
 */
test.skip(!process.env.PLATAFORMA_ADMIN_EMAIL || !plataformaNoAr(), 'só contra o build: o sistema precisa subir com PLATAFORMA_ADMIN_EMAIL')
const SIS = () => urlDaPlataforma('sistema')

const EMAIL = (process.env.PLATAFORMA_ADMIN_EMAIL ?? '').split(',')[0]!.trim().toLowerCase()
const db = () => banco()

async function apagarOAdmin() {
  const { data: staff } = await db().from('platform_staff').select('id, auth_id').eq('email', EMAIL).maybeSingle<{ id: string; auth_id: string }>()
  if (staff) {
    await db().from('platform_audit_log').delete().eq('staff_id', staff.id)
    expect((await db().from('platform_staff').delete().eq('id', staff.id)).error).toBeNull()
    await db().auth.admin.deleteUser(staff.auth_id)
  }
}

test.beforeAll(apagarOAdmin)
test.afterAll(apagarOAdmin)

test.describe.serial('primeiro admin por variável', () => {
  test('sem conta: o "Esqueci minha senha" cria o login já marcado', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const p = await ctx.newPage()
      await p.goto(`${SIS()}/reset-password`)
      await p.locator('input[type="email"]').fill(EMAIL)
      await p.locator('button[type="submit"]').click()
      // O e-mail pode bater no limite do Supabase; o que importa é a conta nascer marcada.
      await expect.poll(async () => (await db().from('platform_staff').select('papel').eq('email', EMAIL)).data ?? [],
        { timeout: 20_000 }).toEqual([{ papel: 'ADMIN' }])
    } finally { await ctx.close() }
    const { data: staff } = await db().from('platform_staff').select('auth_id').eq('email', EMAIL).single<{ auth_id: string }>()
    const { data: login } = await db().auth.admin.getUserById(staff!.auth_id)
    expect((login.user?.app_metadata as { plataforma?: string }).plataforma).toBe('ADMIN')
  })

  test('com conta comum: o login promove e abre o sistema', async ({ browser }) => {
    await apagarOAdmin()
    const senha = `Senha-${Date.now().toString(36)}-9x`
    const { data: criado, error } = await db().auth.admin.createUser({ email: EMAIL, password: senha, email_confirm: true })
    expect(error).toBeNull()
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const p = await ctx.newPage()
      await p.goto(`${SIS()}/login`)
      await p.locator('#email').fill(EMAIL)
      await p.locator('#password').fill(senha)
      await p.getByRole('button', { name: 'Entrar' }).click()
      // O painel, ou a verificação se a plataforma a exigir (opção do admin).
      await expect(p).toHaveURL(new RegExp(`^${SIS()}/(verificacao)?$`), { timeout: 30_000 })
    } finally { await ctx.close() }
    const { data: login } = await db().auth.admin.getUserById(criado.user!.id)
    expect((login.user?.app_metadata as { plataforma?: string }).plataforma).toBe('ADMIN')
    expect((await db().from('platform_staff').select('papel').eq('auth_id', criado.user!.id)).data).toEqual([{ papel: 'ADMIN' }])
  })

  test('na clínica, o e-mail da variável NÃO é promovido', async ({ browser }) => {
    await apagarOAdmin()
    const senha = `Senha-${Date.now().toString(36)}-8y`
    const { data: criado, error } = await db().auth.admin.createUser({ email: EMAIL, password: senha, email_confirm: true })
    expect(error).toBeNull()
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const p = await ctx.newPage()
      await p.goto('/login')
      await p.locator('#email').fill(EMAIL)
      await p.locator('#password').fill(senha)
      await p.getByRole('button', { name: 'Entrar' }).click()
      await p.waitForLoadState('networkidle')
    } finally { await ctx.close() }
    const { data: login } = await db().auth.admin.getUserById(criado.user!.id)
    expect((login.user?.app_metadata as { plataforma?: string }).plataforma).toBeUndefined()
    expect((await db().from('platform_staff').select('id').eq('auth_id', criado.user!.id)).data ?? []).toHaveLength(0)
    await db().auth.admin.deleteUser(criado.user!.id)
  })
})
