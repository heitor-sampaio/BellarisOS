import { describe, it, expect } from 'vitest'
import { passaNoAlcanceDoDono, passaNasCaixas } from '@/lib/inbox/visibilidade'

/**
 * As duas regras de alcance do inbox, na forma que confere uma conversa já
 * lida — é o que tranca a abertura por id (`conversaAoAlcance`) e o atalho das
 * outras threads. A lista usa a mesma regra como filtro de query; se as duas
 * divergirem, a conversa some da lista e continua abrindo pelo id.
 */

describe('passaNoAlcanceDoDono', () => {
  it('sem regra de dono (CRM "todos"), tudo passa', () => {
    expect(passaNoAlcanceDoDono({ lead_id: 'x', contato_id: 'p' }, null)).toBe(true)
  })

  it('pela pessoa: some quem é de outro dono, fica o resto', () => {
    const alcance = { modo: 'pessoa' as const, ocultas: ['de-outro'] }
    expect(passaNoAlcanceDoDono({ lead_id: null, contato_id: 'de-outro' }, alcance)).toBe(false)
    expect(passaNoAlcanceDoDono({ lead_id: null, contato_id: 'livre' }, alcance)).toBe(true)
    // Conversa sem pessoa fica no bolo comum, como na lista.
    expect(passaNoAlcanceDoDono({ lead_id: null, contato_id: null }, alcance)).toBe(true)
  })

  it('pela conversa: thread sem oportunidade é de todos; com, só se for sua', () => {
    const alcance = { modo: 'conversa' as const, meusLeads: ['meu'] }
    expect(passaNoAlcanceDoDono({ lead_id: null,    contato_id: 'p' }, alcance)).toBe(true)
    expect(passaNoAlcanceDoDono({ lead_id: 'meu',   contato_id: 'p' }, alcance)).toBe(true)
    expect(passaNoAlcanceDoDono({ lead_id: 'alheio', contato_id: 'p' }, alcance)).toBe(false)
  })
})

describe('passaNasCaixas', () => {
  it('cargo que vê todas: tudo passa', () => {
    expect(passaNasCaixas('qualquer', null)).toBe(true)
  })

  it('"só as da pessoa": a caixa dela passa, a outra não', () => {
    expect(passaNasCaixas('atendimento', ['atendimento'])).toBe(true)
    expect(passaNasCaixas('comercial',   ['atendimento'])).toBe(false)
  })

  it('sem número ligado, nenhum WhatsApp — mas conversa sem caixa passa', () => {
    expect(passaNasCaixas('atendimento', [])).toBe(false)
    // Instagram, Messenger: não há caixa para comparar.
    expect(passaNasCaixas(null, [])).toBe(true)
  })
})
