import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * A15 da 32ª simulação (GA-07, GA-08; princípio 3). No modo "Por
 * procedimento", o campo "Pontos por R$ 1 pago" sumia — e o crédito interno
 * vendido (sempre) e a venda de produto (se ligada) pontuam por ele. O campo
 * fica à vista nos dois modos e, no "por procedimento", diz para que vale.
 */

const fonte = () => fs.readFileSync(path.join(__dirname, '..', 'components/admin/fidelidade-config.tsx'), 'utf8')

describe('A15: os pontos por R$ 1 à vista no modo "por procedimento"', () => {
  it('o campo não depende mais do modo "por real"', () => {
    const f = fonte()
    expect(f).not.toMatch(/modo === 'POR_REAL' && \(\s*<div[^>]*>\s*<CampoNumero rotulo="Pontos por R\$ 1 pago"/)
    expect(f).toMatch(/<CampoNumero rotulo="Pontos por R\$ 1 pago"/)
  })
  it('no "por procedimento", diz que vale para o crédito interno e a venda de produto', () => {
    const f = fonte()
    expect(f).toMatch(/data-pontos-por-real-no-modo-procedimento/)
    expect(f).toMatch(/No modo por procedimento, esta conta vale para o crédito interno vendido e, se ligada abaixo, para a venda de produto/)
  })
})
