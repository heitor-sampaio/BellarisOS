'use client'

import { useEffect, useState } from 'react'
import { X, ChevronDown, ChevronUp, ImageOff } from 'lucide-react'
import { getCampaignDetail } from '@/actions/meta-campaign'
import type { Campaign, CampaignDetail, AdSet, Ad } from '@/lib/ads/types'

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtPct(v: number) {
  return v.toFixed(2).replace('.', ',') + '%'
}
function fmtNum(v: number) {
  return v.toLocaleString('pt-BR')
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:   'var(--success)',
  PAUSED:   'var(--warning, #d97706)',
  ARCHIVED: 'var(--text-muted)',
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo', PAUSED: 'Pausado', ARCHIVED: 'Arquivado',
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      padding: '10px 14px', borderRadius: 8,
      border: '1px solid var(--border)', background: '#fff',
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: 'var(--tracking-tight)' }}>
        {value}
      </span>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 24px' }}>
      {[80, 120, 200, 160].map((w, i) => (
        <div key={i} style={{ height: 14, width: `${w}%`.replace('%', 'px'), background: 'var(--border)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  )
}

function AdSetRow({ s }: { s: AdSet }) {
  const [open, setOpen] = useState(false)
  const budget = s.dailyBudget ? `R$ ${s.dailyBudget.toFixed(2)}/dia` : s.lifetimeBudget ? `R$ ${s.lifetimeBudget.toFixed(2)} total` : '—'
  const genders = s.targeting.genders?.map(g => g === 1 ? 'Masc.' : 'Fem.').join(' + ') ?? 'Todos'
  const age     = s.targeting.ageMin || s.targeting.ageMax ? `${s.targeting.ageMin ?? 18}–${s.targeting.ageMax ?? 65}` : 'Todas'

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: STATUS_COLOR[s.status] ?? 'var(--text-muted)',
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, marginLeft: 12 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtBRL(s.insights.spend)}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--hairline)', background: 'var(--surface-raised, #fafaf9)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <MetricCard label="Gasto"       value={fmtBRL(s.insights.spend)} />
            <MetricCard label="Impressões"  value={fmtNum(s.insights.impressions)} />
            <MetricCard label="CPM"         value={fmtBRL(s.insights.cpm)} />
            <MetricCard label="Cliques"     value={fmtNum(s.insights.linkClicks)} />
            <MetricCard label="CTR"         value={fmtPct(s.insights.ctr)} />
            <MetricCard label="CPC"         value={fmtBRL(s.insights.cpc)} />
          </div>

          {/* Orçamento + Segmentação */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Segmentação
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                budget !== '—' && `Orçamento: ${budget}`,
                `Idade: ${age}`,
                `Gênero: ${genders}`,
                ...(s.targeting.geoLocations?.slice(0, 3) ?? []),
                ...(s.targeting.interests?.slice(0, 3) ?? []),
              ].filter(Boolean).map((tag, i) => (
                <span key={i} style={{
                  fontSize: 11.5, padding: '3px 9px', borderRadius: 99,
                  background: 'var(--brand-pale, #fdf2f5)', color: 'var(--brand)',
                  fontWeight: 600, border: '1px solid var(--brand-light, #f0c0cc)',
                }}>
                  {tag as string}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdCard({ ad }: { ad: Ad }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      {ad.creative.imageUrl || ad.creative.thumbnailUrl ? (
        <img
          src={ad.creative.imageUrl ?? ad.creative.thumbnailUrl}
          alt={ad.creative.title ?? ad.name}
          style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: 100, background: 'var(--surface-raised, #f5f5f4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ImageOff size={24} style={{ color: 'var(--text-muted)' }} />
        </div>
      )}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ad.name}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[ad.status] ?? 'var(--text-muted)', flexShrink: 0 }}>
            {STATUS_LABEL[ad.status] ?? ad.status}
          </span>
        </div>
        {ad.creative.title && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ad.creative.title}
          </p>
        )}
        {ad.creative.callToAction && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#1877F215', color: '#1877F2', fontWeight: 700, alignSelf: 'flex-start' }}>
            {ad.creative.callToAction.replace(/_/g, ' ')}
          </span>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
          {[
            ['Gasto',    fmtBRL(ad.insights.spend)],
            ['Cliques',  fmtNum(ad.insights.linkClicks)],
            ['CTR',      fmtPct(ad.insights.ctr)],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CampaignDetailPanel({
  campaign,
  preset,
  onClose,
}: {
  campaign: Campaign
  preset: string
  onClose: () => void
}) {
  const [detail, setDetail]   = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setDetail(null)
    getCampaignDetail(campaign.id, preset).then(res => {
      if (res.ok) setDetail(res.data)
      else setError(res.error)
      setLoading(false)
    })
  }, [campaign.id, preset])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 49 }}
      />

      {/* Painel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 560,
        background: '#fff', borderLeft: '1px solid var(--border)',
        zIndex: 50, display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: 'var(--tracking-tight)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 450 }}>
              {campaign.name}
            </h2>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 700,
              color: STATUS_COLOR[campaign.status] ?? 'var(--text-muted)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              {STATUS_LABEL[campaign.status] ?? campaign.status}
            </span>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, flexShrink: 0, marginLeft: 8 }}>
            <X size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Métricas da campanha */}
          <section>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Métricas da campanha
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <MetricCard label="Gasto"          value={fmtBRL(campaign.spend)} />
              <MetricCard label="Impressões"     value={fmtNum(campaign.impressions)} />
              <MetricCard label="CPM"            value={fmtBRL(campaign.cpm)} />
              <MetricCard label="Cliques no link" value={fmtNum(campaign.linkClicks ?? 0)} />
              <MetricCard label="CTR (link)"     value={fmtPct(campaign.linkCtr ?? 0)} />
              <MetricCard label="CPC (link)"     value={fmtBRL(campaign.linkCpc ?? 0)} />
              {campaign.conversions != null && (
                <MetricCard label="Conversões" value={fmtNum(campaign.conversions)} />
              )}
            </div>
          </section>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: 44, borderRadius: 8, background: 'var(--border)', opacity: 0.5 }} />
              ))}
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: '#fef2f2', border: '1px solid #dc262633', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
              {error}
            </div>
          )}

          {detail && (
            <>
              {/* Ad Sets */}
              {detail.adSets.length > 0 && (
                <section>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    Conjuntos de anúncios ({detail.adSets.length})
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detail.adSets.map(s => <AdSetRow key={s.id} s={s} />)}
                  </div>
                </section>
              )}

              {/* Ads */}
              {detail.ads.length > 0 && (
                <section>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    Anúncios ({detail.ads.length})
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {detail.ads.map(ad => <AdCard key={ad.id} ad={ad} />)}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
