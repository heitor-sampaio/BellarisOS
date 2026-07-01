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

function MetricCard({ m }: { m: { label: string; fmt: string | null; highlight?: boolean } }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>
        {m.label}
      </span>
      {m.fmt != null ? (
        <span style={{
          fontSize: 20, fontWeight: 800, letterSpacing: 'var(--tracking-tight)',
          color: m.highlight === true ? '#16a34a' : m.highlight === false ? '#dc2626' : 'var(--text)',
        }}>
          {m.fmt}
        </span>
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

  const { campaign } = result.data

  const roi = campaign.conversionValue != null && campaign.spend > 0
    ? ((campaign.conversionValue - campaign.spend) / campaign.spend) * 100
    : undefined

  type Metric = { label: string; fmt: string | null; highlight?: boolean }

  const deliveryMetrics: Metric[] = [
    { label: 'Gasto',           fmt: fmtBRL(campaign.spend) },
    { label: 'Impressões',      fmt: fmtNum(campaign.impressions) },
    { label: 'Alcance',         fmt: campaign.reach != null ? fmtNum(campaign.reach) : null },
    { label: 'CPM',             fmt: fmtBRL(campaign.cpm) },
    { label: 'Cliques no link', fmt: fmtNum(campaign.linkClicks) },
    { label: 'CTR (link)',      fmt: fmtPct(campaign.linkCtr) },
    { label: 'CPC (link)',      fmt: fmtBRL(campaign.linkCpc) },
  ]

  const conversionMetrics: Metric[] = [
    { label: 'Conversões',  fmt: campaign.conversions       != null ? fmtNum(campaign.conversions)       : null },
    { label: 'Valor conv.', fmt: campaign.conversionValue   != null ? fmtBRL(campaign.conversionValue)   : null },
    { label: 'Custo/conv.', fmt: campaign.costPerConversion != null ? fmtBRL(campaign.costPerConversion) : null },
    { label: 'ROI',         fmt: roi != null ? fmtRoi(roi) : null, highlight: roi != null ? roi >= 0 : undefined },
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 10 }}>
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
