import { createHash } from 'crypto'
import type { AdsProvider, Campaign, DateRange, MetaAdsConfig } from './types'

const GRAPH_API_VERSION = 'v25.0'
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`

const PRESET_MAP: Record<string, string> = {
  today: 'today',
  '7d':  'last_7d',
  '30d': 'last_30d',
  '90d': 'last_90d',
  all:   'maximum',
}

export class MetaAdsProvider implements AdsProvider {
  constructor(private config: MetaAdsConfig) {}

  async getCampaigns(dateRange: DateRange): Promise<Campaign[]> {
    const preset = PRESET_MAP[dateRange.preset] ?? 'last_30d'
    const fields = [
      'id', 'name', 'status',
      `insights.date_preset(${preset}){spend,impressions,clicks,ctr,cpc,cpm,reach,conversions,cost_per_conversion,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,purchase_roas,action_values}`,
    ].join(',')

    const qs = new URLSearchParams({
      access_token: this.config.accessToken,
      limit:        '200',
    })
    // fields contém parênteses e chaves — encodeURIComponent evita que
    // URLSearchParams os codifique de forma que a Meta API não reconheça
    const endpoint = `${BASE_URL}/act_${this.config.adAccountId}/campaigns?${qs}&fields=${encodeURIComponent(fields)}`

    const res = await fetch(endpoint, { cache: 'no-store' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as any)?.error?.message ?? `Meta API error ${res.status}`)
    }

    const body = await res.json() as { data: MetaCampaign[] }
    return (body.data ?? []).map(c => this.mapCampaign(c))
  }

  async testConnection(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const url = new URL(`${BASE_URL}/act_${this.config.adAccountId}`)
      url.searchParams.set('fields', 'name,account_status')
      url.searchParams.set('access_token', this.config.accessToken)

      const res = await fetch(url.toString(), { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { ok: false, detail: (err as any)?.error?.message ?? `HTTP ${res.status}` }
      }
      const body = await res.json() as { name?: string }
      return { ok: true, detail: body.name }
    } catch (e) {
      return { ok: false, detail: (e as Error).message }
    }
  }

  async sendCAPIEvent(lead: CAPILead, eventName: string): Promise<void> {
    const eventTime = Math.floor(Date.now() / 1000)
    const userData: Record<string, string> = {}

    if (lead.email) userData['em'] = sha256(lead.email.toLowerCase().trim())
    if (lead.phone) userData['ph'] = sha256(lead.phone.replace(/\D/g, ''))
    if (lead.fbclid) userData['fbc'] = `fb.1.${eventTime}.${lead.fbclid}`

    const payload = {
      data: [{
        event_name: eventName,
        event_time: eventTime,
        action_source: 'website',
        user_data: userData,
        custom_data: lead.customData ?? {},
      }],
      access_token: this.config.accessToken,
    }

    await fetch(`${BASE_URL}/${this.config.pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  private mapCampaign(c: MetaCampaign): Campaign {
    const ins = c.insights?.data?.[0]
    const spend       = parseFloat(ins?.spend ?? '0')
    const impressions = parseInt(ins?.impressions ?? '0', 10)
    const clicks      = parseInt(ins?.clicks ?? '0', 10)
    const ctr         = parseFloat(ins?.ctr ?? '0')
    const cpc         = parseFloat(ins?.cpc ?? '0')
    const cpm         = parseFloat(ins?.cpm ?? '0')
    const reach       = parseInt(ins?.reach ?? '0', 10)
    const conversions = ins?.conversions         != null ? parseFloat(ins.conversions)         : undefined
    const cpa         = ins?.cost_per_conversion != null ? parseFloat(ins.cost_per_conversion) : undefined
    const linkClicks  = ins?.inline_link_clicks       != null ? parseInt(ins.inline_link_clicks, 10)         : undefined
    const linkCtr     = ins?.inline_link_click_ctr    != null ? parseFloat(ins.inline_link_click_ctr)        : undefined
    const linkCpc     = ins?.cost_per_inline_link_click != null ? parseFloat(ins.cost_per_inline_link_click) : undefined

    // purchase_roas: [{ action_type, value }] — take the first entry
    const roasArr = ins?.purchase_roas as Array<{ value: string }> | undefined
    const roas    = roasArr && roasArr.length > 0 ? parseFloat(roasArr[0].value) : undefined

    // action_values: [{ action_type, value }] — sum all purchase-type entries to get total conversion value
    const actionVals = ins?.action_values as Array<{ action_type: string; value: string }> | undefined
    const conversionValue = actionVals && actionVals.length > 0
      ? actionVals
          .filter(a => a.action_type.includes('purchase') || a.action_type.includes('omni_'))
          .reduce((s, a) => s + parseFloat(a.value ?? '0'), 0)
      : roas != null && spend > 0 ? roas * spend : undefined

    return {
      id: c.id,
      name: c.name,
      status: normalizeMetaStatus(c.status),
      platform: 'meta',
      spend,
      impressions,
      clicks,
      ctr,
      cpc,
      cpm,
      linkClicks:        linkClicks       || undefined,
      linkCtr:           linkCtr          || undefined,
      linkCpc:           linkCpc          || undefined,
      reach:             reach    != null ? reach    : undefined,
      conversions,
      costPerConversion: cpa,
      conversionValue,
      roas,
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeMetaStatus(s: string): Campaign['status'] {
  if (s === 'ACTIVE')   return 'ACTIVE'
  if (s === 'PAUSED')   return 'PAUSED'
  if (s === 'ARCHIVED') return 'ARCHIVED'
  return s
}

export interface CAPILead {
  email?: string | null
  phone?: string | null
  fbclid?: string | null
  customData?: Record<string, unknown>
}

interface MetaCampaignInsight {
  spend?: string
  impressions?: string
  clicks?: string
  ctr?: string
  cpc?: string
  cpm?: string
  reach?: string
  conversions?: string
  cost_per_conversion?: string
  inline_link_clicks?: string
  inline_link_click_ctr?: string
  cost_per_inline_link_click?: string
  purchase_roas?: Array<{ action_type: string; value: string }>
  action_values?: Array<{ action_type: string; value: string }>
}
interface MetaCampaign {
  id: string
  name: string
  status: string
  insights?: { data: MetaCampaignInsight[] }
}
