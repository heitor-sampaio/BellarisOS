import { describe, it, expect } from 'vitest'
import { emailsDoPrimeiroAdmin, ehEmailDoPrimeiroAdmin } from '@/lib/plataforma/primeiro-admin'
import { tokenDoWebhookConfere } from '@/lib/asaas/webhook'

/** As regras puras do sistema (vieram de apps/web/tests/sistema-regras em 2026-10-06). */

describe('primeiro admin por variável', () => {
  it('aceita vários e-mails, sem diferença de caixa', () => {
    const lista = emailsDoPrimeiroAdmin(' Heitor+Suporte@Exemplo.com , outro@x.com,lixo')
    expect(lista).toEqual(['heitor+suporte@exemplo.com', 'outro@x.com'])
    expect(ehEmailDoPrimeiroAdmin('HEITOR+suporte@exemplo.com', lista)).toBe(true)
    expect(ehEmailDoPrimeiroAdmin('heitor@exemplo.com', lista)).toBe(false)
    expect(ehEmailDoPrimeiroAdmin(null, lista)).toBe(false)
  })
  it('sem variável, ninguém', () => {
    expect(emailsDoPrimeiroAdmin('')).toEqual([])
    expect(emailsDoPrimeiroAdmin(undefined)).toEqual([])
  })
})

describe('token do webhook do Asaas', () => {
  const certo = 'x'.repeat(40)
  it('confere em tempo constante', () => {
    expect(tokenDoWebhookConfere(certo, certo)).toBe(true)
    expect(tokenDoWebhookConfere('y'.repeat(40), certo)).toBe(false)
    expect(tokenDoWebhookConfere(null, certo)).toBe(false)
  })
  it('sem token configurado (ou curto), recusa tudo — vazio não vale', () => {
    expect(tokenDoWebhookConfere('', '')).toBe(false)
    expect(tokenDoWebhookConfere('curto', 'curto')).toBe(false)
    expect(tokenDoWebhookConfere(certo, undefined)).toBe(false)
  })
})
