import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ehNovaNaLista } from '@/lib/clientes/selo-novo'

/**
 * O selo "Novo" da lista de clientes (crm-inbox:IM-20 e IM-21). A ficha
 * importada com a "Última visita" de antes do sistema e sem "Cliente desde"
 * conta como cliente de antes (IM-21) — a lista a mostrava "Nova", porque os
 * dois layouts liam só `cliente_desde ?? created_at`. A régua é a do banco
 * ("Reativar clientes", o público das campanhas: `least(coalesce(cliente_desde,
 * created_at), ultima_visita_antes)`), numa função só para os dois portais.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const agora = new Date('2026-11-25T15:00:00Z')

describe('o selo "Novo" da lista de clientes', () => {
  it('a importada só com a última visita de antes não é nova (IM-21)', () => {
    expect(ehNovaNaLista({ cliente_desde: null, created_at: '2026-11-25T08:00:00Z', ultima_visita_antes: '2024-05-10' }, agora)).toBe(false)
  })
  it('a cadastrada hoje, sem nada de antes, é nova', () => {
    expect(ehNovaNaLista({ cliente_desde: null, created_at: '2026-11-25T08:00:00Z', ultima_visita_antes: null }, agora)).toBe(true)
  })
  it('"Cliente desde" de antes de um mês não é nova (IM-20)', () => {
    expect(ehNovaNaLista({ cliente_desde: '2021-03-12', created_at: '2026-11-25T08:00:00Z' }, agora)).toBe(false)
  })
  it('"Cliente desde" deste mês, sem visita de antes, é nova', () => {
    expect(ehNovaNaLista({ cliente_desde: '2026-11-10', created_at: '2026-11-25T08:00:00Z' }, agora)).toBe(true)
  })
  it('a cadastrada há mais de 30 dias não é nova', () => {
    expect(ehNovaNaLista({ cliente_desde: null, created_at: '2026-10-01T12:00:00Z' }, agora)).toBe(false)
  })
  it('os dois layouts usam a mesma função, e a lista lê a visita de antes', () => {
    for (const l of ['app/[slug]/clients/layout.tsx', 'app/admin/clients/layout.tsx']) {
      const t = fonte(l)
      expect(t, l).toContain('ehNovaNaLista(')
      expect(t, l).not.toMatch(/cliente_desde \?\? c\.created_at/)
    }
    expect(fonte('lib/cached-queries.ts')).toMatch(/select\('id, name, phone, tags, is_active, created_at, cliente_desde, ultima_visita_antes'\)/)
  })
})
