import { describe, it, expect } from 'vitest'
import { passaDoLimite, mensagemDoLimite } from '@estetica-os/nucleo/lib/planos/limites'

/**
 * Os LIMITES do plano (2026-10-06): unidades, membros e números de WhatsApp,
 * de 1 a 10 ou ilimitado (null). Criar ou reativar o que passaria do limite é
 * recusado; o que já existe acima dele não é apagado.
 */
describe('passaDoLimite', () => {
  it('ilimitado nunca passa', () => {
    expect(passaDoLimite(null, 0)).toBe(false)
    expect(passaDoLimite(null, 999)).toBe(false)
  })
  it('mais um além do limite passa; até o limite, não', () => {
    expect(passaDoLimite(3, 2)).toBe(false)
    expect(passaDoLimite(3, 3)).toBe(true)
    expect(passaDoLimite(1, 0)).toBe(false)
    expect(passaDoLimite(1, 1)).toBe(true)
  })
  it('quem já está acima do limite continua recusado (não apaga, mas não cresce)', () => {
    expect(passaDoLimite(2, 5)).toBe(true)
  })
})

describe('mensagemDoLimite', () => {
  it('diz o limite e o caminho, no singular e no plural', () => {
    expect(mensagemDoLimite('unidades', 1)).toBe('O plano da sua rede permite até 1 unidade. Para ampliar, fale com o BellarisOS.')
    expect(mensagemDoLimite('membros', 5)).toBe('O plano da sua rede permite até 5 membros na equipe. Para ampliar, fale com o BellarisOS.')
    // O WhatsApp a clínica pode ampliar sozinha (adicional, 2026-10-07).
    expect(mensagemDoLimite('whatsapp', 2)).toBe('O plano da sua rede permite até 2 números de WhatsApp. Para ampliar, contrate uma conexão adicional em Configurações → Assinatura ou fale com o BellarisOS.')
  })
})
