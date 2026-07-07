import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getCampaignDetail } from '@/actions/meta-campaign'
import { CampaignDetailContent } from '@/components/admin/campaign-detail-content'
import type { DatePreset } from '@/lib/ads/types'

export const dynamic = 'force-dynamic'

const PERIODS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Hoje'         },
  { key: '7d',    label: '7 dias'       },
  { key: '30d',   label: '30 dias'      },
  { key: '90d',   label: '90 dias'      },
  { key: 'all',   label: 'Todo período' },
]

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:   'var(--success)',
  PAUSED:   'var(--warning, #d97706)',
  ARCHIVED: 'var(--text-muted)',
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo', PAUSED: 'Pausado', ARCHIVED: 'Arquivado',
}

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtPct(v: number) { return v.toFixed(2).replace('.', ',') + '%' }
function fmtNum(v: number) { return v.toLocaleString('pt-BR') }
function fmtRoi(v: number) { return (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%' }

function MetricCard({ m }: {
  m: { label: string; fmt: string | null; highlight?: boolean; alert?: string; delta?: number; deltaPositiveIsGood?: boolean }
}) {
  const showDelta = m.delta != null && isFinite(m.delta)
  const deltaGood = showDelta
    ? (m.deltaPositiveIsGood === false ? m.delta! < 0 : m.delta! > 0)
    : false
  const deltaNeutral = m.deltaPositiveIsGood == null
  const deltaColor = deltaNeutral ? 'var(--text-muted)' : deltaGood ? '#16a34a' : '#dc2626'
  const deltaSign  = m.delta != null && m.delta > 0 ? '+' : ''

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>
        {m.label}
      </span>
      {m.fmt != null ? (
        <>
          <span style={{
            fontSize: 20, fontWeight: 800, letterSpacing: 'var(--tracking-tight)',
            color: m.highlight === true ? '#16a34a' : m.highlight === false ? '#dc2626' : 'var(--text)',
          }}>
            {m.fmt}
          </span>
          {showDelta && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10.5, fontWeight: 700, color: deltaColor, marginTop: 3, marginLeft: 6 }}>
              {m.delta! > 0 ? '↑' : '↓'} {deltaSign}{m.delta!.toFixed(1).replace('.', ',')}%
            </span>
          )}
          {m.alert && (
            <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '2px 5px', marginTop: 5 }}>
              {m.alert}
            </span>
          )}
        </>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 500 }}>
          Indisponível
        </span>
      )}
    </div>
  )
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ period?: string }>
}) {
  const { id } = await params
  const { period: rawPeriod } = await searchParams
  const period = (rawPeriod as DatePreset) ?? '30d'

  const result = await getCampaignDetail(id, period)

  if (!result.ok) {
    return (
      <div>
        <Link
          href={`/admin/marketing?view=meta&period=${period}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none', marginBottom: 24 }}
        >
          <ArrowLeft size={14} /> Voltar para campanhas
        </Link>
        <div className="card" style={{ padding: '40px', textAlign: 'center', borderColor: 'var(--danger, #dc2626)' }}>
          <p style={{ color: 'var(--danger, #dc2626)', fontWeight: 700, marginBottom: 6 }}>Erro ao carregar campanha</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{result.error}</p>
        </div>
      </div>
    )
  }

  const { campaign, previousPeriod } = result.data

  const roi = campaign.conversionValue != null && campaign.spend > 0
    ? ((campaign.conversionValue - campaign.spend) / campaign.spend) * 100
    : undefined

  const prevRoi = previousPeriod?.conversionValue != null && (previousPeriod.spend ?? 0) > 0
    ? ((previousPeriod.conversionValue - previousPeriod.spend) / previousPeriod.spend) * 100
    : undefined

  function pctDelta(curr: number, prev: number | undefined): number | undefined {
    if (prev == null || prev === 0) return undefined
    return ((curr - prev) / Math.abs(prev)) * 100
  }

  type Metric = { label: string; fmt: string | null; highlight?: boolean; alert?: string; delta?: number; deltaPositiveIsGood?: boolean }

  const frequency = campaign.reach != null && campaign.reach > 0
    ? campaign.impressions / campaign.reach
    : null

  const deliveryMetrics: Metric[] = [
    { label: 'Gasto',           fmt: fmtBRL(campaign.spend),        delta: pctDelta(campaign.spend, previousPeriod?.spend) },
    { label: 'Impressões',      fmt: fmtNum(campaign.impressions),   delta: pctDelta(campaign.impressions, previousPeriod?.impressions),  deltaPositiveIsGood: true },
    { label: 'Alcance',         fmt: campaign.reach != null ? fmtNum(campaign.reach) : null, delta: pctDelta(campaign.reach ?? 0, previousPeriod?.reach), deltaPositiveIsGood: true },
    { label: 'Frequência',      fmt: frequency != null ? frequency.toFixed(2).replace('.', ',') : null, alert: frequency != null && frequency > 3 ? 'Audiência saturando' : undefined },
    { label: 'CPM',             fmt: fmtBRL(campaign.cpm),           delta: pctDelta(campaign.cpm, previousPeriod?.cpm),                 deltaPositiveIsGood: false },
    { label: 'Cliques no link', fmt: fmtNum(campaign.linkClicks),    delta: pctDelta(campaign.linkClicks, previousPeriod?.linkClicks),   deltaPositiveIsGood: true },
    { label: 'CTR (link)',      fmt: fmtPct(campaign.linkCtr),       delta: pctDelta(campaign.linkCtr, previousPeriod?.linkCtr),         deltaPositiveIsGood: true },
    { label: 'CPC (link)',      fmt: fmtBRL(campaign.linkCpc),       delta: pctDelta(campaign.linkCpc, previousPeriod?.linkCpc),         deltaPositiveIsGood: false },
  ]

  const conversionMetrics: Metric[] = [
    { label: 'Conversões',  fmt: campaign.conversions       != null ? fmtNum(campaign.conversions)       : null, delta: pctDelta(campaign.conversions ?? 0, previousPeriod?.conversions),           deltaPositiveIsGood: true },
    { label: 'Valor conv.', fmt: campaign.conversionValue   != null ? fmtBRL(campaign.conversionValue)   : null, delta: pctDelta(campaign.conversionValue ?? 0, previousPeriod?.conversionValue),     deltaPositiveIsGood: true },
    { label: 'Custo/conv.', fmt: campaign.costPerConversion != null ? fmtBRL(campaign.costPerConversion) : null, delta: pctDelta(campaign.costPerConversion ?? 0, previousPeriod?.costPerConversion), deltaPositiveIsGood: false },
    { label: 'ROI',         fmt: roi != null ? fmtRoi(roi) : null, highlight: roi != null ? roi >= 0 : undefined, delta: pctDelta(roi ?? 0, prevRoi), deltaPositiveIsGood: true },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <Link
            href={`/admin/marketing?view=meta&period=${period}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}
          >
            <ArrowLeft size={14} /> Voltar para campanhas
          </Link>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)', margin: 0 }}>
            {campaign.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: STATUS_COLOR[campaign.status] ?? 'var(--text-muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              {STATUS_LABEL[campaign.status] ?? campaign.status}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>·</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Meta Ads</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>·</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'monospace' }}>{id}</span>
          </div>
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, background: '#fff', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
          {PERIODS.map(p => (
            <Link
              key={p.key}
              href={`/admin/marketing/campanhas/${id}?period=${p.key}`}
              className={period === p.key ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: 'var(--text-xs-sz)', padding: '6px 12px', whiteSpace: 'nowrap' }}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Metric cards — linha 1: entrega */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10, marginBottom: 10 }}>
        {deliveryMetrics.map(m => <MetricCard key={m.label} m={m} />)}
      </div>

      {/* Metric cards — linha 2: conversões */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {conversionMetrics.map(m => <MetricCard key={m.label} m={m} />)}
      </div>

      {/* Ad sets, segmentation and ads */}
      <CampaignDetailContent data={result.data} />
    </div>
  )
}
