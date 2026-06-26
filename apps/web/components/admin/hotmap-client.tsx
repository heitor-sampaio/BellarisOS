'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import simpleheat from 'simpleheat'
import 'leaflet/dist/leaflet.css'

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

// ─── Gradients ───────────────────────────────────────────────────────────────

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

// ─── Components ──────────────────────────────────────────────────────────────

function HeatLayer({ points, gradient }: LayerConfig) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) return

    const size   = map.getSize()
    const canvas = L.DomUtil.create('canvas', 'leaflet-heatcanvas') as HTMLCanvasElement
    canvas.width  = size.x
    canvas.height = size.y
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none'
    map.getPanes().overlayPane.appendChild(canvas)

    const heat     = simpleheat(canvas)
    const maxCount = Math.max(...points.map(p => p.count), 1)
    heat.gradient(gradient).max(1)

    function redraw() {
      const s = map.getSize()
      canvas.width  = s.x
      canvas.height = s.y

      const topLeft = map.containerPointToLayerPoint([0, 0] as L.PointExpression)
      L.DomUtil.setPosition(canvas, topLeft)

      heat
        .data(
          points.map(p => {
            const pt = map.latLngToContainerPoint([p.lat, p.lng] as L.LatLngExpression)
            return [pt.x, pt.y, p.count / maxCount] as [number, number, number]
          }),
        )
        .radius(20, 12)
        .draw(0.05)
    }

    function animateZoom(e: L.ZoomAnimEvent) {
      const scale = map.getZoomScale(e.zoom)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m     = map as any
      const offset = m._getCenterOffset(e.center)._multiplyBy(-scale).subtract(m._getMapPanePos())
      L.DomUtil.setTransform(canvas, offset, scale)
    }

    redraw()
    map.on('moveend zoomend resize viewreset', redraw)
    if (map.options.zoomAnimation) {
      map.on('zoomanim', animateZoom as L.LeafletEventHandlerFn)
    }

    return () => {
      map.off('moveend zoomend resize viewreset', redraw)
      if (map.options.zoomAnimation) {
        map.off('zoomanim', animateZoom as L.LeafletEventHandlerFn)
      }
      canvas.remove()
    }
  }, [map, points, gradient])

  return null
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) { map.setView(points[0]!, 13); return }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48] })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

interface Props {
  branches: BranchPoint[]
  layers:   LayerConfig[]
}

export function HotmapClient({ branches, layers }: Props) {
  const allPoints: [number, number][] = [
    ...branches.map(b => [b.lat, b.lng] as [number, number]),
    ...layers.flatMap(l => l.points.map(p => [p.lat, p.lng] as [number, number])),
  ]

  const center: [number, number] = allPoints.length > 0
    ? [
        allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length,
        allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length,
      ]
    : [-14.235, -51.925]

  return (
    <MapContainer
      center={center}
      zoom={5}
      style={{ width: '100%', height: '100%' }}
      scrollWheelZoom={true}
      zoomControl
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />

      <FitBounds points={allPoints} />

      {layers.map((layer, i) => (
        <HeatLayer key={i} points={layer.points} gradient={layer.gradient} />
      ))}

      {branches.map(b => (
        <CircleMarker
          key={`branch-${b.id}`}
          center={[b.lat, b.lng]}
          radius={10}
          pathOptions={{
            fillColor:   '#c34d6b',
            fillOpacity: 1,
            color:       '#fff',
            weight:      2.5,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} permanent={branches.length <= 8}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#c34d6b' }}>
              ✦ {b.name}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
