import { describe, it, expect } from 'vitest'
import { estadoDaCaixa } from '@/lib/plataforma/diagnostico'

/** O diagnóstico da rede (veio de apps/web/tests/suporte-regras em 2026-10-06). */
describe('o diagnóstico', () => {
  it('o diagnóstico só mostra o estado da caixa, nunca segredo', () => {
    expect(estadoDaCaixa({ token: 't', accessToken: 'a', pin: '1', appSecret: 's', conexao: 'cadastro_incorporado', connectedPhone: '55' }))
      .toEqual({ conexao: 'cadastro_incorporado', connectedPhone: '55' })
  })
})
