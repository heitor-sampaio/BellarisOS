'use server'

import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { WhatsAppConfig } from '@/lib/whatsapp/types'
import { desativarOutroProvedorWhatsApp } from '@/lib/whatsapp/ativacao'
import { integracaoConectada, integracaoDesconectada } from '@/lib/events/integracao'

export interface IntegrationConfig {
  id:         string
  provider:   string
  config:     Record<string, unknown>
  is_active:  boolean
  updated_at: string
}

export async function getIntegrations(): Promise<IntegrationConfig[]> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('integration_configs')
    .select('id, provider, config, is_active, updated_at')
    .eq('tenant_id', ctx.tenantId!)
    .order('provider')

  // Erro descartado aqui faria a tela dizer "Não configurado" com tudo conectado.
  if (error) throw new Error(`Falha ao carregar as integrações: ${error.message}`)

  return (data ?? []) as IntegrationConfig[]
}

export async function saveWhatsAppConfig(
  provider:  WhatsAppConfig['provider'],
  config:    Record<string, string>,
  isActive:  boolean,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  // Remove empty strings to keep config clean
  const cleanConfig = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v.trim() !== '')
  )

  const admin = createAdminClient()

  // Estado anterior, para o evento sair só na TRAVESSIA. Este formulário também
  // é usado para corrigir uma credencial com a integração já no ar, e emitir
  // "conectada" a cada salvamento faria a corrente contar uma reconexão que não
  // houve.
  const { data: anterior } = await admin
    .from('integration_configs')
    .select('is_active')
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', provider)
    .maybeSingle()

  const { error } = await admin
    .from('integration_configs')
    .upsert({
      tenant_id:  ctx.tenantId!,
      provider,
      config:     cleanConfig,
      is_active:  isActive,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,provider' })

  if (error) return { ok: false, error: error.message }

  // Ativar um provedor de WhatsApp desativa o outro. A regra mora num lugar só
  // porque há três caminhos que ativam: este formulário, o pareamento e o evento
  // de conexão do webhook — e por um tempo só este aqui cumpria.
  if (isActive) await desativarOutroProvedorWhatsApp(ctx.tenantId!, provider)

  // Na API oficial, guardar as credenciais com `is_active` É conectar — não há
  // pareamento nem handshake depois disso. O rótulo é o id do número (nunca o
  // token): é por ele que se reconhece qual linha está no ar.
  if (isActive !== (anterior?.is_active ?? false)) {
    await (isActive
      ? integracaoConectada(provider, ctx, cleanConfig.phoneNumberId ?? null)
      : integracaoDesconectada(provider, ctx, 'pedido'))
  }

  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function testWhatsAppConnection(
  provider: WhatsAppConfig['provider'],
): Promise<{ ok: boolean; detail?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const { getWhatsAppConfig, resolveProvider } = await import('@/lib/whatsapp/factory')
  const config = await getWhatsAppConfig(ctx.tenantId!)

  if (!config) return { ok: false, detail: 'Configuração não encontrada ou não ativa' }
  if (config.provider !== provider) return { ok: false, detail: 'Provedor ativo diferente' }

  const prov = resolveProvider(config)
  return prov.testConnection()
}

// --- Ads integrations ---------------------------------------------------------

export async function saveAdsConfig(
  provider: 'meta_ads' | 'google_ads',
  config: Record<string, string>,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const cleanConfig = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v.trim() !== '')
  )

  const admin = createAdminClient()
  const { error } = await admin
    .from('integration_configs')
    .upsert({
      tenant_id:  ctx.tenantId!,
      provider,
      config:     cleanConfig,
      is_active:  isActive,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,provider' })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/settings')
  revalidatePath('/admin/marketing')
  return { ok: true }
}

export async function testAdsConnection(
  provider: 'meta_ads' | 'google_ads',
): Promise<{ ok: boolean; detail?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const { getAdsConfig, resolveAdsProvider } = await import('@/lib/ads/factory')
  const config = await getAdsConfig(ctx.tenantId!, provider)

  if (!config) return { ok: false, detail: 'Configuração não encontrada ou não ativa' }
  return resolveAdsProvider(config).testConnection()
}

// --- Meta Ads OAuth -----------------------------------------------------------

export async function confirmMetaAdsSelection(
  adAccountId: string,
  pixelId: string,
  adAccountName?: string,
  pixelName?: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('integration_configs')
    .select('config')
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_ads')
    .single()

  if (!existing?.config) return { ok: false, error: 'Reconecte com o Facebook primeiro' }

  const prev = existing.config as Record<string, unknown>

  const { error } = await admin
    .from('integration_configs')
    .update({
      config: {
        access_token:    prev.access_token,
        meta_user_name:  prev.meta_user_name ?? '',
        adAccountId,
        adAccountName:   adAccountName ?? '',
        pixelId,
        pixelName:       pixelName ?? '',
      },
      is_active:  true,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_ads')

  if (error) return { ok: false, error: error.message }

  // O OAuth sozinho não conecta nada: sem conta de anúncio e pixel escolhidos,
  // a CAPI não tem para onde mandar evento. É ESTE passo que põe no ar.
  await integracaoConectada('meta_ads', ctx, adAccountName || adAccountId)

  revalidatePath('/admin/settings')
  revalidatePath('/admin/marketing')
  return { ok: true }
}

export async function fetchMetaAdAccounts(): Promise<{
  ok: boolean
  adAccounts?: Array<{ id: string; name: string }>
  pixels?: Array<{ id: string; name: string }>
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()
  const { data } = await admin
    .from('integration_configs')
    .select('config')
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_ads')
    .single()

  const token = (data?.config as Record<string, unknown>)?.access_token as string | undefined
  if (!token) return { ok: false, error: 'Token não encontrado. Reconecte com o Facebook.' }

  const GRAPH = 'https://graph.facebook.com/v25.0'

  try {
    const [acctRes, pixRes] = await Promise.all([
      fetch(`${GRAPH}/me/adaccounts?fields=id,name,account_status&limit=200&access_token=${token}`),
      fetch(`${GRAPH}/me/adspixels?fields=id,name&limit=200&access_token=${token}`),
    ])

    const acctData = await acctRes.json() as { data?: Array<{ id: string; name: string }>; error?: { message: string } }
    if (acctData.error) return { ok: false, error: acctData.error.message }

    const pixData = await pixRes.json() as { data?: Array<{ id: string; name: string }> }

    const adAccounts = (acctData.data ?? []).map(a => ({ id: a.id.replace('act_', ''), name: a.name }))
    const pixels = new Map<string, string>()
    for (const p of pixData.data ?? []) pixels.set(p.id, p.name)

    // `/me/adspixels` lista o que está pendurado no USUÁRIO. Pixel que pertence
    // ao Business Manager — o caso normal de quem tem agência — não aparece
    // ali, e a clínica terminava conectada SEM pixel, com a API de Conversões
    // calada e nenhuma mensagem dizendo por quê. Perguntar também a cada conta
    // de anúncios cobre esse caso, que é o comum.
    await Promise.all(adAccounts.slice(0, 10).map(async a => {
      try {
        const r = await fetch(`${GRAPH}/act_${a.id}/adspixels?fields=id,name&limit=50&access_token=${token}`)
        const d = await r.json() as { data?: Array<{ id: string; name: string }> }
        for (const p of d.data ?? []) pixels.set(p.id, p.name)
      } catch { /* conta sem permissão de pixel não invalida o resto */ }
    }))

    return {
      ok: true,
      adAccounts,
      pixels: [...pixels].map(([id, name]) => ({ id, name })),
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function disconnectMetaAds(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()

  const { error } = await admin
    .from('integration_configs')
    .update({
      config:     {},
      is_active:  false,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_ads')

  if (error) return { ok: false, error: error.message }

  await integracaoDesconectada('meta_ads', ctx, 'pedido')

  revalidatePath('/admin/settings')
  revalidatePath('/admin/marketing')
  return { ok: true }
}

// --- Meta Messaging (Instagram Direct + Messenger) ----------------------------

export interface MetaPageOption {
  pageId:     string
  pageName:   string
  igUserId:   string | null
  igUsername: string | null
}

/** Páginas já trazidas pelo OAuth, sem o token — token de página não vai ao client. */
export async function getMetaPages(): Promise<{
  ok: boolean
  pages?: MetaPageOption[]
  activePageId?: string
  userName?: string
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('integration_configs')
    .select('config')
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_messaging')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data?.config) return { ok: false, error: 'Conecte com o Facebook primeiro' }

  const cfg   = data.config as Record<string, unknown>
  const pages = (cfg.pages ?? []) as Array<Record<string, unknown>>

  return {
    ok: true,
    pages: pages.map(p => ({
      pageId:     p.pageId     as string,
      pageName:   p.pageName   as string,
      igUserId:   (p.igUserId   as string | null) ?? null,
      igUsername: (p.igUsername as string | null) ?? null,
    })),
    activePageId: (cfg.activePageId as string) ?? '',
    userName:     (cfg.meta_user_name as string) ?? '',
  }
}

/** Escolhe a página que vai operar o inbox e ATIVA a integração. */
export async function confirmMetaPageSelection(
  pageId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('integration_configs')
    .select('config')
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_messaging')
    .maybeSingle()

  if (!existing?.config) return { ok: false, error: 'Reconecte com o Facebook primeiro' }

  const prev  = existing.config as Record<string, unknown>
  const pages = (prev.pages ?? []) as Array<{ pageId: string }>
  if (!pages.some(p => p.pageId === pageId)) {
    return { ok: false, error: 'Página não encontrada na conexão atual' }
  }

  const { error } = await admin
    .from('integration_configs')
    .update({
      config:     { ...prev, activePageId: pageId },
      is_active:  true,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_messaging')

  if (error) return { ok: false, error: error.message }

  // O rótulo é o nome da página, não o id: é assim que ela aparece na tela e
  // numa mensagem de "o Instagram da clínica caiu".
  const pagina = (pages as Array<{ pageId: string; pageName?: string }>)
    .find(p => p.pageId === pageId)
  await integracaoConectada('meta_messaging', ctx, pagina?.pageName ?? pageId)

  revalidatePath('/admin/settings')
  revalidatePath('/admin/inbox')
  return { ok: true }
}

export async function disconnectMetaMessaging(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()
  const { error } = await admin
    .from('integration_configs')
    .update({
      config:     {},
      is_active:  false,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_messaging')

  if (error) return { ok: false, error: error.message }

  await integracaoDesconectada('meta_messaging', ctx, 'pedido')

  revalidatePath('/admin/settings')
  revalidatePath('/admin/inbox')
  return { ok: true }
}
