export type DatePreset = 'today' | '7d' | '30d' | '90d' | 'all'

export interface DateRange {
  preset: DatePreset
}

export interface Campaign {
  id: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | string
  platform: 'meta' | 'google'
  spend: number
  impressions: number
  clicks: number        // todos os cliques
  ctr: number           // CTR total
  cpc: number           // CPC total
  cpm: number
  linkClicks?: number   // cliques no link (outbound)
  linkCtr?: number      // CTR de link
  linkCpc?: number      // CPC de link
  reach?: number
  conversions?: number
  costPerConversion?: number
  roas?: number
}

export interface AdSetInsights {
  spend:       number
  impressions: number
  linkClicks:  number
  ctr:         number
  cpc:         number
  cpm:         number
  reach?:      number
}

export interface AdSetTargeting {
  ageMin?:      number
  ageMax?:      number
  genders?:     number[]   // 1=male, 2=female
  geoLocations?: string[]
  interests?:   string[]
}

export interface AdSet {
  id:              string
  name:            string
  status:          string
  dailyBudget?:    number
  lifetimeBudget?: number
  targeting:       AdSetTargeting
  insights:        AdSetInsights
}

export interface AdInsights {
  spend:       number
  impressions: number
  linkClicks:  number
  ctr:         number
  cpc:         number
}

export interface Ad {
  id:     string
  name:   string
  status: string
  creative: {
    title?:       string
    body?:        string
    imageUrl?:    string
    thumbnailUrl?: string
    callToAction?: string
  }
  insights: AdInsights
}

export interface CampaignDetail {
  adSets: AdSet[]
  ads:    Ad[]
}

export interface AdsProvider {
  getCampaigns(dateRange: DateRange): Promise<Campaign[]>
  testConnection(): Promise<{ ok: boolean; detail?: string }>
}

export interface MetaAdsConfig {
  provider: 'meta_ads'
  adAccountId: string
  accessToken: string
  pixelId: string
}

export interface GoogleAdsConfig {
  provider: 'google_ads'
  customerId: string
  developerToken: string
  clientId: string
  clientSecret: string
  refreshToken: string
}

export type AdsConfig = MetaAdsConfig | GoogleAdsConfig
