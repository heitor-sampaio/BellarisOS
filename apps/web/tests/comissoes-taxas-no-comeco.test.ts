import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * R21 (o Heitor, 26/11: "Subir as taxas para o começo"): em Configurações → Comissões e taxas, as taxas da
 * maquininha vêm primeiro, antes da comissão. A opção da comissão que desconta a taxa perde o "(tabela abaixo)".
 */
const fonte = readFileSync(join(__dirname, '..', 'components', 'admin', 'settings-comissoes.tsx'), 'utf8')
const montagem = fonte.slice(fonte.indexOf('export function SettingsComissoes('), fonte.indexOf('const titulo = '))

describe('Comissões e taxas: as taxas da maquininha no começo (R21)', () => {
  it('a tabela de taxas vem antes da comissão de cada profissional e do "Como a comissão acontece"', () => {
    const taxas = montagem.indexOf('<TabelaDeTaxas')
    expect(taxas).toBeGreaterThan(-1)
    expect(taxas).toBeLessThan(montagem.indexOf('aria-label="Comissão de cada profissional"'))
    expect(taxas).toBeLessThan(montagem.indexOf('<ComoAcontece'))
  })
  it('a opção que desconta a taxa não aponta para "a tabela abaixo"', () => {
    expect(fonte).toContain("['desconta_taxa', 'Taxa da maquininha do pagamento']")
    expect(fonte).not.toMatch(/tabela abaixo/)
  })
})
