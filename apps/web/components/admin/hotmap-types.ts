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

/** O marcador de uma unidade no mapa: onde fica e de que lado vai o nome. */
export interface MarcadorDaUnidade extends BranchPoint {
  direcao: 'top' | 'bottom' | 'right' | 'left'
  /** Saiu um pouco do ponto (estava em cima de outra unidade): o lugar é aproximado. */
  aproximado: boolean
}

const MESMO_PONTO = 0.0015 // ~150 m: um marcador cobre o outro
const PERTO       = 0.03   // ~3 km: os nomes se encostam no zoom da cidade
const AFASTAMENTO = 0.004  // ~400 m: o bastante para ver os dois

/**
 * Os marcadores das unidades sem um esconder o outro (A19 da 8ª simulação,
 * 2026-11-06: no mapa da rede, a Água Verde ficava atrás do Batel — a unidade
 * sem CEP é localizada pela cidade, e as duas caíam no mesmo ponto). As que
 * estão no mesmo ponto se afastam um pouco, em volta dele (e ficam marcadas
 * como aproximadas); as que estão perto mantêm o lugar, e os nomes vão para
 * lados diferentes. Puro: o mapa só desenha.
 */
export function marcadoresDasUnidades(branches: BranchPoint[]): MarcadorDaUnidade[] {
  const grupos: number[][] = []
  branches.forEach((b, i) => {
    const g = grupos.find(gr => gr.some(j => Math.abs(branches[j]!.lat - b.lat) < MESMO_PONTO && Math.abs(branches[j]!.lng - b.lng) < MESMO_PONTO))
    if (g) g.push(i); else grupos.push([i])
  })
  const marcadores: MarcadorDaUnidade[] = branches.map(b => ({ ...b, direcao: 'top', aproximado: false }))
  for (const g of grupos) {
    if (g.length < 2) continue
    const lat = g.reduce((s, i) => s + branches[i]!.lat, 0) / g.length
    const lng = g.reduce((s, i) => s + branches[i]!.lng, 0) / g.length
    g.forEach((i, k) => {
      const angulo = Math.PI / 2 + (2 * Math.PI * k) / g.length
      marcadores[i] = { ...marcadores[i]!, lat: lat + AFASTAMENTO * Math.sin(angulo), lng: lng + AFASTAMENTO * Math.cos(angulo), aproximado: true }
    })
  }
  const lados: MarcadorDaUnidade['direcao'][] = ['top', 'bottom', 'right', 'left']
  marcadores.forEach((m, i) => {
    const vizinhos = marcadores.slice(0, i).filter(o => Math.abs(o.lat - m.lat) < PERTO && Math.abs(o.lng - m.lng) < PERTO)
    const usados = new Set(vizinhos.map(o => o.direcao))
    m.direcao = lados.find(l => !usados.has(l)) ?? 'top'
  })
  return marcadores
}
