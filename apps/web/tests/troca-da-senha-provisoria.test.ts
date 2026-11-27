import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A troca da senha provisória (CLAUDE.md §5: a senha dada por outra pessoa
 * nasce com `app_metadata.senha_provisoria`, e o proxy leva a
 * `/update-password?primeiro=1` até a troca). D15 da 39ª: a senha mudou, mas a
 * pessoa voltou à troca e só uma 2ª troca liberou. O proxy lê a marca do TOKEN
 * (`getClaims`); a action tirava a marca da conta e renovava a sessão sem
 * conferir a renovação — falhou, o token seguia com a marca até vencer. E a 2ª
 * troca, com a marca já fora da conta, nem renovava.
 *
 * Agora: a sessão renova sempre que a conta OU o token têm a marca; se a
 * renovação falha ou o token novo ainda a traz, a sessão se fecha e a pessoa
 * entra de novo com a senha nova (o login dá o token sem a marca).
 */

let marcaNaConta = true
let marcaNoToken = true
let renovacao: { error: unknown; marca: boolean } = { error: null, marca: false }
const chamadas: string[] = []

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))
vi.mock('@/lib/origem', () => ({ origemPublicaDe: () => 'https://app.test' }))
vi.mock('@/lib/suporte/sessao', () => ({ emSessaoDeSuporte: async () => false }))
vi.mock('@/lib/destino-da-sessao', () => ({ destinoPelosClaims: async () => '/centro/cliente', contaSemVinculo: async () => false }))
vi.mock('@/lib/fidelidade/bonus', () => ({ bonusDePrimeiroAcesso: async () => {} }))
vi.mock('@/lib/redes/criar', () => ({ semearRede: async () => {}, fimDoTesteParaHoje: () => null }))
vi.mock('@/lib/login-novo', () => ({ comLoginNovo: async () => ({}) }))
vi.mock('@/lib/auditoria/entrada', () => ({ registrarEntradaNaAuditoria: async () => {} }))
vi.mock('@/lib/clientes/entrada-na-auditoria', () => ({ registrarEntradaDaClienteNaAuditoria: async () => {} }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { updateUserById: async (_id: string, attrs: { app_metadata?: { senha_provisoria?: unknown } }) => {
      chamadas.push('tirar a marca')
      if (attrs.app_metadata && 'senha_provisoria' in attrs.app_metadata) marcaNaConta = false
      return { error: null }
    } } },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1', app_metadata: marcaNaConta ? { senha_provisoria: true } : {} } } }),
      getClaims: async () => ({ data: { claims: { sub: 'u1', app_metadata: marcaNoToken ? { senha_provisoria: true } : {} } }, error: null }),
      updateUser: async () => { chamadas.push('trocar a senha'); return { error: null } },
      refreshSession: async () => {
        chamadas.push('renovar')
        if (!renovacao.error) marcaNoToken = renovacao.marca
        return { data: { session: renovacao.error ? null : { user: { app_metadata: renovacao.marca ? { senha_provisoria: true } : {} } } }, error: renovacao.error }
      },
      signOut: async () => { chamadas.push('sair'); return { error: null } },
    },
  }),
}))

function senha() {
  const f = new FormData()
  f.set('password', 'NovaSenha123')
  f.set('confirmPassword', 'NovaSenha123')
  return f
}

beforeEach(() => {
  marcaNaConta = true; marcaNoToken = true
  renovacao = { error: null, marca: false }
  chamadas.length = 0
})

describe('a troca da senha provisória', () => {
  it('troca a senha, tira a marca, renova a sessão e segue ao portal', async () => {
    const { updatePasswordAction } = await import('@/actions/auth')
    expect(await updatePasswordAction(undefined, senha())).toEqual({ redirectTo: '/centro/cliente' })
    expect(chamadas).toEqual(['trocar a senha', 'tirar a marca', 'renovar'])
  })

  it('a renovação falhou: a sessão se fecha e a pessoa entra de novo com a senha nova (não volta à troca)', async () => {
    renovacao = { error: { message: 'falhou' }, marca: true }
    const { updatePasswordAction } = await import('@/actions/auth')
    expect(await updatePasswordAction(undefined, senha())).toEqual({ redirectTo: '/login' })
    expect(chamadas).toContain('sair')
  })

  it('o token renovado ainda com a marca: o mesmo — entrar de novo', async () => {
    renovacao = { error: null, marca: true }
    const { updatePasswordAction } = await import('@/actions/auth')
    expect(await updatePasswordAction(undefined, senha())).toEqual({ redirectTo: '/login' })
    expect(chamadas).toContain('sair')
  })

  it('a marca já saiu da conta, mas o token ainda a traz: a sessão renova', async () => {
    marcaNaConta = false
    const { updatePasswordAction } = await import('@/actions/auth')
    expect(await updatePasswordAction(undefined, senha())).toEqual({ redirectTo: '/centro/cliente' })
    expect(chamadas).toEqual(['trocar a senha', 'renovar'])
  })

  it('a senha que não é provisória troca sem mexer na marca nem na sessão', async () => {
    marcaNaConta = false; marcaNoToken = false
    const { updatePasswordAction } = await import('@/actions/auth')
    expect(await updatePasswordAction(undefined, senha())).toEqual({ redirectTo: '/centro/cliente' })
    expect(chamadas).toEqual(['trocar a senha'])
  })
})
