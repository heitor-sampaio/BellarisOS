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
