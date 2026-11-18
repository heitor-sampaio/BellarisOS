import { describe, it, expect, beforeAll } from 'vitest'
import type { ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import {
  podeAutorizar, podeRevogar, podeIncluirClinico, horasValidas, prazoDaSessao, nomeComSuporte, HORAS_PADRAO,
} from '@/lib/suporte/regras'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { sessaoVigente } from '@/lib/suporte/sessao'

const com = (p: Partial<ResolvedPermissions>): ResolvedPermissions => ({ ...NO_PERMISSIONS, ...p })

// Desde 18/11 (auditoria das regras): autorizar o suporte a entrar numa conta é
// da Admin da rede, como a configuração da rede toda (o Heitor: "só pela conta
// admin"). Revogar, a própria pessoa sempre pode (o menos arriscado) — e a
// Admin da rede, qualquer uma.
describe('quem autoriza o suporte', () => {
  const gerenteDaRede = { internalUserId: 'u1', branchId: null, permissions: com({ settings: 'MANAGE' }) }
  it('só a Admin da rede autoriza — qualquer membro, ela mesma e outra Admin', () => {
    const adminDaRede = { ...gerenteDaRede, isNetworkAdmin: true }
    expect(podeAutorizar(adminDaRede)).toBe(true)
    expect(podeAutorizar(adminDaRede)).toBe(true)
    expect(podeAutorizar(adminDaRede)).toBe(true)
  })
  it('quem não é a Admin não autoriza, nem a si mesmo, nem com “A rede inteira” e Configurações', () => {
    expect(podeAutorizar({ internalUserId: 'u1', branchId: 'b1', permissions: NO_PERMISSIONS })).toBe(false)
    expect(podeAutorizar(gerenteDaRede)).toBe(false)
    expect(podeAutorizar(gerenteDaRede)).toBe(false)
    expect(podeAutorizar({ internalUserId: 'u1', branchId: 'b1', permissions: com({ settings: 'MANAGE' }) })).toBe(false)
  })
  it('revogar: a própria pessoa sempre; os outros, só a Admin da rede', () => {
    expect(podeRevogar({ internalUserId: 'u1', branchId: 'b1', permissions: NO_PERMISSIONS }, 'u1')).toBe(true)
    expect(podeRevogar(gerenteDaRede, 'u2')).toBe(false)
    expect(podeRevogar({ ...gerenteDaRede, isNetworkAdmin: true }, 'u2')).toBe(true)
    expect(podeRevogar({ internalUserId: null, branchId: null, permissions: NO_PERMISSIONS }, 'u2')).toBe(false)
  })
  it('sem membro (cliente final) não autoriza nada', () => {
    expect(podeAutorizar({ internalUserId: null, branchId: null, permissions: com({ settings: 'MANAGE' }), isNetworkAdmin: true })).toBe(false)
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
})

describe('a entrada por código (o "entrar como" entre origens)', () => {
  beforeAll(() => { process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'chave-de-teste' })

  it('o código é longo, aleatório e base64url; o banco guarda só o SHA-256', async () => {
    const { novoCodigoDeEntrada, hashDoCodigo } = await import('@/lib/suporte/entrar')
    const um = novoCodigoDeEntrada()
    const outro = novoCodigoDeEntrada()
    expect(um).not.toBe(outro)
    expect(um).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hashDoCodigo(um)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashDoCodigo(um)).not.toContain(um)
    expect(hashDoCodigo(um)).toBe(hashDoCodigo(um))
  })

  it('o session_id sai do token', async () => {
    const { sessionIdDoToken } = await import('@/lib/suporte/entrar')
    const corpo = Buffer.from(JSON.stringify({ session_id: 'abc', sub: 'u' })).toString('base64url')
    expect(sessionIdDoToken(`x.${corpo}.y`)).toBe('abc')
    expect(sessionIdDoToken('quebrado')).toBeNull()
  })
})
