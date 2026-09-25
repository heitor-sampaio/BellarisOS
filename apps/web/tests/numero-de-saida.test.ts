import { describe, it, expect } from 'vitest'
import { escolherNumeroDeSaida, avisoDeCaixaDiferente } from '@/lib/whatsapp/escolha'
import type { NumeroDeWhatsApp } from '@/lib/whatsapp/types'

/**
 * A regra de por onde a mensagem sai.
 *
 * Antes de 2026-09-25 esta regra era `order by updated_at desc` + `data[0]`:
 * a rede falava pela conexão mexida por último, e ninguém via porque só havia
 * uma. Estes testes existem para que o desempate temporal não volte disfarçado
 * de conserto.
 */

function caixa(over: Partial<NumeroDeWhatsApp> & { id: string }): NumeroDeWhatsApp {
  return {
    tenantId: 't1', provider: 'uazapi', label: over.id, phone: null,
    phoneNumberId: null, wabaId: null, branchId: null, userId: null,
    isDefault: false, isActive: true, managed: false,
    config: { provider: 'uazapi', token: 'x' },
    ...over,
  }
}

describe('escolherNumeroDeSaida', () => {
  it('o número do usuário vence a conversa E o padrão', () => {
    const numeros = [
      caixa({ id: 'padrao',   isDefault: true }),
      caixa({ id: 'conversa' }),
      caixa({ id: 'do-ana',   userId: 'ana' }),
    ]
    // Decisão do Heitor, reafirmada depois de eu explicar o custo: quem tem
    // número próprio fala por ele, inclusive respondendo conversa alheia.
    expect(escolherNumeroDeSaida(numeros, 'ana', 'conversa')?.id).toBe('do-ana')
  })

  it('usuário com número INATIVO cai na caixa da conversa, não na dele', () => {
    const numeros = [
      caixa({ id: 'padrao',   isDefault: true }),
      caixa({ id: 'conversa' }),
      caixa({ id: 'do-ana',   userId: 'ana', isActive: false }),
    ]
    expect(escolherNumeroDeSaida(numeros, 'ana', 'conversa')?.id).toBe('conversa')
  })

  it('sem usuário com número, responde pela caixa da conversa', () => {
    const numeros = [
      caixa({ id: 'padrao',   isDefault: true }),
      caixa({ id: 'conversa' }),
    ]
    expect(escolherNumeroDeSaida(numeros, 'bruno', 'conversa')?.id).toBe('conversa')
  })

  it('o que o sistema inicia (sem usuário, sem conversa) sai pelo padrão', () => {
    const numeros = [
      caixa({ id: 'outra' }),
      caixa({ id: 'padrao', isDefault: true }),
    ]
    expect(escolherNumeroDeSaida(numeros, null, null)?.id).toBe('padrao')
  })

  it('conversa que aponta para caixa DESATIVADA cai no padrão', () => {
    const numeros = [
      caixa({ id: 'padrao',   isDefault: true }),
      caixa({ id: 'conversa', isActive: false }),
    ]
    expect(escolherNumeroDeSaida(numeros, null, 'conversa')?.id).toBe('padrao')
  })

  it('DUAS caixas ativas e nenhum padrão devolve null — não escolhe uma', () => {
    const numeros = [caixa({ id: 'a' }), caixa({ id: 'b' })]

    // Esta é a asserção que impede alguém de "consertar" um bug futuro
    // reintroduzindo o `data[0]`. O índice único garante NO MÁXIMO um padrão,
    // não PELO MENOS um: a falta é estado que a tela tem de resolver, não que o
    // código tenha de adivinhar.
    expect(escolherNumeroDeSaida(numeros, null, null)).toBeNull()
    expect(escolherNumeroDeSaida(numeros, 'ana', null)).toBeNull()
  })

  it('rede sem nenhuma caixa ativa devolve null', () => {
    const numeros = [caixa({ id: 'a', isDefault: true, isActive: false })]
    expect(escolherNumeroDeSaida(numeros, null, null)).toBeNull()
  })
})

describe('avisoDeCaixaDiferente', () => {
  it('cala quando a caixa que envia é a da conversa', () => {
    const c = caixa({ id: 'recepcao', label: 'Recepção' })
    expect(avisoDeCaixaDiferente(c, { id: 'recepcao', label: 'Recepção' })).toBeNull()
  })

  it('cala quando a conversa ainda não tem caixa', () => {
    expect(avisoDeCaixaDiferente(caixa({ id: 'x' }), null)).toBeNull()
  })

  it('nomeia OS DOIS números quando divergem', () => {
    const aviso = avisoDeCaixaDiferente(
      caixa({ id: 'ana', label: 'Ana comercial' }),
      { id: 'recepcao', label: 'Recepção' },
    )
    // Quem lê precisa saber por qual número está falando e qual o cliente
    // conhece — um nome só não resolve nada.
    expect(aviso).toContain('Ana comercial')
    expect(aviso).toContain('Recepção')
    expect(aviso).toContain('conversa nova')
  })
})
