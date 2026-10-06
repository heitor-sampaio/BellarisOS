import { describe, it, expect, vi } from 'vitest'
import type { RealtimeClient } from '@supabase/supabase-js'
import { criarClienteDoNavegador } from '@estetica-os/nucleo/lib/supabase/client'

/**
 * O Realtime tem de pedir o token DE NOVO quando ele vence.
 *
 * O access token que o navegador recebe vale até 1 h. Com a opção
 * `accessToken`, o construtor do supabase-js chama `realtime.setAuth(token)`
 * COM o token — e o realtime-js marca o token como "manual": dali em diante
 * nem o heartbeat nem o rejoin chamam a função de novo. O canal morria quando
 * o primeiro token vencia, e o inbox, o quadro e os sinos paravam de
 * atualizar em silêncio (achado do verificador da fase 1, 2026-10-06).
 */
type Interno = RealtimeClient & { _isManualToken(): boolean; _setAuthSafely(c?: string): void; accessTokenValue: string | null }
const esperar = () => new Promise(ok => setTimeout(ok, 20))

describe('criarClienteDoNavegador', () => {
  it('o token vem da função, e o Realtime não o trata como manual', async () => {
    const obter = vi.fn(async () => 'tok-1')
    const rt = criarClienteDoNavegador('https://exemplo.supabase.co', 'anon', obter).realtime as Interno
    await esperar()
    expect(rt.accessTokenValue).toBe('tok-1')
    expect(rt._isManualToken()).toBe(false)
  })

  it('a cada renovação (o heartbeat), pede o token de novo e passa o novo adiante', async () => {
    let atual = 'tok-1'
    const obter = vi.fn(async () => atual)
    const rt = criarClienteDoNavegador('https://exemplo.supabase.co', 'anon', obter).realtime as Interno
    await esperar()
    const antes = obter.mock.calls.length
    atual = 'tok-2'
    rt._setAuthSafely('heartbeat')
    await esperar()
    expect(obter.mock.calls.length).toBeGreaterThan(antes)
    expect(rt.accessTokenValue).toBe('tok-2')
  })

  it('sem sessão, fala como anônimo (a anon key) — e tenta de novo depois', async () => {
    let atual: string | null = null
    const rt = criarClienteDoNavegador('https://exemplo.supabase.co', 'anon', async () => atual).realtime as Interno
    await esperar()
    expect(rt.accessTokenValue).toBe('anon')
    atual = 'tok-voltou'
    rt._setAuthSafely('heartbeat')
    await esperar()
    expect(rt.accessTokenValue).toBe('tok-voltou')
  })
})
