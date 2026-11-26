import { describe, it, expect } from 'vitest'
import { rotuloDaBaseDoLancamento } from '@/lib/comissoes/extrato-texto'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'

/**
 * CB-03/CB-04 (comissoes.md; princípio 3): "Na regra em valor fixo, só os
 * pontos e o voucher a reduzem, na proporção; taxa, insumo e desconto não" e
 * "Na comissão em R$ fixo, a base é o preço sem os pontos e o voucher". O
 * extrato da Francine (R$ 90 fixo, base R$ 380, taxa 0) dizia "base sem a taxa
 * da maquininha" — a rede desconta a taxa no percentual, e o fixo não a desconta.
 * O rótulo da base segue o TIPO da regra (decisão do Claude, 26/11).
 */
const fixo: LancamentoDoExtrato = {
  id: 'l1', professionalId: 'p1', branchId: 'b1', releasedAt: '2026-11-25T13:00:00Z', kind: 'LIBERACAO', motivo: null, amount: 90,
  status: 'PAID', payoutId: null, appointmentId: 'a1', scheduledAt: '2026-11-25T13:00:00Z', cliente: 'B02', procedimento: 'Peeling',
  origem: 'ATENDIMENTO', preco: 380, regraTipo: 'FIXED_AMOUNT', regraValor: 90, pacote: null, descontaTaxa: true, descontaInsumos: true,
  previsto: null, baseComPontos: 'PRECO', plano: null, base: 380, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1, pagoEm: null,
  regraDe: null,
}

describe('a base da comissão em R$ fixo diz o que vale para o fixo', () => {
  it('a taxa e os insumos marcados na rede não aparecem como descontados no fixo', () => {
    expect(rotuloDaBaseDoLancamento(fixo)).toBe('base cheia (sem taxa nem insumo descontados; os pontos e o voucher usados não saem dela)')
  })
  it('com "Sobre o valor pago", os pontos e o voucher saem da base do fixo', () => {
    expect(rotuloDaBaseDoLancamento({ ...fixo, baseComPontos: 'VALOR_PAGO' }))
      .toBe('base sem os pontos e o voucher usados (sem taxa nem insumo descontados)')
  })
  it('a linha do fixo diz a regra ao lado ("R$ 90,00 fixo")', async () => {
    const { regraDoLancamento } = await import('@/lib/comissoes/extrato-texto')
    expect(regraDoLancamento(fixo, 'Francine').replace(/ /g, ' ')).toBe('R$ 90,00 fixo')
  })
  it('o percentual segue com a frase de sempre', () => {
    expect(rotuloDaBaseDoLancamento({ ...fixo, regraTipo: 'PERCENTAGE', baseComPontos: null }))
      .toBe('base sem a taxa da maquininha e sem os insumos')
  })
})
