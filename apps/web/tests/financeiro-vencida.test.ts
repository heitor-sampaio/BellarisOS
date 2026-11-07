import { describe, expect, it } from 'vitest'
import { situacaoDoVencimento, textoDoVencimento } from '@/lib/financeiro/vencimentos'

// D13 da 9ª simulação: a parcela vencida tem um nome em toda tela.
describe('a parcela vencida (D13 da 9ª)', () => {
  const agora = new Date('2026-11-07T01:30:00-03:00')
  it('vencida é a do dia ANTES de hoje em Brasília', () => {
    expect(situacaoDoVencimento('2026-11-05T12:00:00-03:00', agora)).toBe('VENCIDA')
    expect(textoDoVencimento('2026-11-05T12:00:00-03:00', agora)).toBe('Vencida em 05/11')
  })
  it('a que vence hoje ainda não venceu', () => {
    expect(situacaoDoVencimento('2026-11-07T12:00:00-03:00', agora)).toBe('HOJE')
    expect(textoDoVencimento('2026-11-07T12:00:00-03:00', agora)).toBe('Vence hoje')
  })
  it('a que vai vencer diz o dia', () => {
    expect(textoDoVencimento('2026-12-07T12:00:00-03:00', agora)).toBe('Vence 07/12/2026')
  })
  it('à 01:30 de Brasília (04:30 UTC), o vencimento de ontem ao meio-dia já venceu', () => {
    expect(situacaoDoVencimento('2026-11-06T12:00:00-03:00', agora)).toBe('VENCIDA')
  })
  it('sem vencimento, nada', () => {
    expect(textoDoVencimento(null, agora)).toBeNull()
  })
})
