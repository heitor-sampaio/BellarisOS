import { describe, it, expect, afterEach, vi } from 'vitest'
import { configDoSupabaseNoNavegador } from '@estetica-os/nucleo/lib/supabase/config-do-navegador'

/**
 * O navegador acha o endereço e a chave do Supabase mesmo quando o script do
 * layout raiz NÃO roda.
 *
 * A imagem do Docker é buildada sem as `NEXT_PUBLIC_*`, e o layout raiz as
 * entrega num `<script>` (`window.__SUPABASE_URL__`). Na rota inexistente dos
 * portais, o `notFound()` sai fora de qualquer Suspense (é o que dá o HTTP 404
 * — D18 de 2026-10-28) e o Next responde com a casca de erro
 * (`<html id="__next_error__">`): a página é desenhada pelo NAVEGADOR, a
 * partir do payload, e o React não executa script posto por
 * `dangerouslySetInnerHTML`. Sem a config, o sino e o Realtime do layout
 * davam "supabaseUrl is required" e a produção mostrava "Algo deu errado" no
 * lugar de "Página não encontrada" (visto em app.bellarisos.com, frente F).
 *
 * As `<meta>` o React cria também no desenho pelo navegador: são a reserva.
 */
const URL_ = 'https://exemplo.supabase.co'
const KEY = 'chave-publica'

function documentoCom(metas: Record<string, string>) {
  return {
    querySelector: (sel: string) => {
      const nome = /meta\[name="([^"]+)"\]/.exec(sel)?.[1]
      return nome && nome in metas ? { getAttribute: (a: string) => (a === 'content' ? metas[nome] : null) } : null
    },
  }
}

describe('configDoSupabaseNoNavegador', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('com o script do layout, usa o que ele pôs na janela', () => {
    vi.stubGlobal('window', { __SUPABASE_URL__: URL_, __SUPABASE_KEY__: KEY })
    vi.stubGlobal('document', documentoCom({}))
    expect(configDoSupabaseNoNavegador()).toEqual({ url: URL_, key: KEY })
  })

  it('sem o script (a casca de erro do 404) e sem NEXT_PUBLIC_*, lê as <meta> do layout', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', documentoCom({ 'bellaris-supabase-url': URL_, 'bellaris-supabase-key': KEY }))
    expect(configDoSupabaseNoNavegador()).toEqual({ url: URL_, key: KEY })
  })

  it('sem script nem <meta>, cai nas NEXT_PUBLIC_* (o next dev as embute)', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', KEY)
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', documentoCom({}))
    expect(configDoSupabaseNoNavegador()).toEqual({ url: URL_, key: KEY })
  })
})
