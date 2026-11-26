import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * A sessão SALVA de quem foi desativada (D25 da 31ª simulação; CLAUDE.md §11:
 * "manda para `/login?acesso=desativado`").
 *
 * Com o token de acesso ainda válido, quem barra é o `buildContext` (e o
 * `e2e/membro-desativado.spec.ts` prova). Passada a hora do token, o proxy
 * tenta renovar, e o Auth recusa a conta bloqueada (`user_banned`): sem
 * sessão, o proxy mandava a `/login` puro, e a pessoa não sabia por quê.
 */

let erroDaRenovacao: { code?: string; message: string } | null = null
let claims: Record<string, unknown> | null = null

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => claims
        ? { data: { claims }, error: null }
        : { data: null, error: erroDaRenovacao },
      signOut: async () => ({ error: null }),
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

const { updateSession } = await import('@/lib/supabase/middleware')

const pedir = (caminho: string) => new NextRequest(new URL(caminho, 'http://localhost:3000'))

describe('proxy: a sessão de quem foi desativada', () => {
  beforeEach(() => { erroDaRenovacao = null; claims = null })

  it('a renovação recusada por conta bloqueada leva a /login?acesso=desativado', async () => {
    erroDaRenovacao = { code: 'user_banned', message: 'User is banned' }
    const r = await updateSession(pedir('/admin/agenda'))
    const destino = new URL(r.headers.get('location') ?? 'http://x/')
    expect(destino.pathname).toBe('/login')
    expect(destino.searchParams.get('acesso')).toBe('desativado')
  })

  it('sem sessão por outro motivo, segue o /login puro', async () => {
    erroDaRenovacao = { code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' }
    const r = await updateSession(pedir('/admin/agenda'))
    const destino = new URL(r.headers.get('location') ?? 'http://x/')
    expect(destino.pathname).toBe('/login')
    expect(destino.searchParams.get('acesso')).toBeNull()
  })

  it('o /login aberto com a sessão bloqueada também ganha o aviso', async () => {
    erroDaRenovacao = { code: 'user_banned', message: 'User is banned' }
    const r = await updateSession(pedir('/login'))
    const destino = new URL(r.headers.get('location') ?? 'http://x/')
    expect(destino.pathname).toBe('/login')
    expect(destino.searchParams.get('acesso')).toBe('desativado')
  })

  it('o /login que já tem o aviso não redireciona de novo', async () => {
    erroDaRenovacao = { code: 'user_banned', message: 'User is banned' }
    const r = await updateSession(pedir('/login?acesso=desativado'))
    expect(r.headers.get('location')).toBeNull()
  })

  it('o POST do login (outra pessoa entrando no mesmo aparelho) não é desviado', async () => {
    erroDaRenovacao = { code: 'user_banned', message: 'User is banned' }
    const r = await updateSession(new NextRequest(new URL('/login', 'http://localhost:3000'), { method: 'POST' }))
    expect(r.headers.get('location')).toBeNull()
  })

  it('a sessão viva segue sem desvio', async () => {
    claims = { sub: 'x', app_metadata: {} }
    const r = await updateSession(pedir('/admin/agenda'))
    expect(r.headers.get('location')).toBeNull()
  })
})
