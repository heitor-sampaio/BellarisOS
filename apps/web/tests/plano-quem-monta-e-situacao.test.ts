import { describe, it, expect } from 'vitest'
import { montaPlano, TEXTO_QUEM_MONTA } from '@/lib/plano-de-tratamento/quem-monta'
import { situacaoComercialDoPlano, SITUACOES_COMERCIAIS, rotuloDaSituacaoComercial } from '@/lib/plano-de-tratamento/situacao'

/**
 * Bloco Plano de tratamento, leva 1 (o plano de adaptação, `docs/revisao.md`).
 *
 * PT2 — o Heitor (2026-11-13): "quem monta o plano é quem atende, nem precisa
 * de permissão pra isso pq isso é proprio atendimento, faz parte". Quem atende
 * é o "Atende" por unidade (`users.atende_em`), que NÃO é permissão; a Admin da
 * rede tem tudo. O Prontuário em Gerenciar sai da trava.
 *
 * PT1f — Tratamentos filtra por situação: Proposto, Aceito (falta assinar),
 * Falta pagar, Em andamento, Concluído, Cancelado. A ordem do Heitor:
 * aceitar → assinar → pagar → agendar.
 */
const UNIDADE_A = '00000000-0000-0000-0000-00000000000a'
const UNIDADE_B = '00000000-0000-0000-0000-00000000000b'

describe('PT2: quem monta o plano é quem atende na unidade dele', () => {
  it('quem atende na unidade do plano monta, sem permissão nenhuma', () => {
    expect(montaPlano({ isNetworkAdmin: false, atendeEm: [UNIDADE_A] }, UNIDADE_A)).toBe(true)
  })
  it('quem atende em outra unidade não monta o plano desta', () => {
    expect(montaPlano({ isNetworkAdmin: false, atendeEm: [UNIDADE_B] }, UNIDADE_A)).toBe(false)
  })
  it('quem não atende em lugar nenhum não monta (o Prontuário em Gerenciar não decide)', () => {
    expect(montaPlano({ isNetworkAdmin: false, atendeEm: [] }, UNIDADE_A)).toBe(false)
    expect(montaPlano({ isNetworkAdmin: false }, UNIDADE_A)).toBe(false)
  })
  it('sem unidade escolhida (o portal da rede): atender em alguma basta para ver o "Novo plano"', () => {
    expect(montaPlano({ isNetworkAdmin: false, atendeEm: [UNIDADE_B] })).toBe(true)
    expect(montaPlano({ isNetworkAdmin: false, atendeEm: [] })).toBe(false)
  })
  it('a Admin da rede tem tudo', () => {
    expect(montaPlano({ isNetworkAdmin: true, atendeEm: [] }, UNIDADE_A)).toBe(true)
  })
  it('a tela diz quem monta pelo "Atende", nunca pelo Prontuário nem por nome de cargo', () => {
    expect(TEXTO_QUEM_MONTA).toMatch(/atende/i)
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
