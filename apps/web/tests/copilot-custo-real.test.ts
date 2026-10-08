import { describe, expect, it } from 'vitest'
import { custoPorMes, ratearCusto } from '@estetica-os/nucleo/lib/planos/custo-do-copilot'

/**
 * O custo REAL da OpenAI (a Costs API, com a chave de administração) e o
 * RATEIO dele entre as redes (pedido do Heitor, 2026-10-08): a OpenAI não sabe
 * quais são as redes, então o total real é dividido na proporção do custo
 * estimado de cada uma (o que já pesa entrada e saída pelo preço).
 */
const dia = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000)

describe('custoPorMes', () => {
  it('soma os dias de cada mês (o mês do dia em UTC, como a OpenAI os separa)', () => {
    const m = custoPorMes([
      { start_time: dia('2026-09-30'), results: [{ amount: { value: 0.5, currency: 'usd' } }] },
      { start_time: dia('2026-10-01'), results: [{ amount: { value: 1.25, currency: 'usd' } }, { amount: { value: 0.25, currency: 'usd' } }] },
      { start_time: dia('2026-10-07'), results: [] },
      { start_time: dia('2026-10-08'), results: [{ amount: { value: 2, currency: 'usd' } }] },
    ])
    expect(m.get('2026-09-01')).toBeCloseTo(0.5, 9)
    expect(m.get('2026-10-01')).toBeCloseTo(3.5, 9)
  })
})

describe('ratearCusto', () => {
  it('na proporção do custo estimado de cada rede — e a soma fecha com o real', () => {
    const r = ratearCusto(1.2, [
      { tenantId: 'a', custoUsd: 0.5, tokens: 400_000 },
      { tenantId: 'b', custoUsd: 0.1, tokens: 120_000 },
    ])
    expect(r.get('a')).toBeCloseTo(1.0, 9)
    expect(r.get('b')).toBeCloseTo(0.2, 9)
  })
  it('sem custo estimado em nenhuma (antes da coluna), pelos tokens', () => {
    const r = ratearCusto(1, [
      { tenantId: 'a', custoUsd: null, tokens: 300 },
      { tenantId: 'b', custoUsd: null, tokens: 100 },
    ])
    expect(r.get('a')).toBeCloseTo(0.75, 9)
    expect(r.get('b')).toBeCloseTo(0.25, 9)
  })
  it('a rede sem custo estimado num mês que tem (veio antes da coluna) entra pelos tokens, no preço médio', () => {
    // a: US$ 1 por 1.000 tokens; b: 500 tokens sem custo → vale US$ 0,50 no preço médio.
    const r = ratearCusto(3, [
      { tenantId: 'a', custoUsd: 1, tokens: 1000 },
      { tenantId: 'b', custoUsd: null, tokens: 500 },
    ])
    expect(r.get('a')).toBeCloseTo(2, 9)
    expect(r.get('b')).toBeCloseTo(1, 9)
  })
  it('ninguém usou: nada a ratear', () => {
    expect(ratearCusto(1, [{ tenantId: 'a', custoUsd: null, tokens: 0 }]).size).toBe(0)
  })
})
