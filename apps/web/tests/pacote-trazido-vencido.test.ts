import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoDoPacoteDeForaVencido } from '@/lib/pacotes/de-fora'

/**
 * Decisão A2 da 37ª (decisão do Claude, 27/11, pelo princípio 2 e a fala do
 * Heitor de 25/11: "Se não for impossível, ainda que improvável, pode ser
 * feito"): o pacote TRAZIDO com a validade já passada é aceito, e a janela
 * avisa, numa linha, que ele nasce vencido.
 */
describe('o pacote trazido com a validade já passada', () => {
  it('avisa que nasce vencido; hoje e depois, não', () => {
    expect(avisoDoPacoteDeForaVencido('2026-11-26', '2026-11-27')).toBe('Esta validade já passou: o pacote nasce vencido.')
    expect(avisoDoPacoteDeForaVencido('2026-11-27', '2026-11-27')).toBeNull()
    expect(avisoDoPacoteDeForaVencido('2026-12-01', '2026-11-27')).toBeNull()
    expect(avisoDoPacoteDeForaVencido('', '2026-11-27')).toBeNull()
  })
  it('a janela mostra o aviso ao lado da validade, no tom do improvável', () => {
    const janela = readFileSync(join(__dirname, '..', 'components/shared/trazer-pacote-de-fora.tsx'), 'utf8')
    expect(janela).toMatch(/avisoDoPacoteDeForaVencido\(validade, hoje\)/)
    expect(janela).toMatch(/data-pacote-nasce-vencido/)
  })
})
