import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rotuloDeUsarANota, ofereceUsarANota } from '@/lib/estoque/nota-da-entrada'

/**
 * R34 (o Heitor, 27/11: "Começa vazia, com o botão "Usar a nota NF-…" (a
 * proposta)"): a Entrada nova começa sem a nota e sem o fornecedor da anterior,
 * e o botão "Usar a nota NF-1002" traz os dois para quem lança a mesma nota.
 * Era a A54 da 11ª (decisão do Claude, 10/11): a próxima entrada já vinha com a
 * nota e o fornecedor, e um aviso dizia para apagar se fosse outra.
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const modal = () => fonte('components/admin/admin-stock-manage-modal.tsx')
const anterior = { nota: 'NF-1002', fornecedor: 'Distribuidora Sul' }

describe('a Entrada começa vazia (R34)', () => {
  it('nem a nota nem o fornecedor da anterior vêm preenchidos', () => {
    const m = modal()
    expect(m).not.toMatch(/defaultValue=\{notaAnterior/)
    expect(m).not.toMatch(/inicial=\{notaAnterior/)
  })
  it('o aviso "apague se esta for outra" saiu', () => {
    const m = modal()
    expect(m).not.toContain('apague se esta for outra')
    expect(m).not.toContain('data-nota-da-entrada-anterior')
  })
})

describe('o botão "Usar a nota NF-…" (R34)', () => {
  it('diz a nota da entrada anterior', () => {
    expect(rotuloDeUsarANota(anterior)).toBe('Usar a nota NF-1002')
    expect(rotuloDeUsarANota({ nota: '004630', fornecedor: null })).toBe('Usar a nota 004630')
  })
  it('aparece só com uma nota anterior, e some quando a nota já está no campo', () => {
    expect(ofereceUsarANota(null, '')).toBe(false)
    expect(ofereceUsarANota(anterior, '')).toBe(true)
    expect(ofereceUsarANota(anterior, 'NF-2000')).toBe(true)
    expect(ofereceUsarANota(anterior, 'NF-1002')).toBe(false)
    expect(ofereceUsarANota(anterior, ' NF-1002 ')).toBe(false)
  })
  it('a Entrada mostra o botão e ele traz a nota e o fornecedor', () => {
    const m = modal()
    expect(m).toMatch(/data-usar-a-nota-anterior/)
    expect(m).toMatch(/rotuloDeUsarANota\(notaAnterior\)/)
    expect(m).toMatch(/ofereceUsarANota\(notaAnterior, nota\)/)
    expect(m).toMatch(/function usarANotaAnterior\(\)[\s\S]{0,600}setNota\(notaAnterior\.nota\)[\s\S]{0,600}notaAnterior\.fornecedor/)
  })
})

describe('a nota guardada leva o fornecedor escolhido, também o criado ali', () => {
  // O fornecedor novo ("+ Novo fornecedor") não está na lista que a tela recebeu:
  // procurar o nome só nela guardava a nota sem o fornecedor, e o "Usar a nota"
  // não o trazia.
  it('o campo diz à Entrada qual escolheu, e a nota guarda esse nome', () => {
    const m = modal()
    expect(m).toMatch(/aoMudar=\{setFornecedorEscolhido\}/)
    expect(m).toMatch(/guardarNotaDaEntrada\(String\(fd\.get\('nota_fiscal'\) \?\? ''\), fornecedorEscolhido\?\.nome/)
  })
})
