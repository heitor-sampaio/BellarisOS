import type { AdsProvider, Campaign, DateRange, GoogleAdsConfig } from './types'

const GAQL_PERIOD: Record<string, string> = {
  today: 'TODAY',
  '7d':  'LAST_7_DAYS',
  '30d': 'LAST_30_DAYS',
  '90d': 'LAST_90_DAYS',
  all:   'ALL_TIME',
}

export class GoogleAdsProvider implements AdsProvider {
  private accessToken: string | null = null

  constructor(private config: GoogleAdsConfig) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`OAuth token refresh failed: ${(err as any)?.error_description ?? res.status}`)
    }

    const body = await res.json() as { access_token: string }
    this.accessToken = body.access_token
    return this.accessToken
  }

  async getCampaigns(dateRange: DateRange): Promise<Campaign[]> {
    const period = GAQL_PERIOD[dateRange.preset] ?? 'LAST_30_DAYS'
    const customerId = this.config.customerId.replace(/-/g, '')

    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions,
        metrics.cost_per_conversion
      FROM campaign
      WHERE segments.date DURING ${period}
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 200
    `

    const token = await this.getAccessToken()
    const res = await fetch(
      `https://googleads.googleapis.com/v16/customers/${customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'developer-token': this.config.developerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const detail = (err as any)?.[0]?.error?.message ?? `HTTP ${res.status}`
      throw new Error(`Google Ads API: ${detail}`)
    }

    const body = await res.json() as GoogleSearchStreamResponse[]
    const rows = body.flatMap(b => b.results ?? [])
    return rows.map(r => this.mapRow(r))
  }

  async testConnection(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const token = await this.getAccessToken()
      const customerId = this.config.customerId.replace(/-/g, '')
      const res = await fetch(
        `https://googleads.googleapis.com/v16/customers/${customerId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'developer-token': this.config.developerToken,
          },
          cache: 'no-store',
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { ok: false, detail: (err as any)?.error?.message ?? `HTTP ${res.status}` }
      }
      const body = await res.json() as { descriptiveName?: string }
      return { ok: true, detail: body.descriptiveName }
    } catch (e) {
      return { ok: false, detail: (e as Error).message }
    }
  }

  private mapRow(r: GoogleRow): Campaign {
    const costMicros    = Number(r.metrics?.costMicros ?? 0)
    const spend         = costMicros / 1_000_000
    const impressions   = Number(r.metrics?.impressions ?? 0)
    const clicks        = Number(r.metrics?.clicks ?? 0)
    const ctr           = Number(r.metrics?.ctr ?? 0) * 100
    const avgCpcMicros  = Number(r.metrics?.averageCpc ?? 0)
    const cpc           = avgCpcMicros / 1_000_000
    const cpm           = impressions > 0 ? (spend / impressions) * 1000 : 0
    const conversions   = Number(r.metrics?.conversions ?? 0)
    const cpa           = Number(r.metrics?.costPerConversion ?? 0) / 1_000_000

    return {
      id: r.campaign?.id ?? '',
      name: r.campaign?.name ?? '',
      status: normalizeGoogleStatus(r.campaign?.status ?? ''),
      platform: 'google',
      spend,
      impressions,
      clicks,
      ctr,
      cpc,
      cpm,
      conversions: conversions || undefined,
      costPerConversion: cpa || undefined,
    }
  }
}

function normalizeGoogleStatus(s: string): Campaign['status'] {
  if (s === 'ENABLED') return 'ACTIVE'
  if (s === 'PAUSED')  return 'PAUSED'
  return 'ARCHIVED'
}

interface GoogleRow {
  campaign?: { id?: string; name?: string; status?: string }
  metrics?: {
    impressions?: string | number
    clicks?: string | number
    costMicros?: string | number
    ctr?: string | number
    averageCpc?: string | number
    conversions?: string | number
    costPerConversion?: string | number
  }
}
interface GoogleSearchStreamResponse {
  results?: GoogleRow[]
}
