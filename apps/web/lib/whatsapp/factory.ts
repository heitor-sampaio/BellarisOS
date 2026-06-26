import type { WhatsAppProvider, WhatsAppConfig } from './types'
import { ZAPIProvider } from './zapi'
import { OfficialAPIProvider } from './official'

export function resolveProvider(config: WhatsAppConfig): WhatsAppProvider {
  if (config.provider === 'zapi')     return new ZAPIProvider(config)
  if (config.provider === 'official') return new OfficialAPIProvider(config)
  throw new Error(`Unknown WhatsApp provider: ${(config as any).provider}`)
}

export async function getWhatsAppConfig(tenantId: string): Promise<WhatsAppConfig | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const { data } = await admin
    .from('integration_configs')
    .select('provider, config')
    .eq('tenant_id', tenantId)
    .in('provider', ['zapi', 'official'])
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return null
  return { provider: data.provider as WhatsAppConfig['provider'], ...(data.config as object) } as WhatsAppConfig
}

// Lookup tenant by Z-API instanceId (for webhook routing)
export async function getTenantByZAPIInstance(instanceId: string): Promise<string | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const { data } = await admin
    .from('integration_configs')
    .select('tenant_id, config')
    .eq('provider', 'zapi')
    .eq('is_active', true)

  type ConfigRow = { tenant_id: string; config: Record<string, unknown> | null }
  const match = (data ?? []).find((r: ConfigRow) => (r.config as any)?.instanceId === instanceId) as ConfigRow | undefined
  return match?.tenant_id ?? null
}

// Lookup tenant by Official WhatsApp phoneNumberId
export async function getTenantByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const { data } = await admin
    .from('integration_configs')
    .select('tenant_id, config')
    .eq('provider', 'official')
    .eq('is_active', true)

  type ConfigRow = { tenant_id: string; config: Record<string, unknown> | null }
  const match = (data ?? []).find((r: ConfigRow) => (r.config as any)?.phoneNumberId === phoneNumberId) as ConfigRow | undefined
  return match?.tenant_id ?? null
}
