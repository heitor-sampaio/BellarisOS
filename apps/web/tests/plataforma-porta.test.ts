import { describe, it, expect } from 'vitest'
import { ipPermitido, politicaDeConteudo } from '@estetica-os/nucleo/lib/plataforma/porta'

/**
 * A porta dos hosts da plataforma (sistema e suporte, 2026-10-06): a CSP
 * estrita e a lista de IPs opcional.
 */
describe('ipPermitido (PLATAFORMA_IPS)', () => {
  it('sem lista, todos passam (a lista é opcional)', () => {
    expect(ipPermitido('203.0.113.9', undefined)).toBe(true)
    expect(ipPermitido('203.0.113.9', '')).toBe(true)
    expect(ipPermitido(null, '  ')).toBe(true)
  })
  it('com lista, só quem está nela — e sem IP, ninguém', () => {
    const lista = '203.0.113.9, 198.51.100.7'
    expect(ipPermitido('203.0.113.9', lista)).toBe(true)
    expect(ipPermitido('198.51.100.7', lista)).toBe(true)
    expect(ipPermitido('203.0.113.10', lista)).toBe(false)
    expect(ipPermitido(null, lista)).toBe(false)
  })
})

describe('politicaDeConteudo', () => {
  const base = { nonce: 'abc123==', supabase: 'https://x.supabase.co', formulario: [] as string[], dev: false }
  it('script só com o nonce (e o que ele carregar); sem moldura; sem eval em produção', () => {
    const csp = politicaDeConteudo(base)
    expect(csp).toContain("script-src 'self' 'nonce-abc123==' 'strict-dynamic'")
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })
  it('fala com o Supabase (https e o Realtime em wss)', () => {
    const csp = politicaDeConteudo(base)
    expect(csp).toMatch(/connect-src 'self' https:\/\/x\.supabase\.co wss:\/\/x\.supabase\.co/)
  })
  it('o formulário só vai para onde se disser (o suporte manda o código à clínica)', () => {
    expect(politicaDeConteudo(base)).toContain("form-action 'self';")
    expect(politicaDeConteudo({ ...base, formulario: ['https://app.bellarisos.com'] })).toContain("form-action 'self' https://app.bellarisos.com;")
  })
  it('no next dev, o eval que o React usa para depurar', () => {
    expect(politicaDeConteudo({ ...base, dev: true })).toMatch(/script-src[^;]*'unsafe-eval'/)
  })
})
