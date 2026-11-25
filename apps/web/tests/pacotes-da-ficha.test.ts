import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pacotesEmAndamento, pacoteDaFicha } from '@/lib/clientes/pacotes-da-ficha'

/**
 * D17 da 28ª: a ficha com DOIS pacotes iguais ("5 drenagens", os dois pagos)
 * mostrava um só — o primeiro em andamento. Princípio 3: o que a tela mostra é
 * o que vale; cada pacote em andamento é um cartão.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const pacote = (id: string, extra: Record<string, unknown> = {}) => ({
  id, total_sessions: 5, used_sessions: 0, expires_at: null, cancelado_em: null,
  service_packages: { name: '5 drenagens', procedure_id: 'proc', price: 650, procedures: { name: 'Drenagem', duration_min: 50 } },
  package_sessions: [], ...extra,
})

describe('os pacotes em andamento da ficha', () => {
  const agora = new Date('2026-11-25T12:00:00Z')
  it('dois pacotes iguais em andamento: os dois', () => {
    const r = pacotesEmAndamento([pacote('a', { used_sessions: 1 }), pacote('b')], agora)
    expect(r.map(p => p.id)).toEqual(['a', 'b'])
  })
  it('fora: o cancelado, o esgotado e o vencido', () => {
    const r = pacotesEmAndamento([
      pacote('cancelado', { cancelado_em: '2026-11-01T00:00:00Z' }),
      pacote('esgotado', { used_sessions: 5 }),
      pacote('vencido', { expires_at: '2026-11-01T00:00:00Z' }),
      pacote('vale'),
    ], agora)
    expect(r.map(p => p.id)).toEqual(['vale'])
  })
  it('o cartão de cada um: nome, sessões e o valor por sessão', () => {
    const c = pacoteDaFicha(pacote('a', { used_sessions: 1 }))
    expect(c).toMatchObject({ id: 'a', name: '5 drenagens', totalSessions: 5, usedSessions: 1, procedureName: 'Drenagem', price: 130, durationMin: 50 })
  })
  it('as duas fichas passam TODOS os pacotes em andamento, e a ficha desenha um cartão por pacote', () => {
    for (const arq of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      const f = fonte(arq)
      expect(f, arq).toMatch(/pacotesEmAndamento\(pkgsArray[^,]*, now\)/)
      expect(f, arq).toContain('outrosPacotes={outrosPacotes}')
    }
    const p = fonte('components/branch/client-profile.tsx')
    expect(p).toMatch(/pacotesNaFicha\.map\(pacote =>/)
  })
})
