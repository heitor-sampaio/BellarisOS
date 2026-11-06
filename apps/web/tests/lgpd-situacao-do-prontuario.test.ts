import { describe, it, expect } from 'vitest'
import { textoDoProntuarioForaDoPacote, prontuarioNaSolicitacao } from '@/lib/lgpd/situacao-do-prontuario'

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

// A56 da 8ª simulação (2026-11-06): com "Incluir prontuário" marcado, o JSON
// dizia só `incluiProntuario: false` antes da liberação — parecia que o pedido
// tinha sido ignorado. O pedido diz a situação do prontuário por extenso.
describe('A56: a solicitação diz a situação do prontuário', () => {
  it('pedido e esperando a clínica: "pendente de liberação"', () => {
    expect(prontuarioNaSolicitacao('pending', false)).toBe('pedido — pendente de liberação pela clínica')
  })
  it('liberado e incluído', () => {
    expect(prontuarioNaSolicitacao('approved', true)).toBe('pedido — liberado e incluído neste pacote')
  })
  it('não liberado', () => {
    expect(prontuarioNaSolicitacao('denied', false)).toBe('pedido — não liberado pela clínica')
  })
  it('não pedido', () => {
    expect(prontuarioNaSolicitacao('not_requested', false)).toBe('não pedido')
  })
})
