'use server'

import { getTenantContext, assertRole } from '@/lib/auth'
import { getAdsConfig } from '@/lib/ads/factory'
import type { AdSet, Ad, CampaignDetail, CampaignSummary, AgeBreakdown, GeoBreakdown, PlacementBreakdown, DailyInsight, PreviousPeriod, AdSetTargeting } from '@/lib/ads/types'

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

  const token      = (config as any).accessToken as string
  const datePreset = PRESET_MAP[preset] ?? 'last_30d'

  const campaignFields = encodeURIComponent([
    'id', 'name', 'status',
    `insights.date_preset(${datePreset}){spend,impressions,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,cpm,reach,conversions,cost_per_conversion,purchase_roas,action_values}`,
  ].join(','))

  const adSetFields = encodeURIComponent([
    'id', 'name', 'status', 'daily_budget', 'lifetime_budget', 'targeting',
    `insights.date_preset(${datePreset}){spend,impressions,inline_link_clicks,ctr,cost_per_inline_link_click,cpm,reach}`,
  ].join(','))

  const adFields = encodeURIComponent([
    'id', 'name', 'status', 'adset_id',
    'creative{id,name,title,body,image_url,thumbnail_url,call_to_action_type}',
    `insights.date_preset(${datePreset}){spend,impressions,inline_link_clicks,ctr,cost_per_inline_link_click}`,
  ].join(','))

  const base          = new URLSearchParams({ access_token: token })
  const list          = new URLSearchParams({ access_token: token, limit: '100' })
  const ageParams     = new URLSearchParams({ access_token: token, date_preset: datePreset, breakdowns: 'age',     fields: 'spend,impressions,inline_link_clicks,reach' })
  const geoParams     = new URLSearchParams({ access_token: token, date_preset: datePreset, breakdowns: 'country', fields: 'spend,impressions,reach' })
  const adSetAgeParams = new URLSearchParams({ access_token: token, date_preset: datePreset, level: 'adset', breakdowns: 'age',                              fields: 'adset_id,spend,impressions,inline_link_clicks' })
  const adSetPosParams = new URLSearchParams({ access_token: token, date_preset: datePreset, level: 'adset', breakdowns: 'publisher_platform,platform_position', fields: 'adset_id,spend,impressions' })
  const adAgeParams    = new URLSearchParams({ access_token: token, date_preset: datePreset, level: 'ad',    breakdowns: 'age',                              fields: 'ad_id,spend,impressions' })
  const adPosParams    = new URLSearchParams({ access_token: token, date_preset: datePreset, level: 'ad',    breakdowns: 'publisher_platform,platform_position', fields: 'ad_id,spend,impressions' })
  const dailyParams    = new URLSearchParams({ access_token: token, date_preset: datePreset, time_increment: '1', fields: 'spend,conversions,action_values,purchase_roas' })

  // Período anterior: deslocar N dias para trás usando since/until
  const DAYS_MAP: Record<string, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 }
  const prevDays = DAYS_MAP[preset]
  let prevParams: URLSearchParams | null = null
  if (prevDays) {
    const now    = new Date()
    const until  = new Date(now); until.setDate(until.getDate() - prevDays)
    const since  = new Date(until); since.setDate(since.getDate() - prevDays)
    const fmt    = (d: Date) => d.toISOString().slice(0, 10)
    const prevFields = `spend,impressions,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,cpm,reach,conversions,cost_per_conversion,purchase_roas,action_values`
    prevParams = new URLSearchParams({ access_token: token, since: fmt(since), until: fmt(until), fields: prevFields })
  }

  const [campaignRes, adSetsRes, adsRes, ageRes, geoRes, adSetAgeRes, adSetPosRes, adAgeRes, adPosRes, dailyRes, prevRes] = await Promise.all([
    fetch(`${GRAPH}/${campaignId}?${base}&fields=${campaignFields}`,     { cache: 'no-store' }),
    fetch(`${GRAPH}/${campaignId}/adsets?${list}&fields=${adSetFields}`, { cache: 'no-store' }),
    fetch(`${GRAPH}/${campaignId}/ads?${list}&fields=${adFields}`,       { cache: 'no-store' }),
    fetch(`${GRAPH}/${campaignId}/insights?${ageParams}`,                { cache: 'no-store' }),
    fetch(`${GRAPH}/${campaignId}/insights?${geoParams}`,                { cache: 'no-store' }),
    fetch(`${GRAPH}/${campaignId}/insights?${adSetAgeParams}`,           { cache: 'no-store' }),
    fetch(`${GRAPH}/${campaignId}/insights?${adSetPosParams}`,           { cache: 'no-store' }),
    fetch(`${GRAPH}/${campaignId}/insights?${adAgeParams}`,              { cache: 'no-store' }),
    fetch(`${GRAPH}/${campaignId}/insights?${adPosParams}`,              { cache: 'no-store' }),
    fetch(`${GRAPH}/${campaignId}/insights?${dailyParams}`,              { cache: 'no-store' }),
    prevParams
      ? fetch(`${GRAPH}/${campaignId}/insights?${prevParams}`,           { cache: 'no-store' })
      : Promise.resolve(null),
  ])

  if (!campaignRes.ok) {
    const err = await campaignRes.json().catch(() => ({}))
    return { ok: false, error: (err as any)?.error?.message ?? `Meta API ${campaignRes.status}` }
  }
  if (!adSetsRes.ok) {
    const err = await adSetsRes.json().catch(() => ({}))
    return { ok: false, error: (err as any)?.error?.message ?? `Meta API ${adSetsRes.status}` }
  }

  const campaignBody  = await campaignRes.json() as any
  const adSetsBody    = await adSetsRes.json()  as { data: any[] }
  const adsBody       = await adsRes.json()     as { data: any[] }
  const ageBody       = await ageRes.json().catch(()       => ({ data: [] })) as { data: any[] }
  const geoBody       = await geoRes.json().catch(()       => ({ data: [] })) as { data: any[] }
  const adSetAgeBody  = await adSetAgeRes.json().catch(()  => ({ data: [] })) as { data: any[] }
  const adSetPosBody  = await adSetPosRes.json().catch(()  => ({ data: [] })) as { data: any[] }
  const adAgeBody     = await adAgeRes.json().catch(()     => ({ data: [] })) as { data: any[] }
  const adPosBody     = await adPosRes.json().catch(()     => ({ data: [] })) as { data: any[] }
  const dailyBody     = await dailyRes.json().catch(()     => ({ data: [] })) as { data: any[] }
  const prevBody      = prevRes ? await prevRes.json().catch(() => ({ data: [] })) as { data: any[] } : null

  const cins = campaignBody.insights?.data?.[0]
  const cSpend = parseFloat(cins?.spend ?? '0')

  const cRoasArr = cins?.purchase_roas as Array<{ value: string }> | undefined
  const cRoas    = cRoasArr && cRoasArr.length > 0 ? parseFloat(cRoasArr[0]?.value ?? '0') : undefined

  const cActionVals = cins?.action_values as Array<{ action_type: string; value: string }> | undefined
  const cConvValue  = cActionVals && cActionVals.length > 0
    ? cActionVals
        .filter(a => a.action_type.includes('purchase') || a.action_type.includes('omni_'))
        .reduce((s, a) => s + parseFloat(a.value ?? '0'), 0)
    : cRoas != null && cSpend > 0 ? cRoas * cSpend : undefined

  const campaign: CampaignSummary = {
    id:                campaignBody.id,
    name:              campaignBody.name,
    status:            normalizeStatus(campaignBody.status),
    spend:             cSpend,
    impressions:       parseInt(cins?.impressions ?? '0', 10),
    cpm:               parseFloat(cins?.cpm ?? '0'),
    linkClicks:        parseInt(cins?.inline_link_clicks ?? '0', 10),
    linkCtr:           parseFloat(cins?.inline_link_click_ctr ?? '0'),
    linkCpc:           parseFloat(cins?.cost_per_inline_link_click ?? '0'),
    reach:             cins?.reach              != null ? parseInt(cins.reach, 10)              : undefined,
    conversions:       cins?.conversions        != null ? parseFloat(cins.conversions)          : undefined,
    costPerConversion: cins?.cost_per_conversion != null ? parseFloat(cins.cost_per_conversion) : undefined,
    conversionValue:   cConvValue,
    roas:              cRoas,
  }

  const adSets: AdSet[] = (adSetsBody.data ?? []).map((s: any) => {
    const ins  = s.insights?.data?.[0]
    const t    = s.targeting ?? {}
    const geos = (t.geo_locations?.countries ?? [])
      .concat(t.geo_locations?.cities?.map((c: any) => c.name) ?? [])
    const interests = (t.flexible_spec ?? []).flatMap((fs: any) =>
      (fs.interests ?? []).map((i: any) => i.name)
    )
    const targeting: AdSetTargeting = {
      ageMin:       t.age_min,
      ageMax:       t.age_max,
      genders:      t.genders,
      geoLocations: geos.length > 0 ? geos : undefined,
      interests:    interests.length > 0 ? interests : undefined,
    }
    return {
      id:             s.id,
      name:           s.name,
      status:         s.status,
      dailyBudget:    s.daily_budget    ? parseInt(s.daily_budget,    10) / 100 : undefined,
      lifetimeBudget: s.lifetime_budget ? parseInt(s.lifetime_budget, 10) / 100 : undefined,
      targeting,
      insights: {
        spend:       parseFloat(ins?.spend ?? '0'),
        impressions: parseInt(ins?.impressions ?? '0', 10),
        linkClicks:  parseInt(ins?.inline_link_clicks ?? '0', 10),
        ctr:         parseFloat(ins?.ctr ?? '0'),
        cpc:         parseFloat(ins?.cost_per_inline_link_click ?? '0'),
        cpm:         parseFloat(ins?.cpm ?? '0'),
        reach:       ins?.reach ? parseInt(ins.reach, 10) : undefined,
      },
    }
  })

  const ads: Ad[] = (adsBody.data ?? []).map((a: any) => {
    const ins = a.insights?.data?.[0]
    const cr  = a.creative ?? {}
    return {
      id:      a.id,
      name:    a.name,
      status:  a.status,
      adsetId: a.adset_id ?? undefined,
      creative: {
        title:        cr.title               ?? undefined,
        body:         cr.body                ?? undefined,
        imageUrl:     cr.image_url           ?? undefined,
        thumbnailUrl: cr.thumbnail_url       ?? undefined,
        callToAction: cr.call_to_action_type ?? undefined,
      },
      insights: {
        spend:       parseFloat(ins?.spend ?? '0'),
        impressions: parseInt(ins?.impressions ?? '0', 10),
        linkClicks:  parseInt(ins?.inline_link_clicks ?? '0', 10),
        ctr:         parseFloat(ins?.ctr ?? '0'),
        cpc:         parseFloat(ins?.cost_per_inline_link_click ?? '0'),
      },
    }
  })

  const ageBreakdowns: AgeBreakdown[] = (ageBody.data ?? [])
    .map((row: any) => ({
      age:         row.age ?? 'desconhecido',
      spend:       parseFloat(row.spend ?? '0'),
      impressions: parseInt(row.impressions ?? '0', 10),
      linkClicks:  parseInt(row.inline_link_clicks ?? row.clicks ?? '0', 10),
    }))
    .sort((a: AgeBreakdown, b: AgeBreakdown) => b.spend - a.spend)

  const geoBreakdowns: GeoBreakdown[] = (geoBody.data ?? [])
    .map((row: any) => ({
      country:     row.country ?? '??',
      spend:       parseFloat(row.spend ?? '0'),
      impressions: parseInt(row.impressions ?? '0', 10),
      reach:       row.reach ? parseInt(row.reach, 10) : undefined,
    }))
    .sort((a: GeoBreakdown, b: GeoBreakdown) => b.spend - a.spend)

  function groupAge(rows: any[], idField: string): Record<string, AgeBreakdown[]> {
    const map: Record<string, AgeBreakdown[]> = {}
    for (const row of rows) {
      const id = row[idField]; if (!id) continue
      map[id] = [...(map[id] ?? []), {
        age:         row.age ?? 'desconhecido',
        spend:       parseFloat(row.spend ?? '0'),
        impressions: parseInt(row.impressions ?? '0', 10),
        linkClicks:  parseInt(row.inline_link_clicks ?? '0', 10),
      }]
    }
    for (const [, items] of Object.entries(map)) items.sort((a, b) => b.spend - a.spend)
    return map
  }

  function groupPlacement(rows: any[], idField: string): Record<string, PlacementBreakdown[]> {
    const map: Record<string, PlacementBreakdown[]> = {}
    for (const row of rows) {
      const id = row[idField]; if (!id) continue
      map[id] = [...(map[id] ?? []), {
        platform:    row.publisher_platform ?? 'unknown',
        position:    row.platform_position  ?? 'unknown',
        spend:       parseFloat(row.spend ?? '0'),
        impressions: parseInt(row.impressions ?? '0', 10),
      }]
    }
    for (const [, items] of Object.entries(map)) items.sort((a, b) => b.spend - a.spend)
    return map
  }

  const adSetAgeBreakdowns       = groupAge(adSetAgeBody.data ?? [], 'adset_id')
  const adSetPlacementBreakdowns = groupPlacement(adSetPosBody.data ?? [], 'adset_id')
  const adAgeBreakdowns          = groupAge(adAgeBody.data ?? [], 'ad_id')
  const adPlacementBreakdowns    = groupPlacement(adPosBody.data ?? [], 'ad_id')

  const dailyInsights: DailyInsight[] = (dailyBody.data ?? []).map((row: any) => {
    const spend = parseFloat(row.spend ?? '0')
    const conversions = row.conversions != null ? parseFloat(row.conversions) : undefined
    const actionVals  = row.action_values as Array<{ action_type: string; value: string }> | undefined
    const roasArr     = row.purchase_roas as Array<{ value: string }> | undefined
    const convValue   = actionVals && actionVals.length > 0
      ? actionVals.filter((a: any) => a.action_type.includes('purchase') || a.action_type.includes('omni_'))
                  .reduce((s: number, a: any) => s + parseFloat(a.value ?? '0'), 0)
      : roasArr && roasArr.length > 0 && spend > 0 ? parseFloat(roasArr[0]?.value ?? '0') * spend : undefined
    const roi = convValue != null && spend > 0 ? (convValue - spend) / spend * 100 : undefined
    return { date: row.date_start, spend, conversions, conversionValue: convValue, roi }
  }).sort((a: DailyInsight, b: DailyInsight) => a.date.localeCompare(b.date))

  let previousPeriod: PreviousPeriod | undefined
  const prow = prevBody?.data?.[0]
  if (prow) {
    const pSpend = parseFloat(prow.spend ?? '0')
    const pRoasArr = prow.purchase_roas as Array<{ value: string }> | undefined
    const pRoas    = pRoasArr && pRoasArr.length > 0 ? parseFloat(pRoasArr[0]?.value ?? '0') : undefined
    const pAvals   = prow.action_values as Array<{ action_type: string; value: string }> | undefined
    const pConvVal = pAvals && pAvals.length > 0
      ? pAvals.filter(a => a.action_type.includes('purchase') || a.action_type.includes('omni_'))
               .reduce((s, a) => s + parseFloat(a.value ?? '0'), 0)
      : pRoas != null && pSpend > 0 ? pRoas * pSpend : undefined
    previousPeriod = {
      spend:              pSpend,
      impressions:        parseInt(prow.impressions ?? '0', 10),
      linkClicks:         parseInt(prow.inline_link_clicks ?? '0', 10),
      linkCtr:            parseFloat(prow.inline_link_click_ctr ?? '0'),
      linkCpc:            parseFloat(prow.cost_per_inline_link_click ?? '0'),
      cpm:                parseFloat(prow.cpm ?? '0'),
      reach:              prow.reach != null ? parseInt(prow.reach, 10) : undefined,
      conversions:        prow.conversions != null ? parseFloat(prow.conversions) : undefined,
      costPerConversion:  prow.cost_per_conversion != null ? parseFloat(prow.cost_per_conversion) : undefined,
      conversionValue:    pConvVal,
    }
  }

  return {
    ok: true,
    data: {
      campaign, adSets, ads, ageBreakdowns, geoBreakdowns,
      adSetAgeBreakdowns, adSetPlacementBreakdowns,
      adAgeBreakdowns, adPlacementBreakdowns,
      dailyInsights, previousPeriod,
    },
  }
}

function normalizeStatus(s: string): string {
  if (s === 'ACTIVE')   return 'ACTIVE'
  if (s === 'PAUSED')   return 'PAUSED'
  if (s === 'ARCHIVED') return 'ARCHIVED'
  return s
}
