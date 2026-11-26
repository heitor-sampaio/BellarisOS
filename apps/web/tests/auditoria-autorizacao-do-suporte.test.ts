import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * plataforma:AD-08 (os nomes se leem na hora de mostrar) e AD-21 (a frase diz
 * o fato): "Criou 1 e editou 1 liberações do suporte" não dizia de quem é a
 * conta nem o que aconteceu (a troca: a autorização nova substitui a
 * vigente). O gatilho de `support_grants` não guarda a conta; ela se lê agora,
 * pelo id da autorização (`nomes.contasDasAutorizacoes`). Texto: decisão do
 * Claude, 26/11, no vocabulário da aba Suporte ("Autorizar", "Revogar").
 */
let id = 9700
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-26T17:23:42.562Z', branch_id: null, client_id: null, tabela: 'support_grants', operacao: 'criou',
  registro_id: 'g2', colunas: [], antes: {}, depois: { via: 'configuracoes', includes_clinical: true, expires_at: '2026-11-27T17:23:42Z' },
  ator_user_id: 'u1', ator_nome: 'Zenaide', ator_tipo: 'membro', incompleto: false, ...x,
})
const revogou = (registro: string) => r({
  operacao: 'editou', registro_id: registro, colunas: ['motivo_revogacao', 'revoked_at', 'revoked_by_user_id'],
  antes: { revoked_at: null }, depois: { revoked_at: '2026-11-26T17:23:42Z' },
})
const nomes: NomesDaAuditoria = {
  clientes: {}, membros: {}, unidades: {}, contasDasAutorizacoes: { g1: 'Luana', g2: 'Luana', g3: 'Cássio' },
}

describe('a autorização do suporte diz de quem é a conta', () => {
  it('autorizar', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria([r({})], nomes, '/admin/auditoria', null)
    expect(g!.oQue).toBe('Autorizou o suporte na conta de Luana, com os dados clínicos')
    const [s] = gruposDaAuditoria([r({ depois: { includes_clinical: false } })], nomes, '/admin/auditoria', null)
    expect(s!.oQue).toBe('Autorizou o suporte na conta de Luana, sem os dados clínicos')
  })

  it('revogar', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria([revogou('g3')], nomes, '/admin/auditoria', null)
    expect(g!.oQue).toBe('Revogou a autorização do suporte na conta de Cássio')
  })

  it('a troca (a nova substitui a vigente, na mesma gravação)', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria([r({}), revogou('g1')], nomes, '/admin/auditoria', null)
    expect(g!.oQue).toBe('Trocou a autorização do suporte na conta de Luana (agora com os dados clínicos)')
  })

  it('sem o nome lido, não inventa: "uma conta da equipe"', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria([revogou('gx')], nomes, '/admin/auditoria', null)
    expect(g!.oQue).toBe('Revogou a autorização do suporte numa conta da equipe')
  })

  it('a leitura busca a conta de cada autorização (só pela rede da sessão)', () => {
    const f = readFileSync(join(__dirname, '..', 'lib/auditoria/leitura.ts'), 'utf8')
    expect(f).toContain('contasDasAutorizacoes')
  })
})
