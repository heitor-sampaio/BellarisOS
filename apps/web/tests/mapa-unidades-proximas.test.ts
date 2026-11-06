import { describe, it, expect } from 'vitest'
import { marcadoresDasUnidades } from '@/components/admin/hotmap-types'

/**
 * A19 da 8ª simulação (2026-11-06): no mapa da rede, o marcador da Água Verde
 * ficava escondido atrás do do Batel — dois pontos quase no mesmo lugar (a
 * unidade sem CEP é localizada pela cidade). Os marcadores que se encostam
 * se afastam um pouco, e os nomes vão para lados diferentes.
 */
describe('os marcadores das unidades não se escondem (A19)', () => {
  const batel = { id: 'b', name: 'Batel', slug: 'b', lat: -25.44, lng: -49.29 }
  const agua = { id: 'a', name: 'Água Verde', slug: 'a', lat: -25.44, lng: -49.29 }
  const longe = { id: 'l', name: 'Londrina', slug: 'l', lat: -23.3, lng: -51.16 }

  it('no mesmo ponto: os dois se afastam, e os nomes ficam em lados diferentes', () => {
    const [m1, m2] = marcadoresDasUnidades([batel, agua])
    expect(Math.hypot(m1!.lat - m2!.lat, m1!.lng - m2!.lng)).toBeGreaterThan(0.003)
    expect(m1!.direcao).not.toBe(m2!.direcao)
    expect(m1!.aproximado && m2!.aproximado).toBe(true)
  })

  it('quem está longe fica onde está, com o nome em cima', () => {
    const [b, l] = marcadoresDasUnidades([batel, longe])
    expect([b!.lat, b!.lng]).toEqual([batel.lat, batel.lng])
    expect([l!.lat, l!.lng]).toEqual([longe.lat, longe.lng])
    expect([b!.direcao, l!.direcao]).toEqual(['top', 'top'])
    expect(b!.aproximado).toBe(false)
  })

  it('perto, mas não no mesmo ponto: ficam onde estão, com os nomes em lados diferentes', () => {
    const [b, a] = marcadoresDasUnidades([batel, { ...agua, lat: -25.452, lng: -49.283 }])
    expect([b!.lat, a!.lat]).toEqual([batel.lat, -25.452])
    expect(b!.direcao).not.toBe(a!.direcao)
  })
})
