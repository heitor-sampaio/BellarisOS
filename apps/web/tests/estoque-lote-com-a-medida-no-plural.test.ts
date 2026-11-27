import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { quantidadeComMedida } from '@/lib/estoque/medidas'

/**
 * D13 da 37ª simulação (princípio 3): os lotes do produto na tela do estoque
 * diziam "3 frasco", "2 seringa" — a quantidade colada na medida, sem o plural.
 * A tela passa pela mesma regra do resto do estoque (`quantidadeComMedida`).
 */
describe('D13: o lote diz a medida no plural', () => {
  it('a regra: "3 frascos", "1 frasco"', () => {
    expect(quantidadeComMedida(3, 'frasco', 2)).toBe('3 frascos')
    expect(quantidadeComMedida(1, 'frasco', 2)).toBe('1 frasco')
  })
  it('a lista de lotes usa a regra, não "{quantidade} {unit}"', () => {
    const tela = readFileSync(join(__dirname, '..', 'components/admin/admin-stock-view.tsx'), 'utf8')
    expect(tela).toMatch(/quantidadeComMedida\(l\.quantidade, p\.unit/)
    expect(tela).not.toMatch(/\{l\.quantidade\.toLocaleString\('pt-BR', \{ maximumFractionDigits: 2 \}\)\} \{p\.unit\}/)
  })
})
