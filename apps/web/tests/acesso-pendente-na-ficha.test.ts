import { describe, it, expect, vi } from 'vitest'

/**
 * A4 da 31ª simulação (princípios 3 e 7): dado o acesso por um RNE que o
 * sistema de login recusou como senha (PO-14), a cliente recebe o e-mail para
 * criar a senha — e a ficha seguia dizendo só "Tem acesso ao app", como se ela
 * já entrasse. A ficha diz que o acesso espera a pessoa criar a senha.
 */

vi.mock('next/cache', () => ({ revalidateTag: () => {} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'app.bellarisos.com' }) }))
vi.mock('@/lib/cached-queries', () => ({ tagDasFichasDoLogin: (id: string) => `fichas:${id}` }))

describe('o acesso pendente na ficha', () => {
  it('a senha a criar pelo e-mail: diz que espera a pessoa, e o caminho se o e-mail não chegou', async () => {
    const { acessoPendenteNaFicha } = await import('@/lib/clients/acesso-pendente')
    const t = acessoPendenteNaFicha({ temLogin: true, primeiroAcessoEm: null, senhaPorEmail: true })
    expect(t).toMatch(/espera a pessoa criar a senha/)
    expect(t).toMatch(/Esqueci a senha/)
    expect(t).not.toMatch(/\bele\b|\bela\b/)
  })
  it('a senha inicial é o documento, e ainda não entrou: diz que ainda não entrou', async () => {
    const { acessoPendenteNaFicha } = await import('@/lib/clients/acesso-pendente')
    expect(acessoPendenteNaFicha({ temLogin: true, primeiroAcessoEm: null, senhaPorEmail: false }))
      .toBe('A pessoa ainda não entrou no app.')
  })
  it('já entrou, ou sem login: nada a dizer', async () => {
    const { acessoPendenteNaFicha } = await import('@/lib/clients/acesso-pendente')
    expect(acessoPendenteNaFicha({ temLogin: true, primeiroAcessoEm: '2026-11-25T10:00:00Z', senhaPorEmail: true })).toBeNull()
    expect(acessoPendenteNaFicha({ temLogin: false, primeiroAcessoEm: null, senhaPorEmail: false })).toBeNull()
  })

  it('o login do documento recusado leva a marca senha_por_email (é ela que a ficha lê)', async () => {
    const criacoes: { app_metadata: Record<string, unknown> }[] = []
    let recusa = 1
    const admin = {
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { admin: { createUser: async (p: { app_metadata: Record<string, unknown> }) => {
        criacoes.push(p)
        if (recusa-- > 0) return { data: { user: null }, error: { code: 'weak_password', message: 'Password is known to be weak' } }
        return { data: { user: { id: 'auth-1' } }, error: null }
      } } },
    }
    const { criarLoginDoCliente } = await import('@/lib/clients/acesso')
    await criarLoginDoCliente(admin as never, 't1', 'yolanda@x.com', { tipo: 'RNE', numero: 'V12345' })
    expect(criacoes[1]!.app_metadata).toEqual({ senha_provisoria: true, senha_por_email: true })
    // O documento aceito como senha não leva a marca.
    expect(criacoes[0]!.app_metadata).toEqual({ senha_provisoria: true })
  })

  it('lê a marca do login pelo Auth, só enquanto a pessoa não entrou', async () => {
    const { lerAcessoPendente } = await import('@/lib/clients/acesso-pendente')
    let chamadas = 0
    const admin = { auth: { admin: { getUserById: async () => { chamadas++; return { data: { user: { app_metadata: { senha_por_email: true } } }, error: null } } } } }
    expect(await lerAcessoPendente(admin as never, { authId: 'a1', primeiroAcessoEm: null })).toMatch(/espera a pessoa criar a senha/)
    expect(await lerAcessoPendente(admin as never, { authId: 'a1', primeiroAcessoEm: '2026-11-25T10:00:00Z' })).toBeNull()
    expect(await lerAcessoPendente(admin as never, { authId: null, primeiroAcessoEm: null })).toBeNull()
    expect(chamadas).toBe(1)
  })
})
