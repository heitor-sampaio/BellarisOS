import { createAdminClient } from '@/lib/supabase/admin'
import type { ChannelKind, SendProvider } from './types'
import { MetaMessagingProvider, type MetaMessagingConfig } from '@/lib/meta/messaging'

export interface CanalResolvido {
  provider: SendProvider
  /** Qual provedor atendeu — entra em `messages.provider` e decide a janela. */
  nome:     string
}

/**
 * Como enviar neste canal, para esta rede.
 *
 * É o único lugar que decide isso. `sendMessage` tinha um `if` com forma de
 * WhatsApp e um `else` que marcava a mensagem como "enviada" sem enviar —
 * responder um Instagram dava "enviado" e o cliente nunca recebia.
 *
 * Devolve `null` quando a rede não conectou o canal. Quem chama tem que tratar
 * como erro, não como sucesso.
 */
export async function resolverCanal(
  tenantId: string,
  channel: ChannelKind,
): Promise<CanalResolvido | null> {
  if (channel === 'whatsapp') {
    const { getWhatsAppConfig, resolveProvider } = await import('@/lib/whatsapp/factory')
    const config = await getWhatsAppConfig(tenantId)
    if (!config) return null
    return { provider: resolveProvider(config), nome: config.provider }
  }

  if (channel === 'instagram' || channel === 'messenger') {
    const config = await getMetaMessagingConfig(tenantId)
    const page = config?.pages.find(p => p.pageId === config.activePageId)
    if (!page) return null

    // Instagram só responde se a página tiver conta profissional ligada.
    if (channel === 'instagram' && !page.igUserId) return null

    return { provider: new MetaMessagingProvider(page, channel), nome: 'meta_messaging' }
  }

  // `manual` e `email` não têm para onde enviar: a mensagem fica só registrada.
  return null
}

export async function getMetaMessagingConfig(
  tenantId: string,
): Promise<MetaMessagingConfig | null> {
  const { data, error } = await createAdminClient()
    .from('integration_configs')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'meta_messaging')
    .eq('is_active', true)
    .maybeSingle()

  if (error) { console.error('[getMetaMessagingConfig]', error.message); return null }
  if (!data) return null
  return { provider: 'meta_messaging', ...(data.config as object) } as MetaMessagingConfig
}

/**
 * De qual rede é esta página (ou conta do Instagram)?
 *
 * O webhook da Meta chega sem dizer o tenant — a única pista é o id da página
 * ou da conta IG que recebeu a mensagem.
 */
export async function getTenantPorPagina(
  id: string,
): Promise<{ tenantId: string; config: MetaMessagingConfig } | null> {
  const { data, error } = await createAdminClient()
    .from('integration_configs')
    .select('tenant_id, config')
    .eq('provider', 'meta_messaging')
    .eq('is_active', true)

  if (error) { console.error('[getTenantPorPagina]', error.message); return null }

  for (const row of (data ?? []) as { tenant_id: string; config: Record<string, unknown> }[]) {
    const config = { provider: 'meta_messaging', ...(row.config as object) } as MetaMessagingConfig
    const achou = (config.pages ?? []).some(
      p => p.pageId === id || p.igUserId === id,
    )
    if (achou) return { tenantId: row.tenant_id, config }
  }
  return null
}

/**
 * Quais canais esta rede tem realmente conectados.
 *
 * Serve para a tela avisar que o canal não está configurado ANTES de a pessoa
 * escrever. Antes o aviso aparecia em toda conversa que não fosse nota, mesmo
 * com o WhatsApp funcionando, e dizia que a mensagem seria "salva
 * internamente" — o que deixou de ser verdade: hoje o envio falha com erro.
 */
export async function canaisConectados(tenantId: string): Promise<ChannelKind[]> {
  const [whatsapp, meta] = await Promise.all([
    import('@/lib/whatsapp/factory').then(m => m.getWhatsAppConfig(tenantId)),
    getMetaMessagingConfig(tenantId),
  ])

  const canais: ChannelKind[] = []
  if (whatsapp) canais.push('whatsapp')

  const page = meta?.pages.find(p => p.pageId === meta.activePageId)
  if (page) {
    canais.push('messenger')
    if (page.igUserId) canais.push('instagram')
  }
  return canais
}
