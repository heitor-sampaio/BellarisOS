'use server'

import { getTenantContext, assertRole } from '@/lib/auth'
import { getAdsConfig } from '@/lib/ads/factory'
import type { AdSet, Ad, CampaignDetail, AdSetTargeting } from '@/lib/ads/types'

const GRAPH = 'https://graph.facebook.com/v25.0'

const PRESET_MAP: Record<string, string> = {
  today: 'today',
  '7d':  'last_7d',
  '30d': 'last_30d',
  '90d': 'last_90d',
  all:   'maximum',
}

export async function getCampaignDetail(
  campaignId: string,
  preset: string,
): Promise<{ ok: true; data: CampaignDetail } | { ok: false; error: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'MARKETING'])

  const config = await getAdsConfig(ctx.tenantId!, 'meta_ads')
  if (!config || config.provider !== 'meta_ads') {
    return { ok: false, error: 'Meta Ads não configurado' }
  }

  const token     = (config as any).accessToken as string
  const datePreset = PRESET_MAP[preset] ?? 'last_30d'

  const insightFields = `spend,impressions,inline_link_clicks,ctr,cost_per_inline_link_click,cpm,reach`

  const adSetFields = [
    'id', 'name', 'status', 'daily_budget', 'lifetime_budget',
    'targeting',
    `insights.date_preset(${datePreset}){${insightFields}}`,
  ].join(',')

  const adFields = [
    'id', 'name', 'status',
    'creative{id,name,title,body,image_url,thumbnail_url,call_to_action_type}',
    `insights.date_preset(${datePreset}){spend,impressions,inline_link_clicks,ctr,cost_per_inline_link_click}`,
  ].join(',')

  const qs = new URLSearchParams({ access_token: token, limit: '100' })

  const [adSetsRes, adsRes] = await Promise.all([
    fetch(`${GRAPH}/${campaignId}/adsets?${qs}&fields=${encodeURIComponent(adSetFields)}`, { cache: 'no-store' }),
    fetch(`${GRAPH}/${campaignId}/ads?${qs}&fields=${encodeURIComponent(adFields)}`, { cache: 'no-store' }),
  ])

  if (!adSetsRes.ok) {
    const err = await adSetsRes.json().catch(() => ({}))
    return { ok: false, error: (err as any)?.error?.message ?? `Meta API ${adSetsRes.status}` }
  }

  const adSetsBody = await adSetsRes.json() as { data: any[] }
  const adsBody    = await adsRes.json()    as { data: any[] }

  const adSets: AdSet[] = (adSetsBody.data ?? []).map(s => {
    const ins  = s.insights?.data?.[0]
    const t    = s.targeting ?? {}
    const geos = (t.geo_locations?.countries ?? [])
      .concat(t.geo_locations?.cities?.map((c: any) => c.name) ?? [])

    const interests = [
      ...(t.flexible_spec ?? []).flatMap((fs: any) =>
        (fs.interests ?? []).map((i: any) => i.name)
      ),
    ]

    const targeting: AdSetTargeting = {
      ageMin:       t.age_min,
      ageMax:       t.age_max,
      genders:      t.genders,
      geoLocations: geos.length > 0 ? geos : undefined,
      interests:    interests.length > 0 ? interests : undefined,
    }

    return {
      id:              s.id,
      name:            s.name,
      status:          s.status,
      dailyBudget:     s.daily_budget     ? parseInt(s.daily_budget,     10) / 100 : undefined,
      lifetimeBudget:  s.lifetime_budget  ? parseInt(s.lifetime_budget,  10) / 100 : undefined,
      targeting,
      insights: {
        spend:       parseFloat(ins?.spend       ?? '0'),
        impressions: parseInt(ins?.impressions   ?? '0', 10),
        linkClicks:  parseInt(ins?.inline_link_clicks ?? '0', 10),
        ctr:         parseFloat(ins?.ctr         ?? '0'),
        cpc:         parseFloat(ins?.cost_per_inline_link_click ?? '0'),
        cpm:         parseFloat(ins?.cpm         ?? '0'),
        reach:       ins?.reach ? parseInt(ins.reach, 10) : undefined,
      },
    }
  })

  const ads: Ad[] = (adsBody.data ?? []).map(a => {
    const ins = a.insights?.data?.[0]
    const cr  = a.creative ?? {}
    return {
      id:     a.id,
      name:   a.name,
      status: a.status,
      creative: {
        title:         cr.title       ?? undefined,
        body:          cr.body        ?? undefined,
        imageUrl:      cr.image_url   ?? undefined,
        thumbnailUrl:  cr.thumbnail_url ?? undefined,
        callToAction:  cr.call_to_action_type ?? undefined,
      },
      insights: {
        spend:       parseFloat(ins?.spend       ?? '0'),
        impressions: parseInt(ins?.impressions   ?? '0', 10),
        linkClicks:  parseInt(ins?.inline_link_clicks ?? '0', 10),
        ctr:         parseFloat(ins?.ctr         ?? '0'),
        cpc:         parseFloat(ins?.cost_per_inline_link_click ?? '0'),
      },
    }
  })

  return { ok: true, data: { adSets, ads } }
}
