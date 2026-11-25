import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O documento recusado como senha inicial (decisão do Heitor, 24/11, à
 * pergunta R1 da 27ª — "E-mail para criar a senha"): a proteção contra senha
 * vazada do Supabase recusa o passaporte, o RNE ou o CPF fácil de adivinhar.
 * Em vez de a tela dizer "cadastre sem o acesso", o login nasce com uma senha
 * aleatória forte que ninguém recebe (provisória, como toda senha dada por
 * outra pessoa), a ficha é ligada, e a cliente recebe o e-mail para criar a
 * própria senha — o caminho do "esqueci a senha" (`/auth/confirm` →
 * `/update-password`). A tela diz à equipe que foi isso que aconteceu.
 */

vi.mock('next/cache', () => ({ revalidateTag: () => {} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'app.bellarisos.com', 'x-forwarded-proto': 'https' }) }))
vi.mock('@/lib/cached-queries', () => ({ tagDasFichasDoLogin: (id: string) => `fichas:${id}` }))

type Criacao = { email: string; password: string; email_confirm: boolean; app_metadata: Record<string, unknown> }
let criacoes: Criacao[] = []
let recusasDeSenha = 0
let envios: { email: string; redirectTo?: string }[] = []
let falhaNoEnvio = false

function admin() {
  return {
    rpc: (nome: string) => {
      const r = nome === 'login_de_cliente_para_ligar_doc' ? { data: [], error: null } : { data: null, error: null }
      return Promise.resolve(r)
    },
    from: () => {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'is', 'update']) b[op] = () => b
      b.maybeSingle = () => Promise.resolve({ data: { id: 'c1', auth_id: null }, error: null })
      b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [{ id: 'c1' }], error: null }).then(ok)
      return b
    },
    auth: {
      admin: {
        createUser: async (p: Criacao) => {
          criacoes.push(p)
          if (recusasDeSenha > 0) {
            recusasDeSenha--
            return { data: { user: null }, error: { code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.' } }
          }
          return { data: { user: { id: 'auth-1' } }, error: null }
        },
        deleteUser: async () => ({ error: null }),
      },
      resetPasswordForEmail: async (email: string, op?: { redirectTo?: string }) => {
        envios.push({ email, redirectTo: op?.redirectTo })
        return falhaNoEnvio ? { data: null, error: { code: 'over_email_send_rate_limit', message: 'rate limit' } } : { data: {}, error: null }
      },
    },
  }
}

const PASSAPORTE = { tipo: 'PASSAPORTE' as const, numero: '19FR54321' }

beforeEach(() => { criacoes = []; recusasDeSenha = 0; envios = []; falhaNoEnvio = false })

describe('o documento recusado como senha inicial', () => {
  it('o login nasce com uma senha aleatória forte e provisória, e a marca do e-mail para criar a senha', async () => {
    const { criarLoginDoCliente } = await import('@/lib/clients/acesso')
    recusasDeSenha = 1
    const r = await criarLoginDoCliente(admin() as never, 't1', 'sophie@x.com', PASSAPORTE)
    expect(r).toEqual({ authId: 'auth-1', novo: true, senhaPorEmail: true })
    expect(criacoes).toHaveLength(2)
    expect(criacoes[0]!.password).toBe('19FR54321')
    const segunda = criacoes[1]!
    expect(segunda.password).not.toBe('19FR54321')
    expect(segunda.password.length).toBeGreaterThanOrEqual(24)
    expect(segunda.app_metadata.senha_provisoria).toBe(true)
    expect(segunda.email).toBe('sophie@x.com')
  })

  it('o documento aceito segue como sempre: a senha inicial é ele, sem e-mail', async () => {
    const { criarLoginDoCliente } = await import('@/lib/clients/acesso')
    const r = await criarLoginDoCliente(admin() as never, 't1', 'sophie@x.com', PASSAPORTE)
    expect(r).toEqual({ authId: 'auth-1', novo: true })
    expect(criacoes).toHaveLength(1)
  })

  it('ligada a ficha, a cliente recebe o e-mail para criar a senha (o caminho do "esqueci a senha")', async () => {
    const { ligarLoginAoCliente } = await import('@/lib/clients/acesso')
    const r = await ligarLoginAoCliente(admin() as never, { authId: 'auth-1', novo: true, senhaPorEmail: true }, 'c1', 'sophie@x.com')
    expect(envios).toEqual([{ email: 'sophie@x.com', redirectTo: 'https://app.bellarisos.com/auth/confirm?next=/update-password' }])
    expect(r).toEqual({ emailParaCriarSenha: 'enviado' })
  })

  it('sem a marca, nenhum e-mail sai', async () => {
    const { ligarLoginAoCliente } = await import('@/lib/clients/acesso')
    const r = await ligarLoginAoCliente(admin() as never, { authId: 'auth-1', novo: true }, 'c1', 'sophie@x.com')
    expect(envios).toEqual([])
    expect(r).toEqual({})
  })

  it('o e-mail que não sai fica dito (a ficha e o login continuam)', async () => {
    const { ligarLoginAoCliente } = await import('@/lib/clients/acesso')
    falhaNoEnvio = true
    const r = await ligarLoginAoCliente(admin() as never, { authId: 'auth-1', novo: true, senhaPorEmail: true }, 'c1', 'sophie@x.com')
    expect(r).toEqual({ emailParaCriarSenha: 'falhou' })
  })

  it('dar o acesso pela ficha leva a marca e manda o e-mail', async () => {
    const { darAcessoAoCliente } = await import('@/lib/clients/acesso')
    recusasDeSenha = 1
    const r = await darAcessoAoCliente(admin() as never, { tenantId: 't1' } as never, 'c1', 'sophie@x.com', PASSAPORTE)
    expect(r).toEqual({ ok: true, contaLigada: false, emailParaCriarSenha: 'enviado' })
    expect(envios.map(e => e.email)).toEqual(['sophie@x.com'])
  })

  it('a tela diz à equipe que foi o e-mail, sem senha nenhuma', async () => {
    const { avisoDoAcessoCriado } = await import('@/lib/clients/textos-do-cadastro')
    const a = avisoDoAcessoCriado({ contaLigada: false, email: 'sophie@x.com', documento: PASSAPORTE, emailParaCriarSenha: 'enviado' })
    expect(a.titulo).toBe('Acesso ao app criado')
    expect(a.descricao).toMatch(/sophie@x\.com/)
    expect(a.descricao).toMatch(/e-mail para criar a senha/)
    expect(a.descricao).toMatch(/não aceitou o número do passaporte como senha/)
    expect(a.descricao).not.toMatch(/19FR54321/)
    expect(a.descricao).not.toMatch(/senha inicial é/)
    const f = avisoDoAcessoCriado({ contaLigada: false, email: 'sophie@x.com', documento: PASSAPORTE, emailParaCriarSenha: 'falhou' })
    expect(f.descricao).toMatch(/Esqueci a senha/)
    expect(f.descricao).not.toMatch(/19FR54321/)
  })
})
