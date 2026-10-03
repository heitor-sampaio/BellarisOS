import { describe, it, expect, beforeAll } from 'vitest'
import type { ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import {
  podeAutorizar, podeIncluirClinico, horasValidas, prazoDaSessao, nomeComSuporte, HORAS_PADRAO,
} from '@/lib/suporte/regras'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { sessaoVigente } from '@/lib/suporte/sessao'
import { estadoDaCaixa } from '@/lib/plataforma/diagnostico'

const com = (p: Partial<ResolvedPermissions>): ResolvedPermissions => ({ ...NO_PERMISSIONS, ...p })

describe('quem autoriza o suporte', () => {
  it('o próprio membro autoriza a si mesmo, com qualquer cargo', () => {
    expect(podeAutorizar({ internalUserId: 'u1', branchId: 'b1', permissions: NO_PERMISSIONS }, 'u1')).toBe(true)
  })
  it('quem é da rede com Configurações (gerenciar) autoriza qualquer membro', () => {
    expect(podeAutorizar({ internalUserId: 'u1', branchId: null, permissions: com({ settings: 'MANAGE' }) }, 'u2')).toBe(true)
  })
  it('gente de unidade não autoriza outro, nem com Configurações', () => {
    expect(podeAutorizar({ internalUserId: 'u1', branchId: 'b1', permissions: com({ settings: 'MANAGE' }) }, 'u2')).toBe(false)
    expect(podeAutorizar({ internalUserId: 'u1', branchId: null, permissions: com({ settings: 'VIEW' }) }, 'u2')).toBe(false)
  })
  it('sem membro (cliente final) não autoriza nada', () => {
    expect(podeAutorizar({ internalUserId: null, branchId: null, permissions: com({ settings: 'MANAGE' }) }, 'u2')).toBe(false)
  })
  it('dado clínico só com prontuário MANAGE', () => {
    expect(podeIncluirClinico({ permissions: com({ medical_records: 'MANAGE' }) })).toBe(true)
    expect(podeIncluirClinico({ permissions: com({ medical_records: 'VIEW' }) })).toBe(false)
  })
})

describe('prazos', () => {
  it('autorização: 24 h, 72 h ou 7 dias; 72 é o padrão', () => {
    expect([24, 72, 168].every(horasValidas)).toBe(true)
    expect(horasValidas(48)).toBe(false)
    expect(horasValidas('72')).toBe(false)
    expect(HORAS_PADRAO).toBe(72)
  })
  it('sessão: 60 min, nunca além da autorização', () => {
    const agora = Date.parse('2026-10-03T12:00:00Z')
    expect(prazoDaSessao(agora, '2026-10-05T12:00:00Z')).toBe(agora + 60 * 60_000)
    expect(prazoDaSessao(agora, '2026-10-03T12:20:00Z')).toBe(Date.parse('2026-10-03T12:20:00Z'))
  })
  it('sessão vigente: ativa e dentro do prazo', () => {
    const agora = Date.parse('2026-10-03T12:00:00Z')
    expect(sessaoVigente({ status: 'ativa', expiresAt: '2026-10-03T12:30:00Z' }, agora)).toBe(true)
    expect(sessaoVigente({ status: 'ativa', expiresAt: '2026-10-03T11:59:00Z' }, agora)).toBe(false)
    expect(sessaoVigente({ status: 'encerrada', expiresAt: '2026-10-03T12:30:00Z' }, agora)).toBe(false)
  })
})

describe('o que fica registrado', () => {
  it('o nome leva o atendente', () => {
    expect(nomeComSuporte('Ana Souza', 'Heitor')).toBe('Ana Souza (via suporte: Heitor)')
    expect(nomeComSuporte('', '')).toBe('Membro (via suporte: BellarisOS)')
  })
  it('a trava só vale na sessão de suporte, e diz o motivo', () => {
    expect(bloqueioDoSuporte({ suporte: null }, 'mandar mensagem')).toBeNull()
    expect(bloqueioDoSuporte({
      suporte: { sessaoId: 's', atendenteNome: 'H', nomeDoMembro: 'A', incluiClinico: false, expiraEm: '', chamadoId: null },
    }, 'mandar mensagem')).toMatch(/modo suporte/)
  })
  it('o diagnóstico só mostra o estado da caixa, nunca segredo', () => {
    expect(estadoDaCaixa({ token: 't', accessToken: 'a', pin: '1', appSecret: 's', conexao: 'cadastro_incorporado', connectedPhone: '55' }))
      .toEqual({ conexao: 'cadastro_incorporado', connectedPhone: '55' })
  })
})

describe('o cookie de volta do atendente', () => {
  beforeAll(() => { process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'chave-de-teste' })

  it('cifra e decifra; adulterado ou de outra chave dá nulo', async () => {
    const { cifrarVolta, decifrarVolta } = await import('@/lib/suporte/cookie')
    const c = cifrarVolta({ sessaoId: 's1', refresh: 'r1' })
    expect(c).not.toContain('r1')
    expect(decifrarVolta(c)).toEqual({ sessaoId: 's1', refresh: 'r1' })
    const adulterado = c.slice(0, -2) + (c.endsWith('A') ? 'BB' : 'AA')
    expect(decifrarVolta(adulterado)).toBeNull()
    expect(decifrarVolta('lixo')).toBeNull()
    expect(decifrarVolta(undefined)).toBeNull()
  })

  it('o session_id sai do token', async () => {
    const { sessionIdDoToken } = await import('@/lib/suporte/entrar')
    const corpo = Buffer.from(JSON.stringify({ session_id: 'abc', sub: 'u' })).toString('base64url')
    expect(sessionIdDoToken(`x.${corpo}.y`)).toBe('abc')
    expect(sessionIdDoToken('quebrado')).toBeNull()
  })
})
