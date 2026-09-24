import { timingSafeEqual } from 'crypto'
import type { WhatsAppProvider, WhatsAppConfig, UazapiConfig } from './types'
import { UazapiProvider } from './uazapi'
import { OfficialAPIProvider } from './official'
import { ler } from '@/lib/db'

export function resolveProvider(config: WhatsAppConfig): WhatsAppProvider {
  if (config.provider === 'uazapi')   return new UazapiProvider(config)
  if (config.provider === 'official') return new OfficialAPIProvider(config)
  throw new Error(`Unknown WhatsApp provider: ${(config as any).provider}`)
}

export async function getWhatsAppConfig(tenantId: string): Promise<WhatsAppConfig | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  // ⚠️ Aqui havia um `.maybeSingle()`, que LANÇA quando vem mais de uma linha.
  // Duas configs de WhatsApp ativas no mesmo tenant é estado inválido, mas
  // acontece: nada no banco impede. O resultado era o inbox inteiro cair com
  // erro de PostgREST em vez de simplesmente atender por um dos provedores.
  const { data, error } = await admin
    .from('integration_configs')
    .select('provider, config, updated_at')
    .eq('tenant_id', tenantId)
    .in('provider', ['uazapi', 'official'])
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (error) { console.error('[getWhatsAppConfig]', error.message); return null }
  if (!data || data.length === 0) return null

  // Desempate: vence a conexão mexida por último.
  //
  // Antes era "a oficial sempre ganha", e isso mandava o envio para o provedor
  // errado exatamente quando mais doía: a rede parear a uazapi hoje não tirava
  // do ar uma config `official` de meses atrás, e toda mensagem ia tentar sair
  // por lá. `desativarOutroProvedorWhatsApp` já impede o empate na origem — isto
  // aqui é a segunda linha de defesa, e ela precisa apontar para a conexão que
  // a rede acabou de estabelecer.
  const linha = data[0]!

  return { provider: linha.provider as WhatsAppConfig['provider'], ...(linha.config as object) } as WhatsAppConfig
}

/**
 * De qual rede é este webhook da uazapi?
 *
 * A uazapi ecoa o TOKEN da própria instância no corpo de cada entrega. Como o
 * token é secreto, roteamento e autenticação viram a mesma operação — bem
 * melhor que a Z-API, que mandava um `instanceId` público e exigia um header
 * separado para autenticar (header que, se não configurado, deixava o webhook
 * aberto).
 *
 * ⚠️ Sem filtro `is_active` de propósito: é o evento `connection` que ativa a
 * config, e filtrar aqui descartaria justamente a mensagem que deveria ativá-la.
 */
export async function getTenantByUazapiToken(
  token: string,
): Promise<{ tenantId: string; config: UazapiConfig } | null> {
  if (!token) return null

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('integration_configs')
    .select('tenant_id, config')
    .eq('provider', 'uazapi')

  if (error) { console.error('[getTenantByUazapiToken]', error.message); return null }

  const recebido = Buffer.from(token)
  for (const linha of (data ?? []) as { tenant_id: string; config: Record<string, unknown> | null }[]) {
    const guardado = linha.config?.token
    if (typeof guardado !== 'string' || !guardado) continue

    // Comparação em tempo constante: o token é credencial, não identificador.
    const esperado = Buffer.from(guardado)
    if (esperado.length !== recebido.length) continue
    if (!timingSafeEqual(esperado, recebido)) continue

    return {
      tenantId: linha.tenant_id,
      config:   { provider: 'uazapi', ...(linha.config as object) } as UazapiConfig,
    }
  }
  return null
}

// Lookup tenant by Official WhatsApp phoneNumberId
export async function getTenantByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const data = await ler(admin
    .from('integration_configs')
    .select('tenant_id, config')
    .eq('provider', 'official')
    .eq('is_active', true), 'carregar as integrações')

  type ConfigRow = { tenant_id: string; config: Record<string, unknown> | null }
  const match = (data ?? []).find((r: ConfigRow) => (r.config as any)?.phoneNumberId === phoneNumberId) as ConfigRow | undefined
  return match?.tenant_id ?? null
}
