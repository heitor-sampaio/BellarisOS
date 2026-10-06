import { describe, it, expect } from 'vitest'
import { segredoInternoConfere, tagsParaExpirar } from '@estetica-os/nucleo/lib/interno'

/**
 * A conversa ENTRE os apps (2026-10-06): o sistema e o suporte mudam coisas
 * cujo cache mora no processo da CLÍNICA (a situação da rede, a sessão de
 * suporte) e pedem à clínica que o expire (`/api/interno/expirar`). A rota é
 * pública no proxy como toda `/api/*`: se defende pelo segredo, e só expira o
 * que a lista fechada deixa.
 */
const SEGREDO = 's'.repeat(40)

describe('segredoInternoConfere', () => {
  it('só com o Bearer certo', () => {
    expect(segredoInternoConfere(`Bearer ${SEGREDO}`, SEGREDO)).toBe(true)
    expect(segredoInternoConfere(`Bearer ${SEGREDO}x`, SEGREDO)).toBe(false)
    expect(segredoInternoConfere(SEGREDO, SEGREDO)).toBe(false)
    expect(segredoInternoConfere(null, SEGREDO)).toBe(false)
  })
  it('sem segredo configurado (ou curto), recusa tudo — comparar com vazio aceitaria qualquer um', () => {
    expect(segredoInternoConfere('Bearer ', '')).toBe(false)
    expect(segredoInternoConfere('Bearer abc', 'abc')).toBe(false)
    expect(segredoInternoConfere('Bearer x', undefined)).toBe(false)
  })
})

describe('tagsParaExpirar', () => {
  const rede = 'rede:2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091'
  const sessao = 'suporte-sessao:2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091'
  it('aceita só a situação da rede, a sessão de suporte, o membro e a pessoa da plataforma — com id', () => {
    expect(tagsParaExpirar({ tags: [rede, sessao] })).toEqual([rede, sessao])
    // O suporte reativa um membro (o cache dele é da clínica); o sistema
    // desativa um atendente (o cache dele também mora no app do suporte).
    const membro = 'user:2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091'
    const atendente = 'plataforma:2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091'
    expect(tagsParaExpirar({ tags: [membro, atendente] })).toEqual([membro, atendente])
  })
  it('recusa qualquer outra coisa (o pedido inteiro)', () => {
    for (const ruim of [
      { tags: ['permissions:abc'] }, { tags: ['rede:'] }, { tags: ['rede:x;drop'] }, { tags: 'rede:1' },
      { tags: [] }, {}, null, { tags: Array.from({ length: 51 }, () => rede) },
    ]) expect(tagsParaExpirar(ruim), JSON.stringify(ruim)).toBeNull()
  })
})
