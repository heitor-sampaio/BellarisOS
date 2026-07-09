'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, ImageOff } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { CampaignDetail, AdSet, Ad, AgeBreakdown, PlacementBreakdown, DailyInsight } from '@/lib/ads/types'

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:   'var(--success)',
  PAUSED:   'var(--warning, #d97706)',
  ARCHIVED: 'var(--text-muted)',
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo', PAUSED: 'Pausado', ARCHIVED: 'Arquivado',
}

const COUNTRY_NAMES: Record<string, string> = {
  BR: 'Brasil', US: 'EUA', AR: 'Argentina', CL: 'Chile', CO: 'Colômbia',
  MX: 'México', PT: 'Portugal', ES: 'Espanha', FR: 'França', DE: 'Alemanha',
  GB: 'Reino Unido', IT: 'Itália', AU: 'Austrália', CA: 'Canadá', JP: 'Japão',
  UY: 'Uruguai', PY: 'Paraguai', PE: 'Peru', BO: 'Bolívia', EC: 'Equador',
}

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtPct(v: number) { return v.toFixed(2).replace('.', ',') + '%' }
function fmtNum(v: number) { return v.toLocaleString('pt-BR') }

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
      {children}{count != null && ` (${count})`}
    </p>
  )
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff' }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: 'var(--tracking-tight)' }}>{value}</span>
    </div>
  )
}

function AdCard({ ad, ageBreakdowns, placements }: { ad: Ad; ageBreakdowns: AgeBreakdown[]; placements: PlacementBreakdown[] }) {
  const [open, setOpen] = useState(false)
  const hasBreakdowns = ageBreakdowns.length > 0 || placements.length > 0
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      {ad.creative.imageUrl || ad.creative.thumbnailUrl ? (
        <img
          src={ad.creative.imageUrl ?? ad.creative.thumbnailUrl}
          alt={ad.creative.title ?? ad.name}
          style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: 80, background: 'var(--surface-raised, #f5f5f4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ImageOff size={20} style={{ color: 'var(--text-muted)' }} />
        </div>
      )}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.name}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: STATUS_COLOR[ad.status] ?? 'var(--text-muted)', flexShrink: 0 }}>{STATUS_LABEL[ad.status] ?? ad.status}</span>
        </div>
        {ad.creative.title && (
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.creative.title}</p>
        )}
        {ad.creative.callToAction && (
          <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 99, background: '#1877F215', color: '#1877F2', fontWeight: 700, alignSelf: 'flex-start' }}>
            {ad.creative.callToAction.replace(/_/g, ' ')}
          </span>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 2 }}>
          {([
            ['Gasto',   fmtBRL(ad.insights.spend)],
            ['Cliques', fmtNum(ad.insights.linkClicks)],
            ['CTR',     fmtPct(ad.insights.ctr)],
          ] as [string, string][]).map(([l, v]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{v}</span>
            </div>
          ))}
        </div>

        {hasBreakdowns && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 600, alignSelf: 'flex-start' }}
          >
            {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {open ? 'Ocultar' : 'Ver segmentação'}
          </button>
        )}

        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
            {ageBreakdowns.length > 0 && (
              <div>
                <p style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Idade</p>
                <AgeMini breakdowns={ageBreakdowns} />
              </div>
            )}
            {placements.length > 0 && (
              <div>
                <p style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Posicionamentos</p>
                <PlacementMini placements={placements} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AdSetRow({
  s, ads, ageBreakdowns, placements, adAgeMap, adPosMap,
}: {
  s: AdSet; ads: Ad[]
  ageBreakdowns: AgeBreakdown[]; placements: PlacementBreakdown[]
  adAgeMap: Record<string, AgeBreakdown[]>; adPosMap: Record<string, PlacementBreakdown[]>
}) {
  const [open, setOpen] = useState(false)
  const budget  = s.dailyBudget ? `R$ ${s.dailyBudget.toFixed(2)}/dia` : s.lifetimeBudget ? `R$ ${s.lifetimeBudget.toFixed(2)} total` : null
  const genders = s.targeting.genders?.map(g => g === 1 ? 'Masc.' : 'Fem.').join(' + ') ?? 'Todos'
  const age     = s.targeting.ageMin || s.targeting.ageMax ? `${s.targeting.ageMin ?? 18}–${s.targeting.ageMax ?? 65}` : 'Todas idades'

  const tags = [
    budget && `Orçamento: ${budget}`,
    `Idade: ${age}`,
    `Gênero: ${genders}`,
    ...(s.targeting.geoLocations?.slice(0, 4) ?? []),
    ...(s.targeting.interests?.slice(0, 4) ?? []),
  ].filter(Boolean) as string[]

  const totalAgeSpend = ageBreakdowns.reduce((sum, a) => sum + a.spend, 0)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: STATUS_COLOR[s.status] ?? 'var(--text-muted)' }} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, marginLeft: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>{fmtBRL(s.insights.spend)}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtNum(s.insights.impressions)} imp.</span>
          {ads.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-raised, #f5f5f4)', border: '1px solid var(--border)', borderRadius: 99, padding: '1px 7px' }}>
              {ads.length} {ads.length === 1 ? 'anúncio' : 'anúncios'}
            </span>
          )}
          {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--hairline)', background: 'var(--surface-raised, #fafaf9)' }}>
          {/* Métricas do conjunto */}
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(() => {
              const freq = s.insights.reach != null && s.insights.reach > 0
                ? s.insights.impressions / s.insights.reach : null
              return (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${freq != null ? 7 : 6}, 1fr)`, gap: 8 }}>
                  <MetricMini label="Gasto"      value={fmtBRL(s.insights.spend)} />
                  <MetricMini label="Impressões" value={fmtNum(s.insights.impressions)} />
                  <MetricMini label="CPM"        value={fmtBRL(s.insights.cpm)} />
                  <MetricMini label="Cliques"    value={fmtNum(s.insights.linkClicks)} />
                  <MetricMini label="CTR"        value={fmtPct(s.insights.ctr)} />
                  <MetricMini label="CPC"        value={fmtBRL(s.insights.cpc)} />
                  {freq != null && (
                    <div style={{ padding: '8px 12px', borderRadius: 7, border: `1px solid ${freq > 3 ? '#fcd34d' : 'var(--border)'}`, background: freq > 3 ? '#fef9c3' : '#fff' }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 }}>Frequência</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: freq > 3 ? '#92400e' : 'var(--text)', letterSpacing: 'var(--tracking-tight)' }}>{freq.toFixed(2).replace('.', ',')}</span>
                      {freq > 3 && <span style={{ display: 'block', fontSize: 9, fontWeight: 600, color: '#92400e', marginTop: 2 }}>Saturando</span>}
                    </div>
                  )}
                </div>
              )
            })()}

            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tags.map((tag, i) => (
                  <span key={i} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 99, background: 'var(--brand-pale, #fdf2f5)', color: 'var(--brand)', fontWeight: 600, border: '1px solid var(--brand-light, #f0c0cc)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Segmentação: idade + posicionamentos lado a lado */}
          {(ageBreakdowns.length > 0 || placements.length > 0) && (
            <div style={{ borderTop: '1px solid var(--hairline)', padding: '14px 16px', display: 'grid', gridTemplateColumns: ageBreakdowns.length > 0 && placements.length > 0 ? '1fr 1fr' : '1fr', gap: 24 }}>
              {ageBreakdowns.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Segmentação por idade</p>
                  <DonutChart data={ageBreakdowns} totalSpend={totalAgeSpend} />
                </div>
              )}
              {placements.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Posicionamentos</p>
                  <PlacementList placements={placements} />
                </div>
              )}
            </div>
          )}

          {/* Criativos do conjunto */}
          {ads.length > 0 && (
            <div style={{ borderTop: '1px solid var(--hairline)', padding: '14px 16px' }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Criativos ({ads.length})
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {ads.map(ad => (
                  <AdCard
                    key={ad.id}
                    ad={ad}
                    ageBreakdowns={adAgeMap[ad.id] ?? []}
                    placements={adPosMap[ad.id] ?? []}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const AGE_COLORS = [
  '#c34d6b', // brand rosé
  '#e07a94', // rosé claro
  '#9b2e4a', // rosé escuro
  '#f3a4b8', // rosé pálido
  '#6b7280', // cinza neutro
  '#374151', // cinza escuro
  '#d1d5db', // cinza claro
  '#a78bfa', // lavanda
]

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function buildArc(cx: number, cy: number, r: number, ir: number, startDeg: number, endDeg: number): string {
  const sweep = endDeg - startDeg
  if (sweep >= 359.99) {
    // Full circle: two semicircles
    const t = polarToXY(cx, cy, r, startDeg)
    const b = polarToXY(cx, cy, r, startDeg + 180)
    const ti = polarToXY(cx, cy, ir, startDeg)
    const bi = polarToXY(cx, cy, ir, startDeg + 180)
    return [
      `M ${t.x} ${t.y}`,
      `A ${r} ${r} 0 1 1 ${b.x} ${b.y}`,
      `A ${r} ${r} 0 1 1 ${t.x} ${t.y}`,
      `M ${ti.x} ${ti.y}`,
      `A ${ir} ${ir} 0 1 0 ${bi.x} ${bi.y}`,
      `A ${ir} ${ir} 0 1 0 ${ti.x} ${ti.y}`,
      'Z',
    ].join(' ')
  }
  const p1  = polarToXY(cx, cy, r,  startDeg)
  const p2  = polarToXY(cx, cy, r,  endDeg)
  const ip1 = polarToXY(cx, cy, ir, startDeg)
  const ip2 = polarToXY(cx, cy, ir, endDeg)
  const large = sweep > 180 ? 1 : 0
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${ip2.x} ${ip2.y}`,
    `A ${ir} ${ir} 0 ${large} 0 ${ip1.x} ${ip1.y}`,
    'Z',
  ].join(' ')
}

function DonutChart({ data, totalSpend }: { data: { age: string; spend: number }[]; totalSpend: number }) {
  const cx = 70; const cy = 70; const r = 58; const ir = 36
  let angle = 0
  const slices = data.map((d, i) => {
    const pct   = totalSpend > 0 ? d.spend / totalSpend : 0
    const sweep = pct * 360
    const path  = buildArc(cx, cy, r, ir, angle, angle + sweep)
    const mid   = polarToXY(cx, cy, (r + ir) / 2, angle + sweep / 2)
    angle += sweep
    return { ...d, pct, path, mid, color: AGE_COLORS[i % AGE_COLORS.length] }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} />
        ))}
        {/* Hole label */}
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--text-muted)" style={{ fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Gasto
        </text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--text)" style={{ fontFamily: 'inherit' }}>
          {data.length}
        </text>
        <text x={cx} y={cy + 20} textAnchor="middle" fontSize={8.5} fill="var(--text-muted)" style={{ fontFamily: 'inherit' }}>
          faixas
        </text>
      </svg>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 52 }}>{s.age}</span>
            <div style={{ flex: 1, height: 4, background: 'var(--hairline, #e8e5e0)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(3, s.pct * 100)}%`, background: s.color, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', minWidth: 34, textAlign: 'right' }}>
              {(s.pct * 100).toFixed(1).replace('.', ',')}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const PLATFORM_COLORS: Record<string, string> = {
  facebook:         '#1877F2',
  instagram:        '#E1306C',
  audience_network: '#4CAF50',
  messenger:        '#00B2FF',
}
const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram',
  audience_network: 'Audience Network', messenger: 'Messenger',
}
const POSITION_NAMES: Record<string, string> = {
  feed: 'Feed', right_hand_column: 'Coluna direita', story: 'Stories',
  reels: 'Reels', instant_article: 'Instant Articles', marketplace: 'Marketplace',
  search: 'Busca', explore: 'Explorar', video_feeds: 'Vídeos',
  instream_video: 'Vídeo in-stream', an_classic: 'AN Classic', rewarded_video: 'Vídeo premiado',
}

function placementLabel(p: PlacementBreakdown) {
  return `${PLATFORM_NAMES[p.platform] ?? p.platform} · ${POSITION_NAMES[p.position] ?? p.position}`
}

function PlacementList({ placements }: { placements: PlacementBreakdown[] }) {
  const total = placements.reduce((s, p) => s + p.spend, 0)
  const max   = Math.max(...placements.map(p => p.spend), 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {placements.map((p, i) => {
        const color = PLATFORM_COLORS[p.platform] ?? '#6b7280'
        const barW  = max > 0 ? Math.max(3, (p.spend / max) * 100) : 0
        const pct   = total > 0 ? (p.spend / total) * 100 : 0
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)', minWidth: 148, flexShrink: 0 }}>{placementLabel(p)}</span>
            <div style={{ flex: 1, background: 'var(--hairline, #e8e5e0)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${barW}%`, background: color, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--text)', fontWeight: 700, minWidth: 68, textAlign: 'right', flexShrink: 0 }}>{fmtBRL(p.spend)}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 34, textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(1).replace('.', ',')}%</span>
          </div>
        )
      })}
    </div>
  )
}

function AgeMini({ breakdowns }: { breakdowns: AgeBreakdown[] }) {
  const total = breakdowns.reduce((s, a) => s + a.spend, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {breakdowns.slice(0, 4).map((a, i) => {
        const pct   = total > 0 ? (a.spend / total) * 100 : 0
        const color = AGE_COLORS[i % AGE_COLORS.length]
        return (
          <div key={a.age} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text)', minWidth: 36 }}>{a.age}</span>
            <div style={{ flex: 1, background: 'var(--hairline, #e8e5e0)', borderRadius: 2, height: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(3, pct)}%`, background: color, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, minWidth: 28, textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(0)}%</span>
          </div>
        )
      })}
    </div>
  )
}

function PlacementMini({ placements }: { placements: PlacementBreakdown[] }) {
  const total = placements.reduce((s, p) => s + p.spend, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {placements.slice(0, 3).map((p, i) => {
        const color = PLATFORM_COLORS[p.platform] ?? '#6b7280'
        const pct   = total > 0 ? (p.spend / total) * 100 : 0
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{placementLabel(p)}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, minWidth: 24, textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(0)}%</span>
          </div>
        )
      })}
    </div>
  )
}

function BreakdownBar({ label, spend, maxSpend, totalSpend }: { label: string; spend: number; maxSpend: number; totalSpend: number }) {
  const barWidth = maxSpend > 0 ? Math.max(3, (spend / maxSpend) * 100) : 0
  const pct      = totalSpend > 0 ? ((spend / totalSpend) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', minWidth: 80, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, background: 'var(--hairline, #e8e5e0)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${barWidth}%`, background: 'var(--brand)', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, minWidth: 72, textAlign: 'right', flexShrink: 0 }}>{fmtBRL(spend)}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 38, textAlign: 'right', flexShrink: 0 }}>{fmtPct(pct)}</span>
    </div>
  )
}

type TrendMetric = 'spend' | 'conversions' | 'roi'

const TREND_METRICS: { key: TrendMetric; label: string; fmt: (v: number) => string; color: string }[] = [
  { key: 'spend',       label: 'Gasto',       fmt: v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), color: 'var(--brand)' },
  { key: 'conversions', label: 'Conversões',  fmt: v => v.toLocaleString('pt-BR'),                                          color: '#2563eb' },
  { key: 'roi',         label: 'ROI',         fmt: v => (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%',         color: '#16a34a' },
]

function TrendChart({ daily }: { daily: DailyInsight[] }) {
  const [metric, setMetric] = useState<TrendMetric>('spend')

  const cfg = TREND_METRICS.find(m => m.key === metric)!

  const chartData = daily.map(d => ({
    date: d.date,
    value: metric === 'spend'
      ? d.spend
      : metric === 'conversions'
      ? (d.conversions ?? null)
      : (d.roi ?? null),
  }))

  const hasData = chartData.some(p => p.value != null)

  if (!hasData) {
    return (
      <div className="card">
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Tendência</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Dados insuficientes para o período selecionado.</p>
      </div>
    )
  }

  function yFmt(v: number): string {
    if (metric === 'spend') {
      if (v >= 1000) return `${(v / 1000).toFixed(1).replace('.', ',')}k`
      return `${v.toFixed(0)}`
    }
    if (metric === 'roi') return v.toFixed(0) + '%'
    return v.toFixed(0)
  }

  function xFmt(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Tendência diária</p>
        <div className="seg-bar" style={{ display: 'flex', gap: 3, background: 'var(--surface-raised, #fafaf9)', borderRadius: 7, padding: 3, border: '1px solid var(--border)' }}>
          {TREND_METRICS.map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={metric === m.key ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={cfg.color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline, #e8e5e0)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={xFmt}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={yFmt}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
            labelFormatter={(label: unknown) => xFmt(String(label))}
            formatter={(value: unknown) => {
              if (typeof value === 'number') return [cfg.fmt(value), cfg.label]
              return [String(value ?? ''), cfg.label]
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={cfg.color}
            strokeWidth={2}
            fill={`url(#grad-${metric})`}
            dot={{ r: 3, fill: cfg.color, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: cfg.color, stroke: '#fff', strokeWidth: 2 }}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CampaignDetailContent({ data }: { data: CampaignDetail }) {
  const { adSets, ads, ageBreakdowns, geoBreakdowns } = data
  const adSetAgeMap = data.adSetAgeBreakdowns
  const adSetPosMap = data.adSetPlacementBreakdowns
  const adAgeMap    = data.adAgeBreakdowns
  const adPosMap    = data.adPlacementBreakdowns

  // Group ads by adset
  const adsByAdset = ads.reduce<Record<string, Ad[]>>((acc, ad) => {
    const key = ad.adsetId ?? '__unlinked__'
    acc[key] = [...(acc[key] ?? []), ad]
    return acc
  }, {})

  const unlinkedAds = adsByAdset['__unlinked__'] ?? []

  const maxGeoSpend   = Math.max(...geoBreakdowns.map(g => g.spend), 0)
  const totalAgeSpend = ageBreakdowns.reduce((s, a) => s + a.spend, 0)
  const totalGeoSpend = geoBreakdowns.reduce((s, g) => s + g.spend, 0)

  const hasSegmentation = ageBreakdowns.length > 0 || geoBreakdowns.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Gráfico de tendência temporal */}
      {data.dailyInsights.length > 1 && <TrendChart daily={data.dailyInsights} />}

      <div className="split-aside" style={hasSegmentation ? undefined : { gridTemplateColumns: '1fr' }}>
        {/* Ad Sets com criativos aninhados */}
        {adSets.length > 0 && (
          <div className="card">
            <SectionTitle count={adSets.length}>Conjuntos de anúncios</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {adSets.map(s => (
                <AdSetRow
                  key={s.id}
                  s={s}
                  ads={adsByAdset[s.id] ?? []}
                  ageBreakdowns={adSetAgeMap[s.id] ?? []}
                  placements={adSetPosMap[s.id] ?? []}
                  adAgeMap={adAgeMap}
                  adPosMap={adPosMap}
                />
              ))}
            </div>
          </div>
        )}

        {/* Segmentation */}
        {hasSegmentation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ageBreakdowns.length > 0 && (
              <div className="card">
                <SectionTitle>Segmentação por idade</SectionTitle>
                <DonutChart data={ageBreakdowns} totalSpend={totalAgeSpend} />
              </div>
            )}

            {geoBreakdowns.length > 0 && (
              <div className="card">
                <SectionTitle>Segmentação por país</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {geoBreakdowns.slice(0, 12).map(row => (
                    <BreakdownBar
                      key={row.country}
                      label={COUNTRY_NAMES[row.country] ?? row.country}
                      spend={row.spend}
                      maxSpend={maxGeoSpend}
                      totalSpend={totalGeoSpend}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Anúncios sem conjunto associado (fallback) */}
      {unlinkedAds.length > 0 && (
        <div className="card">
          <SectionTitle count={unlinkedAds.length}>Anúncios</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {unlinkedAds.map(ad => (
              <AdCard
                key={ad.id}
                ad={ad}
                ageBreakdowns={adAgeMap[ad.id] ?? []}
                placements={adPosMap[ad.id] ?? []}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
