import { describe, it, expect } from 'vitest'
import { escolherEntrada, type FichaDeEntrada } from '@/lib/clientes/entrada'

const ficha = (id: string, o: Partial<FichaDeEntrada> = {}): FichaDeEntrada => ({
  clientId: id, slug: `unidade-${id}`, ligadaEm: '2026-10-01T10:00:00Z', ultimaEntradaEm: null, ...o,
})

describe('escolherEntrada — para onde a cliente vai depois do login', () => {
  it('sem ficha com unidade: nada', () => {
    expect(escolherEntrada([])).toBeNull()
    expect(escolherEntrada([ficha('a', { slug: null })])).toBeNull()
  })

  it('uma clínica só: direto para ela (como sempre foi)', () => {
    expect(escolherEntrada([ficha('a')])).toEqual({ tipo: 'portal', ficha: ficha('a') })
    expect(escolherEntrada([ficha('a'), ficha('b', { slug: null })])).toMatchObject({ tipo: 'portal', ficha: { clientId: 'a' } })
  })

  it('duas clínicas, nunca escolheu: o seletor', () => {
    expect(escolherEntrada([ficha('a'), ficha('b')])).toEqual({ tipo: 'seletor' })
  })

  it('já escolheu depois de a segunda ser ligada: a última que usou', () => {
    const fichas = [
      ficha('a', { ultimaEntradaEm: '2026-10-05T10:00:00Z' }),
      ficha('b', { ligadaEm: '2026-10-02T10:00:00Z', ultimaEntradaEm: '2026-10-06T10:00:00Z' }),
    ]
    expect(escolherEntrada(fichas)).toMatchObject({ tipo: 'portal', ficha: { clientId: 'b' } })
  })

  it('uma clínica NOVA foi ligada depois da última entrada: o seletor de novo, uma vez', () => {
    const fichas = [
      ficha('a', { ultimaEntradaEm: '2026-10-05T10:00:00Z' }),
      ficha('b', { ligadaEm: '2026-10-09T10:00:00Z' }),
    ]
    expect(escolherEntrada(fichas)).toEqual({ tipo: 'seletor' })
  })

  it('ficha antiga sem data de ligação conta como ligada desde sempre', () => {
    const fichas = [
      ficha('a', { ligadaEm: null, ultimaEntradaEm: '2026-10-05T10:00:00Z' }),
      ficha('b', { ligadaEm: null }),
    ]
    expect(escolherEntrada(fichas)).toMatchObject({ tipo: 'portal', ficha: { clientId: 'a' } })
  })
})
