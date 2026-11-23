import { describe, it, expect } from 'vitest'
import type { ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { montaPlano, TEXTO_QUEM_MONTA } from '@/lib/plano-de-tratamento/quem-monta'
import { situacaoComercialDoPlano, SITUACOES_COMERCIAIS, rotuloDaSituacaoComercial } from '@/lib/plano-de-tratamento/situacao'

/**
 * Bloco Plano de tratamento, leva 1 (o plano de adaptação, `docs/revisao.md`).
 *
 * PT2 — o Heitor (2026-11-13): "quem monta o plano é quem atende". Revista no
 * UM3 (o Heitor, 2026-11-23, "cada passo, um módulo"): montar o plano pede o
 * Atendimento em Gerenciar, nas unidades ao alcance; o "Atende" deixa de ser a
 * trava (UM5) e o Prontuário em Gerenciar não decide. A Admin da rede tem tudo.
 *
 * PT1f — Tratamentos filtra por situação: Proposto, Aceito (falta assinar),
 * Falta pagar, Em andamento, Concluído, Cancelado. A ordem do Heitor:
 * aceitar → assinar → pagar → agendar.
 */
const UNIDADE_A = '00000000-0000-0000-0000-00000000000a'
const UNIDADE_B = '00000000-0000-0000-0000-00000000000b'

type QuemMonta = Parameters<typeof montaPlano>[0]
const membro = (over: Partial<QuemMonta>): QuemMonta =>
  ({ isNetworkAdmin: false, permissions: NO_PERMISSIONS, branchId: UNIDADE_A, unidades: [UNIDADE_A], ...over })
const comAtendimento = (nivel: 'VIEW' | 'MANAGE', extra: Partial<ResolvedPermissions> = {}) =>
  ({ ...NO_PERMISSIONS, atendimento: nivel, ...extra }) as ResolvedPermissions

describe('UM3 (revê a PT2): quem monta o plano é o Atendimento em Gerenciar, na unidade ao alcance', () => {
  it('o Atendimento em Gerenciar com a unidade do plano ao alcance monta', () => {
    expect(montaPlano(membro({ permissions: comAtendimento('MANAGE') }), UNIDADE_A)).toBe(true)
  })
  it('o Atendimento em Gerenciar de outra unidade não monta o plano desta', () => {
    expect(montaPlano(membro({ permissions: comAtendimento('MANAGE'), branchId: UNIDADE_B, unidades: [UNIDADE_B] }), UNIDADE_A)).toBe(false)
  })
  it('sem o Atendimento em Gerenciar não monta — nem quem atende na unidade (UM5), nem o Prontuário em Gerenciar', () => {
    expect(montaPlano({ ...membro({}), atendeEm: [UNIDADE_A] } as QuemMonta, UNIDADE_A)).toBe(false)
    expect(montaPlano(membro({ permissions: comAtendimento('VIEW', { medical_records: 'MANAGE' }) }), UNIDADE_A)).toBe(false)
    expect(montaPlano(membro({}), UNIDADE_A)).toBe(false)
  })
  it('sem unidade escolhida (o portal da rede): o Atendimento em Gerenciar basta para ver o "Novo plano"', () => {
    expect(montaPlano(membro({ permissions: comAtendimento('MANAGE'), branchId: UNIDADE_B, unidades: [UNIDADE_B] }))).toBe(true)
    expect(montaPlano(membro({ branchId: UNIDADE_B, unidades: [UNIDADE_B] }))).toBe(false)
  })
  it('a Admin da rede tem tudo', () => {
    expect(montaPlano(membro({ isNetworkAdmin: true, branchId: null, unidades: null }), UNIDADE_A)).toBe(true)
  })
  it('a tela diz quem monta pelo Atendimento em Gerenciar, nunca pelo Prontuário nem por nome de cargo', () => {
    expect(TEXTO_QUEM_MONTA).toMatch(/Atendimento em Gerenciar/)
    expect(TEXTO_QUEM_MONTA).not.toMatch(/Prontuário em Gerenciar/)
    expect(TEXTO_QUEM_MONTA).not.toMatch(/recep|gerente|profissional/i)
  })
})

describe('PT1f: a situação do plano na lista de Tratamentos', () => {
  const base = { recebido: false, documentosAbertos: 0, contratoFalta: false }
  it('rascunho e proposto', () => {
    expect(situacaoComercialDoPlano({ ...base, status: 'DRAFT' })).toBe('RASCUNHO')
    expect(situacaoComercialDoPlano({ ...base, status: 'PROPOSED' })).toBe('PROPOSTO')
  })
  it('aceito com documento aberto ou com o contrato por assinar: falta assinar', () => {
    expect(situacaoComercialDoPlano({ ...base, status: 'ACCEPTED', documentosAbertos: 1 })).toBe('FALTA_ASSINAR')
    expect(situacaoComercialDoPlano({ ...base, status: 'ACCEPTED', contratoFalta: true })).toBe('FALTA_ASSINAR')
  })
  it('aceito, tudo assinado, sem dinheiro: falta pagar', () => {
    expect(situacaoComercialDoPlano({ ...base, status: 'ACCEPTED' })).toBe('FALTA_PAGAR')
  })
  it('recebido: em andamento (o recebido vence o documento aberto — o dinheiro já entrou)', () => {
    expect(situacaoComercialDoPlano({ ...base, status: 'ACCEPTED', recebido: true, documentosAbertos: 2 })).toBe('EM_ANDAMENTO')
  })
  it('concluído e cancelado (o REJECTED antigo é cancelado)', () => {
    expect(situacaoComercialDoPlano({ ...base, status: 'COMPLETED' })).toBe('CONCLUIDO')
    expect(situacaoComercialDoPlano({ ...base, status: 'CANCELLED' })).toBe('CANCELADO')
    expect(situacaoComercialDoPlano({ ...base, status: 'REJECTED' })).toBe('CANCELADO')
  })
  it('os rótulos são os do Heitor, na ordem do fluxo', () => {
    expect(SITUACOES_COMERCIAIS.map(rotuloDaSituacaoComercial)).toEqual([
      'Rascunho', 'Proposto', 'Aceito (falta assinar)', 'Falta pagar', 'Em andamento', 'Concluído', 'Cancelado',
    ])
  })
})
