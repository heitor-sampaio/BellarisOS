import { describe, it, expect } from 'vitest'
import { enquadramentoDoMapa, ondeGeocodificarAUnidade } from '@/components/admin/hotmap-types'

/**
 * D15 da 5ª simulação: com duas unidades na mesma cidade (Moinhos e Zona Sul,
 * Porto Alegre), o mapa do dashboard abria com zoom só na Zona Sul. A unidade
 * era localizada pela CIDADE — as duas caíam no mesmo ponto — e, com um ponto
 * só, o mapa dava `setView(…, 13)` nele. Agora a unidade é localizada pelo CEP
 * dela (a cidade só quando não há CEP), e o enquadramento cobre as unidades
 * (e as clientes); pontos todos no mesmo lugar centralizam sem estourar o zoom.
 */
describe('o mapa enquadra as unidades (D15)', () => {
  it('a unidade com CEP é localizada pelo CEP, não pela cidade', () => {
    expect(ondeGeocodificarAUnidade({ cep: '90570-020', cityKey: 'Porto Alegre, RS' })).toEqual({ cep: '90570020' })
    expect(ondeGeocodificarAUnidade({ cep: '', cityKey: 'Porto Alegre, RS' })).toEqual({ cidade: 'Porto Alegre, RS' })
    expect(ondeGeocodificarAUnidade({ cep: '123', cityKey: '' })).toEqual(null)
  })

  it('duas unidades em pontos diferentes: os limites cobrem as duas, mesmo com as clientes só numa', () => {
    const moinhos = { id: 'm', name: 'Moinhos', slug: 'm', lat: -30.025, lng: -51.2 }
    const zonaSul = { id: 'z', name: 'Zona Sul', slug: 'z', lat: -30.12, lng: -51.22 }
    const clientes = [{ points: [{ label: '1', lat: -30.121, lng: -51.221, count: 3 }], gradient: {} }]
    const e = enquadramentoDoMapa([moinhos, zonaSul], clientes)
    expect(e.tipo).toBe('limites')
    if (e.tipo !== 'limites') return
    expect(e.pontos).toEqual(expect.arrayContaining([[moinhos.lat, moinhos.lng], [zonaSul.lat, zonaSul.lng]]))
  })

  it('tudo no mesmo ponto: centraliza, sem fitBounds de tamanho zero (que vai ao zoom máximo)', () => {
    const p = { id: 'a', name: 'A', slug: 'a', lat: -30, lng: -51 }
    expect(enquadramentoDoMapa([p, { ...p, id: 'b' }], [])).toEqual({ tipo: 'centro', centro: [-30, -51], zoom: 13 })
    expect(enquadramentoDoMapa([], [])).toEqual({ tipo: 'nenhum' })
  })
})
