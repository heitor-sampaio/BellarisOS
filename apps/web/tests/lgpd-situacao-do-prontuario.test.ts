import { describe, it, expect } from 'vitest'
import { textoDoProntuarioForaDoPacote } from '@/lib/lgpd/situacao-do-prontuario'

// Simulação de um dia de clínica (2026-10-20): a Mariana PEDIU o prontuário e
// o pacote dizia "Não incluído nesta solicitação" — como se não tivesse pedido.
describe('o prontuário fora do pacote, por situação', () => {
  it('não pedido', () => {
    expect(textoDoProntuarioForaDoPacote('not_requested').json).toBe('Não incluído nesta solicitação.')
  })
  it('pedido e em análise: diz que vem num pacote novo', () => {
    const t = textoDoProntuarioForaDoPacote('pending')
    expect(t.json).toMatch(/em análise/i)
    expect(t.pdf.join(' ')).toMatch(/em análise/i)
    expect(t.pdf.join(' ')).toMatch(/novo/i)
  })
  it('pedido e não liberado', () => {
    expect(textoDoProntuarioForaDoPacote('denied').json).toMatch(/não liberou/i)
  })
})
