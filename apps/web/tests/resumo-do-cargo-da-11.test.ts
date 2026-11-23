import { describe, it, expect } from 'vitest'
import { LEVEL_COPY } from '@/lib/permissions-copy'

// A15 da 11ª simulação (2026-11-10): dar Recebimentos ao cargo Comercial pôs
// "Fechamento do dia" no menu dela, e a linha do módulo não dizia (princípio 3).
describe('A15 da 11ª: Recebimentos diz que abre o Fechamento do dia', () => {
  it('o Gerenciar de Recebimentos cita o Fechamento do dia', () => {
    expect(LEVEL_COPY.cashier.MANAGE).toMatch(/Fechamento do dia/)
  })
})
