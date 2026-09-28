import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Desativar um membro TIRA o acesso dele.
 *
 * Até 2026-09-27 "desativar" era uma coluna que nada lia: o contexto de login
 * (`buildContext`) não olhava `users.is_active`, e o login no Auth continuava
 * valendo. Quem era desligado da clínica seguia com acesso completo — agenda,
 * clientes, prontuário — até alguém apagar a conta na mão.
 *
 * Agora são três travas, e as três são conferidas aqui:
 *  - o contexto barra o membro inativo já na próxima requisição (a sessão que
 *    ele tem na mão para de funcionar);
 *  - a conta é bloqueada no Auth (não entra de novo, nem por link);
 *  - reativar desfaz as duas.
 *
 * E ninguém desativa a si mesmo — testado com um membro `[e2e]`, nunca com o
 * admin da suíte: se a trava falhasse, bloquearia o login de verdade.
 */

const marca = Date.now().toString(36)
let alvo: MembroDeTeste | null = null
let gestor: MembroDeTeste | null = null

const db = () => banco()
const authIdDe = async (userId: string) =>
  (await db().from('users').select('auth_id').eq('id', userId).single<{ auth_id: string }>()).data!.auth_id
const bloqueadoAte = async (userId: string) => {
  const { data } = await db().auth.admin.getUserById(await authIdDe(userId))
  const ate = (data.user as { banned_until?: string | null } | null)?.banned_until
  return ate ? new Date(ate) : null
}
/** Tenta entrar pelo link mágico — o mesmo caminho do login sem senha. */
async function consegueEntrar(email: string): Promise<boolean> {
  const { data: link } = await db().auth.admin.generateLink({ type: 'magiclink', email })
  if (!link?.properties?.hashed_token) return false
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
  return !error && !!data.session
}

test.describe.serial('membro desativado', () => {
  test.beforeAll(async () => {
    alvo   = await criarMembro(`desat${marca}`, { rotulo: 'Desativado', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
    gestor = await criarMembro(`gest${marca}`,  { rotulo: 'Gestor', permissoes: [{ modulo: 'team', nivel: 'MANAGE' }] })
  })

  test.afterAll(async () => {
    for (const m of [alvo, gestor]) {
      if (!m) continue
      await db().from('domain_events').delete().eq('entidade_id', m.userId)
      await m.limpar()
    }
  })

  test('desativar tira o acesso na hora, bloqueia o login, e reativar devolve', async ({ browser, page: admin }) => {
    const email = `e2e-membro-desat${marca}@bellaris.invalid`
    const ctx = await browser.newContext({ storageState: alvo!.estado })
    const pagina = await ctx.newPage()
    try {
      // Controle: com a conta ativa, a sessão abre a agenda.
      await pagina.goto('/admin/agenda')
      await expect(pagina).toHaveURL(/\/admin\/agenda/)

      await chamarAcao(admin, 'actions/team.ts', 'deactivateTeamMember', '/admin/team', [alvo!.userId, '/admin/team'])
      await expect.poll(async () =>
        (await db().from('users').select('is_active').eq('id', alvo!.userId).single()).data?.is_active,
      ).toBe(false)

      // 1. A sessão que ele já tinha para de funcionar.
      await pagina.goto('/admin/agenda')
      await expect(pagina).toHaveURL(/\/login\?acesso=desativado/)

      // 2. A conta está bloqueada no Auth: não entra de novo.
      const ate = await bloqueadoAte(alvo!.userId)
      expect(ate && ate.getTime() > Date.now(), 'bloqueado no Auth').toBe(true)
      expect(await consegueEntrar(email), 'não entra pelo link').toBe(false)

      // 3. Reativar desfaz as duas.
      await chamarAcao(admin, 'actions/team.ts', 'reactivateTeamMember', '/admin/team', [alvo!.userId, '/admin/team'])
      await expect.poll(async () => {
        const ate2 = await bloqueadoAte(alvo!.userId)
        return !ate2 || ate2.getTime() <= Date.now()
      }, { message: 'desbloqueado no Auth' }).toBe(true)
      expect(await consegueEntrar(email), 'entra de novo').toBe(true)
    } finally {
      await ctx.close()
    }
  })

  test('ninguém desativa a si mesmo, nem chamando a action direto', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: gestor!.estado })
    try {
      const pagina = await ctx.newPage()
      await chamarAcao(pagina, 'actions/team.ts', 'deactivateTeamMember', '/admin/team', [gestor!.userId, '/admin/team'])
      const { data } = await db().from('users').select('is_active').eq('id', gestor!.userId).single()
      expect(data!.is_active).toBe(true)
      expect(await bloqueadoAte(gestor!.userId)).toBeNull()
    } finally {
      await ctx.close()
    }
  })
})
