import { describe, it, expect } from 'vitest'
import { digitosDoTelefone } from '@/lib/clients/cliente-rapido'

describe('digitosDoTelefone', () => {
  it('descarta tudo que não é dígito', () => {
    expect(digitosDoTelefone('(47) 99123-4567')).toBe('47991234567')
    expect(digitosDoTelefone('+55 47 9 9123 4567')).toBe('5547991234567')
  })

  it('aguenta vazio e nulo', () => {
    expect(digitosDoTelefone('')).toBe('')
    expect(digitosDoTelefone(undefined as unknown as string)).toBe('')
  })

  it('o mesmo número em máscaras diferentes tem os mesmos 8 dígitos finais', () => {
    // É por isso que a busca compara `right(digits, 8)`: o formulário grava
    // "(47) 99123-4567" e o WhatsApp manda "5547991234567". Um `ilike` com os
    // dígitos crus não casava com a máscara e criava cliente duplicado.
    const doFormulario = digitosDoTelefone('(47) 99123-4567')
    const doWhatsApp   = digitosDoTelefone('5547991234567')
    expect(doFormulario).not.toBe(doWhatsApp)
    expect(doFormulario.slice(-8)).toBe(doWhatsApp.slice(-8))
    expect(doFormulario.slice(-8)).toBe('91234567')
  })
})
