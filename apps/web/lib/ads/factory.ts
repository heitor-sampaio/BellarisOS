import { createAdminClient } from '@/lib/supabase/admin'
import { MetaAdsProvider } from './meta'
import { GoogleAdsProvider } from './google'
import type { AdsConfig, MetaAdsConfig, GoogleAdsConfig, AdsProvider } from './types'

export async function getAdsConfig(
  tenantId: string,
  provider: 'meta_ads' | 'google_ads'
): Promise<AdsConfig | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('integration_configs')
    .select('provider, config')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return null

  const raw = data.config as Record<string, unknown>

  if (data.provider === 'meta_ads') {
    return {
      provider:     'meta_ads',
      accessToken:  (raw.access_token ?? raw.accessToken) as string,
      adAccountId:  raw.adAccountId as string,
      pixelId:      (raw.pixelId ?? '') as string,
    } satisfies MetaAdsConfig
  }

  return { provider: data.provider, ...raw } as AdsConfig
}

export function resolveAdsProvider(config: AdsConfig): AdsProvider {
  if (config.provider === 'meta_ads') {
    return new MetaAdsProvider(config as MetaAdsConfig)
  }
  return new GoogleAdsProvider(config as GoogleAdsConfig)
}
