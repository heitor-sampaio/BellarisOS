import { describe, it, expect, vi } from 'vitest'
import { limparSessaoAntigaDoAparelho, CHAVE_DA_SESSAO_ANTIGA } from '@/lib/sessao-antiga-do-aparelho'

/**
 * Até 2026-10-06 o app Android espelhava access e REFRESH token nas
 * Preferences (`supabase-session`), legíveis pelo JS do WebView. O espelho
 * saiu, mas os aparelhos já instalados ainda guardam o último token — e o
 * plugin continua no APK. Na primeira abertura com o web novo, apaga.
 */
describe('limparSessaoAntigaDoAparelho', () => {
  it('apaga a chave antiga quando está no app', async () => {
    const remove = vi.fn(async () => {})
    await limparSessaoAntigaDoAparelho({ nativo: true, preferencias: async () => ({ remove }) })
    expect(remove).toHaveBeenCalledWith({ key: CHAVE_DA_SESSAO_ANTIGA })
    expect(CHAVE_DA_SESSAO_ANTIGA).toBe('supabase-session')
  })

  it('no navegador não faz nada (nem carrega o plugin)', async () => {
    const preferencias = vi.fn()
    await limparSessaoAntigaDoAparelho({ nativo: false, preferencias })
    expect(preferencias).not.toHaveBeenCalled()
  })

  it('falha do plugin não derruba a página', async () => {
    await expect(limparSessaoAntigaDoAparelho({
      nativo: true, preferencias: async () => ({ remove: async () => { throw new Error('sem plugin') } }),
    })).resolves.toBeUndefined()
  })
})
