'use client'

import { useEffect, useRef, useState } from 'react'
import type { Campaign } from '@/lib/ads/types'

function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(0)
  const frameRef = useRef<number>(0)
  useEffect(() => {
    setVal(0)
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      setVal(target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, duration])
  return val
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtNum(v: number) {
  return Math.round(v).toLocaleString('pt-BR')
}
function fmtPct(v: number) {
  return v.toFixed(2).replace('.', ',') + '%'
}

function KpiCard({
  label, value, format = 'brl', sub,
}: {
  label: string; value: number; format?: 'brl' | 'int' | 'pct'; sub?: string
}) {
  const animated = useCountUp(value)
  const display =
    format === 'brl'  ? fmtBRL(animated) :
    format === 'pct'  ? fmtPct(animated) :
    fmtNum(animated)

  return (
    <div className="card" style={{ flex: 1, minWidth: 150, padding: '20px 22px' }}>
      <p style={{
        fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
        color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 8,
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 'var(--weight-extrabold)',
        color: 'var(--text)', letterSpacing: 'var(--tracking-tight)',
      }}>
        {display}
      </p>
      {sub && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 4 }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function PlatformBar({ label, value, total, color }: {
  label: string; value: number; total: number; color: string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)' }}>{label}</span>
        <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {fmtBRL(value)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--hairline)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: 99, transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  )
}

export function MarketingOverview({
  metaCampaigns,
  googleCampaigns,
  attributedLeadsCount,
}: {
  metaCampaigns: Campaign[]
  googleCampaigns: Campaign[]
  attributedLeadsCount: number
}) {
  const allCampaigns = [...metaCampaigns, ...googleCampaigns]

  const totals = allCampaigns.reduce((acc, c) => ({
    spend:       acc.spend       + c.spend,
    impressions: acc.impressions + c.impressions,
    clicks:      acc.clicks      + c.clicks,
    conversions: acc.conversions + (c.conversions ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 })

  const metaSpend   = metaCampaigns.reduce((s, c)   => s + c.spend, 0)
  const googleSpend = googleCampaigns.reduce((s, c) => s + c.spend, 0)

  const ctr = totals.impressions > 0
    ? (totals.clicks / totals.impressions) * 100 : 0
  const cpl = attributedLeadsCount > 0
    ? totals.spend / attributedLeadsCount : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Total investido"  value={totals.spend}       format="brl" />
        <KpiCard label="Impressões"       value={totals.impressions} format="int" />
        <KpiCard label="Cliques"          value={totals.clicks}      format="int" />
        <KpiCard label="CTR médio"        value={ctr}                format="pct" />
        <KpiCard
          label="CPL (custo por lead)"
          value={cpl}
          format="brl"
          sub={`${attributedLeadsCount} lead${attributedLeadsCount !== 1 ? 's' : ''} atribuído${attributedLeadsCount !== 1 ? 's' : ''}`}
        />
        <KpiCard label="Conversões"       value={totals.conversions} format="int" />
      </div>

      {/* Breakdown por plataforma */}
      {(metaSpend > 0 || googleSpend > 0) && (
        <div className="card" style={{ padding: '20px 22px' }}>
          <h3 style={{
            fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
            color: 'var(--text)', marginBottom: 16,
          }}>
            Investimento por plataforma
          </h3>
          <PlatformBar
            label="Meta Ads (Facebook / Instagram)"
            value={metaSpend}
            total={totals.spend}
            color="#1877F2"
          />
          <PlatformBar
            label="Google Ads"
            value={googleSpend}
            total={totals.spend}
            color="#34A853"
          />
        </div>
      )}

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: '16px 20px' }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 'var(--weight-bold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Campanhas ativas
          </p>
          <p style={{ fontSize: 22, fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
            {allCampaigns.filter(c => c.status === 'ACTIVE').length}
            <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-normal)', color: 'var(--text-muted)', marginLeft: 6 }}>
              de {allCampaigns.length} totais
            </span>
          </p>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: '16px 20px' }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 'var(--weight-bold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            CPC médio
          </p>
          <p style={{ fontSize: 22, fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
            {totals.clicks > 0 ? fmtBRL(totals.spend / totals.clicks) : '—'}
          </p>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200, padding: '16px 20px' }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 'var(--weight-bold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Taxa de conversão
          </p>
          <p style={{ fontSize: 22, fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
            {totals.clicks > 0
              ? fmtPct((attributedLeadsCount / totals.clicks) * 100)
              : '—'
            }
            <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginLeft: 4 }}>
              clique → lead
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
