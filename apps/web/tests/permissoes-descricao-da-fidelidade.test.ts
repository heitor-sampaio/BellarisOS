import { describe, it, expect } from 'vitest'
import { MODULE_HINTS } from '@/lib/permissions'

/**
 * fidelidade:PG-05 (princípio 3): a Fidelidade em Gerenciar também troca pontos
 * por recompensa e cancela e entrega o voucher. A descrição do módulo na tela
 * de Cargos dizia só "Pontos do cliente: saldo, extrato e ajuste".
 */
describe('PG-05: a descrição do módulo da Fidelidade diz a troca e o voucher', () => {
  it('saldo, extrato, troca por recompensa, voucher e ajuste', () => {
    expect(MODULE_HINTS.loyalty).toMatch(/saldo/)
    expect(MODULE_HINTS.loyalty).toMatch(/troca por recompensa/)
    expect(MODULE_HINTS.loyalty).toMatch(/voucher/)
    expect(MODULE_HINTS.loyalty).toMatch(/ajuste/)
  })
})
