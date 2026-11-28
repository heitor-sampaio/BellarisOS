import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rotuloDaOrigemDoCredito } from '@/lib/creditos/origem'

/**
 * CI-04: "A ficha diz quanto a cliente pagou com crédito interno (que não conta
 * no investido) e de onde veio o crédito: concedido sem dinheiro (não é
 * receita), comprado, ou que ficou de um cancelamento". O pago com crédito
 * morava só na dica, e o crédito concedido ("cortesia") aparecia só com o
 * texto que quem concedeu digitou.
 */
describe('a origem de cada crédito na ficha', () => {
  it('o concedido pelo "Conceder crédito" diz que foi concedido, sem dinheiro', () => {
    expect(rotuloDaOrigemDoCredito({ amount: 50, concedido: true, comprado: false })).toBe('Concedido, sem dinheiro')
  })
  it('o resto já diz a origem na descrição que o banco grava ("Crédito interno comprado", "Bônus…", "Cancelamento…", "Devolução…")', () => {
    expect(rotuloDaOrigemDoCredito({ amount: 400, concedido: false, comprado: true })).toBeNull()
    expect(rotuloDaOrigemDoCredito({ amount: 40, concedido: true, comprado: true })).toBeNull()
    expect(rotuloDaOrigemDoCredito({ amount: 30, concedido: false, comprado: false })).toBeNull()
    expect(rotuloDaOrigemDoCredito({ amount: -165, concedido: false, comprado: false, transactionId: 't' })).toBeNull()
  })
})

describe('a aba Financeiro da ficha mostra o pago com crédito interno', () => {
  const fonte = readFileSync(join(__dirname, '..', 'components/branch/client-profile.tsx'), 'utf8')
  it('um número à vista, ao lado do Total pago', () => {
    expect(fonte).toContain("chave: 'pago-com-credito'")
  })
  it('e a origem na linha do crédito', () => {
    expect(fonte).toContain('rotuloDaOrigemDoCredito(')
  })
})
