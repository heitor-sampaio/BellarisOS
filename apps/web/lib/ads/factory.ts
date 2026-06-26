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
  return { provider: data.provider, ...(data.config as object) } as AdsConfig
}

export function resolveAdsProvider(config: AdsConfig): AdsProvider {
  if (config.provider === 'meta_ads') {
    return new MetaAdsProvider(config as MetaAdsConfig)
  }
  return new GoogleAdsProvider(config as GoogleAdsConfig)
}
