import { describe, expect, it } from 'vitest'
import { EntradaDaRecompensa } from '@/lib/fidelidade/recompensa'

/**
 * A7 da 12ª simulação (2026-11-11; princípio 1): a recompensa "Produto /
 * brinde" exigia um produto do estoque, e a "Máscara de LED cortesia" da
 * Helena virou "Máscara facial calmante". O brinde ou serviço vale só com o
 * nome (sem produto: a entrega não mexe no estoque).
 */
describe('A7: o brinde sem produto do estoque', () => {
  it('a recompensa "Produto / brinde" salva sem produto', () => {
    const r = EntradaDaRecompensa.safeParse({ name: 'Máscara de LED cortesia', type: 'PRODUTO', points_cost: 500, validity_days: 30 })
    expect(r.success).toBe(true)
    expect(r.success && r.data.product_id).toBeNull()
  })
  it('com produto, ele segue (a entrega tira do estoque)', () => {
    const id = '11111111-2222-4333-8444-555555555555'
    const r = EntradaDaRecompensa.safeParse({ name: 'Sérum', type: 'PRODUTO', points_cost: 500, validity_days: 30, product_id: id })
    expect(r.success && r.data.product_id).toBe(id)
  })
})
