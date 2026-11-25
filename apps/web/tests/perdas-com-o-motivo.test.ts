import { describe, it, expect } from 'vitest'
import { perdasComOMotivo } from '@/lib/estoque/perda'

/**
 * A perda é métrica e aparece "com o motivo certo" (indicadores:ER-04;
 * docs/regras/indicadores.md, "Perdas no período"; fidelidade.md: "O brinde
 * que sai do estoque é perda 'Brinde da fidelidade'"). A linha "Fora do
 * resultado" do DRE dizia só "perdas R$ 40,00": a entrega da recompensa
 * parecia um sumiço (D10 da 30ª). O texto diz cada motivo, pelo rótulo dele.
 */
describe('as perdas fora do resultado, com o motivo', () => {
  it('o brinde da fidelidade diz que é o brinde', () => {
    expect(perdasComOMotivo([{ motivo: 'BRINDE', custo: 40, movimentos: 1 }]))
      .toMatch(/^Brinde da fidelidade R\$\s40,00$/)
  })
  it('vários motivos, do maior custo ao menor, cada um com o seu valor', () => {
    const t = perdasComOMotivo([
      { motivo: 'INVENTARIO', custo: 12.5, movimentos: 2 },
      { motivo: 'BRINDE', custo: 40, movimentos: 1 },
      { motivo: 'Vencido', custo: 3, movimentos: 1 },
    ])
    expect(t).toMatch(/^Brinde da fidelidade R\$\s40,00 · Inventário R\$\s12,50 · Vencido R\$\s3,00$/)
  })
  it('sem perda, nada', () => {
    expect(perdasComOMotivo([])).toBe('')
  })
})
