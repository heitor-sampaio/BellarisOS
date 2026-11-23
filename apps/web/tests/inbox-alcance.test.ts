import { describe, it, expect } from 'vitest'
import { passaNasCaixas } from '@/lib/inbox/visibilidade'

/**
 * A regra de alcance do inbox (as caixas do cargo), na forma que confere uma
 * conversa já lida — é o que tranca a abertura por id (`conversaAoAlcance`) e o
 * atalho das outras threads. A lista usa a mesma regra como filtro de query; se
 * as duas divergirem, a conversa some da lista e continua abrindo pelo id.
 * O alcance do dono saiu com o "só os meus" (SM3, o Heitor, 2026-11-23).
 */

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
