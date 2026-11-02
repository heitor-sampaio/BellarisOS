export interface BranchPoint {
  id:   string
  name: string
  slug: string
  lat:  number
  lng:  number
}

export interface HeatPoint {
  label: string
  lat:   number
  lng:   number
  count: number
}

export interface LayerConfig {
  points:   HeatPoint[]
  gradient: Record<string, string>
}

export const GRADIENT_CLIENTS: Record<string, string> = {
  '0.0': '#fde8ed',
  '0.3': '#e8849a',
  '0.6': '#c34d6b',
  '1.0': '#7a1e3d',
}

export const GRADIENT_LTV: Record<string, string> = {
  '0.0': '#fef9e7',
  '0.3': '#fbd462',
  '0.6': '#e09800',
  '1.0': '#8a5c00',
}

/**
 * Onde localizar a unidade (D15 da 5ª simulação): pelo CEP dela, quando tem
 * (8 dígitos); senão, pela cidade. Pela cidade, duas unidades de Porto Alegre
 * caíam no mesmo ponto, e o mapa enquadrava uma só.
 */
export function ondeGeocodificarAUnidade(b: { cep?: string | null; cityKey: string }): { cep: string } | { cidade: string } | null {
  const cep = (b.cep ?? '').replace(/\D/g, '')
  if (cep.length === 8) return { cep }
  return b.cityKey ? { cidade: b.cityKey } : null
}

/**
 * Como o mapa abre (D15): os limites das UNIDADES e das clientes; com todos
 * os pontos no mesmo lugar, o centro com zoom de bairro — `fitBounds` de
 * tamanho zero iria ao zoom máximo.
 */
export function enquadramentoDoMapa(branches: BranchPoint[], layers: LayerConfig[]):
  { tipo: 'nenhum' } | { tipo: 'centro'; centro: [number, number]; zoom: number } | { tipo: 'limites'; pontos: [number, number][] } {
  const pontos: [number, number][] = [
    ...branches.map(b => [b.lat, b.lng] as [number, number]),
    ...layers.flatMap(l => l.points.map(p => [p.lat, p.lng] as [number, number])),
  ]
  if (pontos.length === 0) return { tipo: 'nenhum' }
  const [a] = pontos as [[number, number]]
  const todosNoMesmo = pontos.every(p => Math.abs(p[0] - a[0]) < 1e-6 && Math.abs(p[1] - a[1]) < 1e-6)
  if (todosNoMesmo) return { tipo: 'centro', centro: a, zoom: 13 }
  return { tipo: 'limites', pontos }
}
