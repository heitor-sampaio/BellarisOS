import { createAdminClient } from '@/lib/supabase/admin'
import type { ChannelKind, SendProvider } from './types'
import { MetaMessagingProvider, type MetaMessagingConfig } from '@/lib/meta/messaging'

export interface CanalResolvido {
  provider: SendProvider
  /** Qual provedor atendeu — entra em `messages.provider` e decide a janela. */
  nome:     string
  /** `whatsapp_numbers.id`. Nulo nos canais sem caixa própria. */
  numeroId: string | null
  /** Como a rede chama esta caixa. É o que aparece no aviso e nos eventos. */
  rotulo:   string | null
}

/**
 * De onde sai a mensagem.
 *
 * União discriminada, e o parâmetro é OBRIGATÓRIO: não existe mais "a caixa da
 * rede", então cada chamador tem de escrever por que está saindo por aquela
 * linha. Um default significaria `'padrao'` em silêncio — que é como a rede
 * inteira falava por `data[0]` sem ninguém ter decidido isso.
 */
export type EscolhaDeCaixa =
  /** A caixa DESTA conversa. O usuário com número próprio ainda vence. */
  | { tipo: 'conversa'; numeroId: string | null; userId: string | null }
  /** Quem iniciou. Sem número próprio, cai no padrão. */
  | { tipo: 'usuario';  userId: string | null }
  /** O SISTEMA iniciou: automação, campanha, notificação. */
  | { tipo: 'padrao' }

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
  caixa: EscolhaDeCaixa,
): Promise<CanalResolvido | null> {
  if (channel === 'whatsapp') {
    const { resolverNumeroDeSaida, resolveProvider } = await import('@/lib/whatsapp/factory')

    const userId   = caixa.tipo === 'padrao' ? null : caixa.userId
    const daConversa = caixa.tipo === 'conversa' ? caixa.numeroId : null

    const numero = await resolverNumeroDeSaida(tenantId, userId, daConversa)
    if (!numero) return null

    return {
      provider: resolveProvider(numero.config),
      nome:     numero.provider,
      numeroId: numero.id,
      rotulo:   numero.label,
    }
  }

  if (channel === 'instagram' || channel === 'messenger') {
    const config = await getMetaMessagingConfig(tenantId)
    const page = config?.pages.find(p => p.pageId === config.activePageId)
    if (!page) return null

    // Instagram só responde se a página tiver conta profissional ligada.
    if (channel === 'instagram' && !page.igUserId) return null

    return {
      provider: new MetaMessagingProvider(page, channel),
      nome:     'meta_messaging',
      numeroId: null,
      rotulo:   null,
    }
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
/** Uma caixa de WhatsApp, do jeito que a tela precisa dela. */
export interface CaixaDaRede {
  id:        string
  label:     string
  provider:  string
  isDefault: boolean
}

export interface CanaisDaRede {
  canais: ChannelKind[]
  /**
   * As caixas de WhatsApp ATIVAS da rede.
   *
   * Substitui `provedorWhatsApp: string | null`, que era um escalar de REDE e
   * sobrepunha a conversa na hora de decidir a janela de 24h e o botão de
   * editar. Com uazapi e oficial convivendo, esse escalar faria os dois
   * mentirem em metade das conversas — o provedor certo é o da CAIXA daquela
   * conversa, e é por isso que ele agora viaja na própria conversa.
   */
  numeros: CaixaDaRede[]
  /**
   * A caixa DESTE usuário, quando ele tem uma.
   *
   * Resolvida no servidor de propósito: a tela precisa saber por onde ELE vai
   * falar, não de quem é cada caixa da rede. Mandar os vínculos todos para o
   * navegador seria expor a estrutura da equipe para responder uma pergunta
   * sobre uma pessoa só.
   */
  numeroDoUsuario: CaixaDaRede | null
}

export async function canaisConectados(
  tenantId: string,
  /** `users.id` de quem está na tela — não o do auth. */
  userId?: string | null,
): Promise<CanaisDaRede> {
  const [numeros, meta] = await Promise.all([
    import('@/lib/whatsapp/factory').then(m => m.getNumerosDaRede(tenantId)),
    getMetaMessagingConfig(tenantId),
  ])

  const paraTela = (n: { id: string; label: string; provider: string; isDefault: boolean }) => ({
    id: n.id, label: n.label, provider: n.provider, isDefault: n.isDefault,
  })

  const ativos = numeros.filter(n => n.isActive).map(paraTela)

  const doUsuario = userId
    ? numeros.find(n => n.isActive && n.userId === userId)
    : undefined

  const canais: ChannelKind[] = []
  if (ativos.length > 0) canais.push('whatsapp')

  const page = meta?.pages.find(p => p.pageId === meta.activePageId)
  if (page) {
    canais.push('messenger')
    if (page.igUserId) canais.push('instagram')
  }
  return {
    canais,
    numeros: ativos,
    numeroDoUsuario: doUsuario ? paraTela(doUsuario) : null,
  }
}
