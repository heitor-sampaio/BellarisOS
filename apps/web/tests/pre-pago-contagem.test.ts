import { describe, it, expect } from 'vitest'
import { contagemDoPago, textoDoParaAgendar, textoDasRestantes } from '@/lib/pre-pago/contagem'

// A27 da 6ª simulação: "3 para agendar" não baixava ao agendar, só ao concluir.
describe('o que está para agendar e o que já está agendado', () => {
  it('a disponível com agendamento é agendada; usada e cancelada não entram', () => {
    const c = contagemDoPago([
      { status: 'DISPONIVEL', agendada: true }, { status: 'DISPONIVEL', agendada: false },
      { status: 'DISPONIVEL', agendada: false }, { status: 'USADA', agendada: true }, { status: 'CANCELADA', agendada: false },
    ])
    expect(c).toEqual({ paraAgendar: 2, agendadas: 1 })
    expect(textoDoParaAgendar(c)).toBe('2 para agendar · 1 agendada')
  })
  it('o texto, nos casos de borda', () => {
    expect(textoDoParaAgendar({ paraAgendar: 0, agendadas: 2 })).toBe('nada para agendar · 2 agendadas')
    expect(textoDoParaAgendar({ paraAgendar: 0, agendadas: 0 })).toBe('nada para agendar')
    expect(textoDoParaAgendar({ paraAgendar: 3, agendadas: 0 })).toBe('3 para agendar')
    expect(textoDasRestantes(2, 1)).toBe('2 sessões restantes · 1 agendada')
    expect(textoDasRestantes(1, 0)).toBe('1 sessão restante')
  })
})
