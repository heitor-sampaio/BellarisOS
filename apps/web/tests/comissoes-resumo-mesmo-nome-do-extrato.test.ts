import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Princípio 7 (o mesmo nome para a mesma coisa) e CF-14 ("Cada lançamento diz
 * se foi pago: 'Paga em 10/11/2026' ou 'A pagar'"): o Resumo do Financeiro
 * dizia "Pend." e "Pago" na comissão que o Extrato chama de "A pagar" e "Paga".
 */
describe('a comissão no Resumo tem o nome do Extrato', () => {
  const fonte = readFileSync(join(__dirname, '..', 'components/branch/financial-hub.tsx'), 'utf8')
  it('"Paga" e "A pagar", sem "Pend."', () => {
    expect(fonte).not.toContain("'Pend.'")
    expect(fonte).toContain("{item.isPaid ? 'Paga' : 'A pagar'}")
  })
})
