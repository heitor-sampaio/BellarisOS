import { describe, it, expect } from 'vitest'
import { clienteCasaComBusca, telefoneCasaComDigitos } from '@/lib/busca/cliente'

// D6 da 8ª simulação: o espelho de private.telefone_casa e da regra de casar
// da busca universal (migration 20261106003401).
describe('busca de cliente — uma regra só', () => {
  const zelia = { name: 'Zélia Prado', phone: '(85) 99100-0034' }

  it('sem acento, sem caixa e as palavras em qualquer ordem', () => {
    expect(clienteCasaComBusca(zelia, 'zelia')).toBe(true)
    expect(clienteCasaComBusca(zelia, 'PRADO zelia')).toBe(true)
    expect(clienteCasaComBusca(zelia, 'zelia souza')).toBe(false)
  })

  it('o telefone por dígitos, gravado com máscara', () => {
    expect(clienteCasaComBusca(zelia, '85991000034')).toBe(true)
    expect(clienteCasaComBusca(zelia, '(85) 99100-0034')).toBe(true)
    expect(clienteCasaComBusca(zelia, '0034')).toBe(true)
  })

  it('com o 55 do WhatsApp e com ou sem o nono dígito', () => {
    expect(clienteCasaComBusca(zelia, '5585991000034')).toBe(true)
    expect(clienteCasaComBusca(zelia, '558591000034')).toBe(true)
    expect(clienteCasaComBusca(zelia, '8591000034')).toBe(true)
    expect(telefoneCasaComDigitos('558591000034', '85991000034')).toBe(true)
  })

  it('o termo com letra não casa pelos dígitos soltos', () => {
    expect(clienteCasaComBusca(zelia, 'abc0034')).toBe(false)
    expect(telefoneCasaComDigitos(zelia.phone, '12')).toBe(false)
    expect(clienteCasaComBusca(zelia, '12345')).toBe(false)
  })
})
