import { describe, expect, it } from 'vitest'
import { politicaDaClinica, resumoDoRelatorio } from '@/lib/seguranca/csp'

/**
 * O CSP da clínica (2026-10-08), por enquanto em REPORT-ONLY: avisa, não
 * bloqueia. A política é a que um dia vai bloquear — estrita como a dos
 * hosts da plataforma —, e os avisos dizem o que falta liberar.
 */
describe('politicaDaClinica', () => {
  const p = politicaDaClinica({ nonce: 'abc123', supabase: 'https://x.supabase.co', dev: false })
  it('script só com o nonce da requisição (e o que ele carregar)', () => {
    expect(p).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(p).not.toContain('unsafe-eval')
  })
  it('o Supabase nas conexões, inclusive o tempo real (wss)', () => {
    expect(p).toContain('connect-src')
    expect(p).toContain('https://x.supabase.co')
    expect(p).toContain('wss://x.supabase.co')
  })
  it('manda os avisos para a rota da clínica', () => {
    expect(p).toContain('report-uri /api/csp-relatorio')
  })
  it('sem moldura e sem plugin', () => {
    expect(p).toContain("frame-ancestors 'none'")
    expect(p).toContain("object-src 'none'")
  })
})

describe('resumoDoRelatorio', () => {
  it('o formato antigo (application/csp-report)', () => {
    expect(resumoDoRelatorio({ 'csp-report': {
      'document-uri': 'https://app.bellarisos.com/admin/inbox?x=1', 'violated-directive': 'script-src-elem',
      'effective-directive': 'script-src-elem', 'blocked-uri': 'https://connect.facebook.net/en_US/sdk.js',
    } })).toEqual([{ diretiva: 'script-src-elem', bloqueado: 'https://connect.facebook.net', pagina: '/admin/inbox' }])
  })
  it('o formato novo (application/reports+json), uma lista', () => {
    expect(resumoDoRelatorio([{ type: 'csp-violation', body: {
      documentURL: 'https://app.bellarisos.com/login', effectiveDirective: 'img-src', blockedURL: 'https://cdn.uazapi.com/a.jpg',
    } }])).toEqual([{ diretiva: 'img-src', bloqueado: 'https://cdn.uazapi.com', pagina: '/login' }])
  })
  it('o que não é relatório de CSP fica de fora', () => {
    expect(resumoDoRelatorio({ outra: 1 })).toEqual([])
    expect(resumoDoRelatorio([{ type: 'deprecation', body: {} }])).toEqual([])
  })
})
