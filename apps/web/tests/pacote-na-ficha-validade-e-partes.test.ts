import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pacoteDaFicha, partesDoPacote } from '@/lib/clientes/pacotes-da-ficha'

/**
 * A1 da 37ª (PA-07, PA-11, princípio 3): o cartão do pacote na ficha não dizia
 * a validade nem a parte de cada sessão no rateio ("R$ 124,90 × 3 · R$ 195,15
 * × 2"); o do pré-pago diz o valor e o "vale até". Vale para o pacote de antes.
 */
const sp = (t: string | null | undefined) => t == null ? t : t.replace(/\s/g, ' ')
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const sessoes = (...precos: (number | null)[]) => precos.map(preco => ({ status: 'AVAILABLE', appointment_id: null, preco }))
const pacote = (extra: Record<string, unknown> = {}) => ({
  id: 'a', total_sessions: 5, used_sessions: 0, expires_at: '2026-12-29T15:00:00Z', cancelado_em: null,
  service_packages: { name: 'Combo', procedure_id: 'proc', price: 765, procedures: { name: 'Drenagem', duration_min: 50 } },
  package_sessions: sessoes(124.9, 124.9, 195.15, 124.9, 195.15), ...extra,
})

describe('o cartão do pacote na ficha: a validade e a parte de cada sessão', () => {
  it('as partes, agrupadas pelo valor, na ordem em que aparecem', () => {
    expect(sp(partesDoPacote(sessoes(124.9, 124.9, 195.15, 124.9, 195.15), 5, 765))).toBe('R$ 124,90 × 3 · R$ 195,15 × 2')
    expect(sp(partesDoPacote(sessoes(130, 130), 2, 260))).toBe('R$ 130,00 × 2')
  })
  it('o pacote de antes do rateio: o valor ÷ as sessões', () => {
    expect(sp(partesDoPacote(sessoes(null, null, null, null), 4, 400))).toBe('R$ 100,00 × 4')
  })
  it('o pacote de antes sem valor de referência: sem partes', () => {
    expect(partesDoPacote(sessoes(null, null), 2, null)).toBeNull()
  })
  it('o cartão leva as partes e a validade', () => {
    const c = pacoteDaFicha(pacote())
    expect(sp(c.partes)).toBe('R$ 124,90 × 3 · R$ 195,15 × 2')
    expect(c.venceEm).toBe('2026-12-29T15:00:00Z')
    const deFora = pacoteDaFicha(pacote({ de_fora: true, valor_referencia: null, package_sessions: sessoes(null, null, null, null, null) }))
    expect(deFora).toMatchObject({ partes: null, venceEm: '2026-12-29T15:00:00Z' })
  })
  it('as duas fichas leem o preço das sessões, e o cartão mostra a linha', () => {
    expect(fonte('lib/cached-queries.ts')).toMatch(/package_sessions\(status, appointment_id, preco\)/)
    expect(fonte('app/admin/clients/[id]/page.tsx')).toMatch(/package_sessions\(status, appointment_id, preco\)/)
    expect(fonte('components/branch/client-profile.tsx')).toMatch(/data-partes-do-pacote/)
    expect(fonte('components/branch/client-profile.tsx')).toMatch(/`vale até \$\{formatDia\(dayKeyTZ\(new Date\(pacote\.venceEm\), fuso\)\)\}`/)
  })
})
