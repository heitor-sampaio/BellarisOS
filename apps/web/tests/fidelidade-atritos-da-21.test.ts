import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A18 da 21ª simulação (2026-11-17), Configurações → Fidelidade: o voucher de
 * R$ 30 por 200 pontos, com o ponto a R$ 0,01, não ganhava aviso — a tela
 * dizia "200 pontos valem R$ 2,00" e não que o voucher vale 15 vezes isso.
 * Princípio 2: avisa, não recusa.
 */

const sp = (s: string | null) => s?.replace(/[  ]/g, ' ') ?? null

describe('A18: o desconto acima do que os pontos valem ganha aviso', () => {
  it('R$ 30 por 200 pontos a R$ 0,01: 15 vezes', async () => {
    const { avisoDaRecompensaAcimaDosPontos } = await import('@/lib/fidelidade/formato')
    expect(sp(avisoDaRecompensaAcimaDosPontos(30, 200, 0.01)))
      .toBe('O desconto (R$ 30,00) vale 15 vezes o que os 200 pontos valem (R$ 2,00). Confira o custo em pontos ou o valor do ponto.')
  })
  it('pouco acima: "mais do que"', async () => {
    const { avisoDaRecompensaAcimaDosPontos } = await import('@/lib/fidelidade/formato')
    expect(sp(avisoDaRecompensaAcimaDosPontos(3, 200, 0.01)))
      .toBe('O desconto (R$ 3,00) vale mais do que os 200 pontos valem (R$ 2,00). Confira o custo em pontos ou o valor do ponto.')
  })
  it('sem aviso: igual ou abaixo, ou sem o valor do ponto', async () => {
    const { avisoDaRecompensaAcimaDosPontos } = await import('@/lib/fidelidade/formato')
    expect(avisoDaRecompensaAcimaDosPontos(2, 200, 0.01)).toBeNull()
    expect(avisoDaRecompensaAcimaDosPontos(30, 200, null)).toBeNull()
    expect(avisoDaRecompensaAcimaDosPontos(30, 0, 0.01)).toBeNull()
  })
  it('o formulário da recompensa mostra o aviso (sem recusar)', () => {
    const f = readFileSync(join(__dirname, '..', 'components/admin/fidelidade-catalogo.tsx'), 'utf8')
    expect(f).toContain('avisoDaRecompensaAcimaDosPontos(')
    expect(f).toContain('data-recompensa-acima-dos-pontos')
  })
})
