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
    // O formulário grava "(47) 99123-4567" e o WhatsApp manda "5547991234567":
    // a busca compara os dígitos pelo número inteiro, com o 55 e o nono dígito
    // tolerados (`private.telefone_casa`, F70 — antes, os 8 finais, e o DDD
    // ficava de fora).
    const doFormulario = digitosDoTelefone('(47) 99123-4567')
    const doWhatsApp   = digitosDoTelefone('5547991234567')
    expect(doFormulario).not.toBe(doWhatsApp)
    expect(doFormulario.slice(-8)).toBe(doWhatsApp.slice(-8))
    expect(doFormulario.slice(-8)).toBe('91234567')
  })
})
