import { describe, it, expect } from 'vitest'
import { conversaCasaComBusca } from '@/lib/inbox/busca'

/**
 * A busca do inbox casa o telefone pelos DÍGITOS só quando o termo é um
 * telefone (2026-10-07). Antes, os dígitos soltos de um termo de texto
 * entravam também: "Nome da pessoa muyl997q" achava todo telefone com "997" —
 * e o E2E do nome da pessoa caía quando o sufixo aleatório tinha 3 dígitos.
 * É a regra que a busca universal já seguia (sem letra no termo).
 */
const conversa = (contact_phone: string) => ({
  contact_name: 'Cris', last_message: 'Gostaria de mais informações', contact_phone, lead_tags: [],
})

describe('conversaCasaComBusca', () => {
  it('termo com letras não casa o telefone pelos dígitos soltos', () => {
    expect(conversaCasaComBusca(conversa('+55 48 99977-1234'), 'Nome da pessoa muyl997q')).toBe(false)
    expect(conversaCasaComBusca(conversa('+55 48 99977-1234'), 'Maria 99')).toBe(false)
  })

  it('termo que é telefone casa pelos dígitos, com qualquer pontuação', () => {
    expect(conversaCasaComBusca(conversa('+55 48 99977-1234'), '99977')).toBe(true)
    expect(conversaCasaComBusca(conversa('5548999771234'), '(48) 99977-1234')).toBe(true)
    expect(conversaCasaComBusca(conversa('5548999771234'), '+55 48 9997')).toBe(true)
  })

  it('menos de 3 dígitos não busca por telefone', () => {
    expect(conversaCasaComBusca(conversa('5548999771234'), '(4')).toBe(false)
  })
})
