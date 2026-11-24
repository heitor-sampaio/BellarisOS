import { describe, expect, it } from 'vitest'
import { situacaoDoVencimento, textoDoVencimento, diasAteOVencimento } from '@/lib/financeiro/vencimentos'
import { vencidaHaEmTexto } from '@/lib/clientes/ordem-das-transacoes'

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

// A vencida na ficha diz há quanto tempo (vendas-financeiro.md, a aba
// Financeiro da ficha): "Vencida há N dias", de dia a dia no fuso da unidade.
describe('"Vencida há N dias"', () => {
  it('a frase, no singular e no plural', () => {
    expect(vencidaHaEmTexto(1)).toBe('Vencida há 1 dia')
    expect(vencidaHaEmTexto(13)).toBe('Vencida há 13 dias')
  })
  it('os dias são de dia a dia no fuso da unidade (não em horas UTC)', () => {
    // Venceu em 05/11 (meio-dia de Brasília); às 00:30 de 18/11 em Brasília (03:30Z) são 13 dias.
    expect(-diasAteOVencimento('2026-11-05T15:00:00Z', new Date('2026-11-18T03:30:00Z'), 'America/Sao_Paulo')).toBe(13)
  })
})
