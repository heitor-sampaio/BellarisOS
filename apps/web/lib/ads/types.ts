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
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  reach?: number
  conversions?: number
  costPerConversion?: number
  roas?: number
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
