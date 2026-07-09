import Link from 'next/link'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdsConfig, resolveAdsProvider } from '@/lib/ads/factory'
import { MarketingOverview } from '@/components/admin/marketing-overview'
import { MarketingCampaignsTable } from '@/components/admin/marketing-campaigns-table'
import { MarketingAttribution } from '@/components/admin/marketing-attribution'
import type { Campaign, DatePreset } from '@/lib/ads/types'
import { SegSelect } from '@/components/shared/seg-select'

export const dynamic = 'force-dynamic'

type View = 'overview' | 'meta' | 'google' | 'attribution'

const VIEWS: { key: View; label: string }[] = [
  { key: 'overview',     label: 'Visão Geral'  },
  { key: 'meta',         label: 'Meta Ads'     },
  { key: 'google',       label: 'Google Ads'   },
  { key: 'attribution',  label: 'Atribuição'   },
]

const PERIODS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Hoje'          },
  { key: '7d',    label: '7 dias'        },
  { key: '30d',   label: '30 dias'       },
  { key: '90d',   label: '90 dias'       },
  { key: 'all',   label: 'Todo período'  },
]

function EmptyState({ platform, configured }: { platform: string; configured: boolean }) {
  return (
    <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
      <h3 style={{
        fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
        color: 'var(--text)', marginBottom: 8,
      }}>
        {configured ? 'Nenhuma campanha encontrada' : `${platform} não configurado`}
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginBottom: 20 }}>
        {configured
          ? 'Não há campanhas no período selecionado ou a conta não possui campanhas criadas.'
          : `Conecte sua conta ${platform} para visualizar métricas e campanhas.`
        }
      </p>
      {!configured && (
        <Link href="/admin/settings?tab=integrations" className="btn-primary">
          Configurar integração
        </Link>
      )}
    </div>
  )
}

function ErrorState({ platform, message }: { platform: string; message: string }) {
  return (
    <div className="card" style={{ padding: '32px', borderColor: 'var(--danger, #dc2626)', textAlign: 'center' }}>
      <p style={{ color: 'var(--danger, #dc2626)', fontWeight: 'var(--weight-bold)', marginBottom: 6 }}>
        Erro ao buscar dados do {platform}
      </p>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>{message}</p>
    </div>
  )
}

export default async function AdminMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; period?: string }>
}) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'MARKETING'])

  const { view: rawView, period: rawPeriod } = await searchParams
  const activeView   = (rawView   as View       ?? 'overview')
  const activePeriod = (rawPeriod as DatePreset  ?? '30d')

  const admin = createAdminClient()

  // Busca configs das plataformas
  const [metaConfig, googleConfig] = await Promise.all([
    getAdsConfig(ctx.tenantId!, 'meta_ads'),
    getAdsConfig(ctx.tenantId!, 'google_ads'),
  ])

  // Busca campanhas em paralelo
  type CampaignResult = { data: Campaign[]; error: string | null }

  const campaignResults = await Promise.all<CampaignResult>([
    metaConfig
      ? resolveAdsProvider(metaConfig).getCampaigns({ preset: activePeriod })
          .then(data => ({ data, error: null }))
          .catch(e  => ({ data: [] as Campaign[], error: (e as Error).message }))
      : Promise.resolve({ data: [] as Campaign[], error: null }),

    googleConfig
      ? resolveAdsProvider(googleConfig).getCampaigns({ preset: activePeriod })
          .then(data => ({ data, error: null }))
          .catch(e  => ({ data: [] as Campaign[], error: (e as Error).message }))
      : Promise.resolve({ data: [] as Campaign[], error: null }),
  ])
  const metaResult    = campaignResults[0] as CampaignResult
  const googleResult  = campaignResults[1] as CampaignResult

  // Busca leads com atribuição
  const now = new Date()
  const since = activePeriod === 'all'
    ? new Date(0).toISOString()
    : activePeriod === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      : new Date(Date.now() - ({ '7d': 7, '30d': 30, '90d': 90 }[activePeriod] ?? 30) * 86_400_000).toISOString()

  const { data: attributedLeads } = await admin
    .from('leads')
    .select('id, name, phone, created_at, utm_source, utm_medium, utm_campaign, fbclid, gclid, client_id')
    .eq('tenant_id', ctx.tenantId!)
    .not('utm_source', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200)

  const leads = attributedLeads ?? []

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
            letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
          }}>
            Marketing
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            Métricas de campanhas Meta Ads e Google Ads
          </p>
        </div>

        {/* Period selector */}
        <SegSelect
          options={PERIODS}
          value={activePeriod}
          basePath="/admin/marketing"
          paramName="period"
          extraParams={{ view: activeView }}
          ariaLabel="Selecionar período"
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {VIEWS.map(v => {
          const isActive = v.key === activeView
          return (
            <Link
              key={v.key}
              href={`/admin/marketing?view=${v.key}&period=${activePeriod}`}
              style={{
                padding: '8px 16px',
                fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)',
                color: isActive ? 'var(--brand)' : 'var(--text-muted)',
                borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                textDecoration: 'none', transition: 'color 120ms', marginBottom: -1,
              }}
            >
              {v.label}
            </Link>
          )
        })}
      </div>

      {/* Content */}
      {activeView === 'overview' && (
        <MarketingOverview
          metaCampaigns={metaResult.data}
          googleCampaigns={googleResult.data}
          attributedLeadsCount={leads.length}
        />
      )}

      {activeView === 'meta' && (
        <div className="card">
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: '#1877F2', flexShrink: 0,
            }} />
            <h2 style={{
              fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)',
            }}>
              Meta Ads
            </h2>
          </div>
          {metaResult.error ? (
            <ErrorState platform="Meta Ads" message={metaResult.error} />
          ) : !metaConfig ? (
            <EmptyState platform="Meta Ads" configured={false} />
          ) : (
            <MarketingCampaignsTable campaigns={metaResult.data} preset={activePeriod} />
          )}
        </div>
      )}

      {activeView === 'google' && (
        <div className="card">
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: '#34A853', flexShrink: 0,
            }} />
            <h2 style={{
              fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)',
            }}>
              Google Ads
            </h2>
          </div>
          {googleResult.error ? (
            <ErrorState platform="Google Ads" message={googleResult.error} />
          ) : !googleConfig ? (
            <EmptyState platform="Google Ads" configured={false} />
          ) : (
            <MarketingCampaignsTable campaigns={googleResult.data} />
          )}
        </div>
      )}

      {activeView === 'attribution' && (
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <h2 style={{
              fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)',
            }}>
              Atribuição de leads
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 4 }}>
              Leads captados com dados de origem de campanha (UTM / click ID)
            </p>
          </div>
          <MarketingAttribution leads={leads as any} />
        </div>
      )}
    </div>
  )
}
