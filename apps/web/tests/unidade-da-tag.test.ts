import { describe, it, expect } from 'vitest'
import { unidadeDaTag } from '@/lib/unidades/unidade-inicial'

/**
 * F73 — A25 da 14ª simulação ("a unidade da cliente é a tag", F68;
 * princípio 3): o lead com a tag "Unidade: Manacá Savassi" abria o Agendar em
 * "Selecione a unidade…". A tag escolhe a unidade quando aponta UMA da lista.
 */
const UNIDADES = [
  { id: 'sav', name: 'Manacá Savassi' },
  { id: 'pam', name: 'Manacá Pampulha' },
]

describe('a unidade que a tag do lead aponta', () => {
  it('uma tag de unidade que está na lista escolhe ela', () => {
    expect(unidadeDaTag(UNIDADES, ['VIP', 'Unidade: Manacá Savassi'])).toBe('sav')
  })

  it('sem tag de unidade, nenhuma', () => {
    expect(unidadeDaTag(UNIDADES, ['VIP'])).toBe('')
  })

  it('duas tags de unidade: não escolhe (a pessoa decide)', () => {
    expect(unidadeDaTag(UNIDADES, ['Unidade: Manacá Savassi', 'Unidade: Manacá Pampulha'])).toBe('')
  })

  it('a tag de uma unidade fora da lista (desativada, de outra rede) não escolhe', () => {
    expect(unidadeDaTag(UNIDADES, ['Unidade: Manacá Centro'])).toBe('')
  })

  it('a mesma tag repetida conta uma vez', () => {
    expect(unidadeDaTag(UNIDADES, ['Unidade: Manacá Pampulha', 'Unidade: Manacá Pampulha'])).toBe('pam')
  })
})
