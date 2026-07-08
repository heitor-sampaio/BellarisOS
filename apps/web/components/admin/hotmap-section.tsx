'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { BranchPoint, HeatPoint } from './hotmap-types'
import { GRADIENT_CLIENTS, GRADIENT_LTV } from './hotmap-types'

const HotmapClient = dynamic(
  () => import('./hotmap-client').then(m => m.HotmapClient),
  {
    ssr: false,
    loading: () => (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fdf8f9', borderRadius: 'inherit',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando mapa…</span>
      </div>
    ),
  },
)

type HeatMode = 'clients' | 'ltv' | 'consolidated'

const MODES: { key: HeatMode; label: string }[] = [
  { key: 'clients',      label: 'Concentração' },
  { key: 'ltv',         label: 'LTV'           },
  { key: 'consolidated', label: 'Consolidado'  },
]

const LEGENDS: Record<HeatMode, Array<{ gradient: string; label: string }>> = {
  clients: [
    { gradient: 'linear-gradient(to right, #fde8ed, #c34d6b, #7a1e3d)', label: 'Densidade de clientes' },
  ],
  ltv: [
    { gradient: 'linear-gradient(to right, #fef9e7, #fbd462, #8a5c00)', label: 'LTV acumulado' },
  ],
  consolidated: [
    { gradient: 'linear-gradient(to right, #fde8ed, #c34d6b, #7a1e3d)', label: 'Clientes'   },
    { gradient: 'linear-gradient(to right, #fef9e7, #fbd462, #8a5c00)', label: 'LTV'         },
  ],
}

export interface RawBranch {
  id:   string
  name: string
  slug: string
  cityKey: string  // "[city], [state]" para geocoding
}

interface Props {
  rawBranches:   RawBranch[]
  rawCepCounts:  Record<string, number>   // cep (8 dígitos) → nº de clientes
  rawCepLtv:     Record<string, number>   // cep (8 dígitos) → LTV acumulado
}

export function HotmapSection({ rawBranches, rawCepCounts, rawCepLtv }: Props) {
  const [mode, setMode] = useState<HeatMode>('clients')
  const [branches,      setBranches]      = useState<BranchPoint[]>([])
  const [heatPoints,    setHeatPoints]    = useState<HeatPoint[]>([])
  const [heatLtvPoints, setHeatLtvPoints] = useState<HeatPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cities = [...new Set(rawBranches.map(b => b.cityKey).filter(Boolean))]
    const ceps   = Object.keys(rawCepCounts)

    if (cities.length === 0 && ceps.length === 0) { setLoading(false); return }

    fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cities, ceps }),
    })
      .then(r => r.json() as Promise<{
        cities: Record<string, { lat: number; lng: number } | null>
        ceps:   Record<string, { lat: number; lng: number } | null>
      }>)
      .then(({ cities: cityCoords, ceps: cepCoords }) => {
        const bpts = rawBranches
          .map(b => {
            const coords = cityCoords[b.cityKey]
            if (!coords) return null
            return { id: b.id, name: b.name, slug: b.slug, lat: coords.lat, lng: coords.lng }
          })
          .filter((b): b is BranchPoint => b !== null)

        const hpts = Object.entries(rawCepCounts)
          .map(([cep, count]) => {
            const coords = cepCoords[cep]
            if (!coords) return null
            return { label: cep, lat: coords.lat, lng: coords.lng, count }
          })
          .filter((p): p is HeatPoint => p !== null)

        const lpts = Object.entries(rawCepLtv)
          .map(([cep, ltv]) => {
            const coords = cepCoords[cep]
            if (!coords) return null
            return { label: cep, lat: coords.lat, lng: coords.lng, count: ltv }
          })
          .filter((p): p is HeatPoint => p !== null)

        setBranches(bpts)
        setHeatPoints(hpts)
        setHeatLtvPoints(lpts)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const layers =
    mode === 'clients'
      ? [{ points: heatPoints,    gradient: GRADIENT_CLIENTS }]
      : mode === 'ltv'
        ? [{ points: heatLtvPoints, gradient: GRADIENT_LTV }]
        : [
            { points: heatPoints,    gradient: GRADIENT_CLIENTS },
            { points: heatLtvPoints, gradient: GRADIENT_LTV     },
          ]

  const hasData = !loading && (branches.length > 0 || layers.some(l => l.points.length > 0))

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, color: 'var(--brand)' }}>✦</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Mapa de concentração
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* Mode toggle */}
          <div style={{
            display: 'flex', gap: 3,
            background: 'var(--surface-subtle, #f5eff1)',
            borderRadius: 8, padding: 3,
          }}>
            {MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none',
                  fontSize: 11, fontWeight: mode === m.key ? 700 : 500,
                  background:  mode === m.key ? 'var(--brand, #c34d6b)' : 'transparent',
                  color:       mode === m.key ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#c34d6b', border: '2px solid #fff', boxShadow: '0 0 0 1.5px #c34d6b' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Filial</span>
            </div>
            {LEGENDS[mode].map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 56, height: 8, borderRadius: 4, background: l.gradient }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Map */}
      {loading ? (
        <div style={{ height: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf8f9' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando mapa…</span>
        </div>
      ) : hasData ? (
        <div style={{ height: 480 }}>
          <HotmapClient branches={branches} layers={layers} />
        </div>
      ) : (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Cadastre endereços nas filiais e clientes para visualizar o mapa.
          </p>
        </div>
      )}
    </div>
  )
}
