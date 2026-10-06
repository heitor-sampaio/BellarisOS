import { describe, it, expect } from 'vitest'
import { opcoesDoCookieDeSessao, SETE_DIAS } from '@/lib/supabase/cookie-de-sessao'

/**
 * A sessão do Supabase mora em cookie, e o cookie NÃO pode ser lido pelo JS da
 * página: um script injetado levaria o refresh token (7 dias, renovável) e
 * sequestraria a conta da máquina dele, mesmo depois da falha corrigida.
 * Toda escrita de cookie de sessão passa por esta função.
 */
describe('opcoesDoCookieDeSessao', () => {
  it('é httpOnly, lax e vale 7 dias — o que a biblioteca mandar não desliga isso', () => {
    const o = opcoesDoCookieDeSessao('base64-abc', { httpOnly: false, sameSite: 'none', maxAge: 400 * 86400, path: '/' }, false)
    expect(o.httpOnly).toBe(true)
    expect(o.sameSite).toBe('lax')
    expect(o.maxAge).toBe(SETE_DIAS)
    expect(o.path).toBe('/')
  })

  it('o pedaço vazio é para APAGAR: maxAge 0, sem ganhar os 7 dias', () => {
    const o = opcoesDoCookieDeSessao('', { path: '/' }, false)
    expect(o.maxAge).toBe(0)
    expect(o.httpOnly).toBe(true)
  })

  it('secure em produção; em http local (o E2E contra o build) não', () => {
    expect(opcoesDoCookieDeSessao('x', {}, true).secure).toBe(true)
    expect(opcoesDoCookieDeSessao('x', {}, false).secure).toBe(false)
  })

  it('nunca ganha domínio: o cookie é do host (a clínica e a plataforma não dividem sessão)', () => {
    const o = opcoesDoCookieDeSessao('x', { domain: '.bellarisos.com' }, true)
    expect(o.domain).toBeUndefined()
  })
})
