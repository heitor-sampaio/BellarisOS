'use server'

import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { WhatsAppConfig } from '@/lib/whatsapp/types'
import { integracaoConectada, integracaoDesconectada } from '@/lib/events/integracao'
import { ler } from '@/lib/db'

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

/**
 * Salva UMA caixa de WhatsApp.
 *
 * Substituiu `saveWhatsAppConfig(provider, config, isActive)`, que escrevia em
 * `integration_configs` com `onConflict: 'tenant_id,provider'` — ou seja, o
 * segundo número oficial da rede APAGAVA o primeiro.
 *
 * `numeroId` nulo cria uma caixa; preenchido, atualiza aquela linha (conferindo
 * que ela é desta rede, pelo mesmo motivo de `uazapi-connection.ts`).
 */
export async function salvarNumeroWhatsApp(
  numeroId:  string | null,
  provider:  WhatsAppConfig['provider'],
  config:    Record<string, string>,
  isActive:  boolean,
  extras?:   { rotulo?: string; branchId?: string | null; userId?: string | null },
): Promise<{ ok: boolean; numeroId?: string; error?: string }> {
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
  const anterior = numeroId
    ? await ler(admin
        .from('whatsapp_numbers')
        .select('id, is_active, label')
        .eq('id', numeroId)
        .eq('tenant_id', ctx.tenantId!)
        .maybeSingle(), 'buscar a caixa de WhatsApp')
    : null

  if (numeroId && !anterior) return { ok: false, error: 'Conexão não encontrada nesta rede.' }

  const rotulo = extras?.rotulo?.trim()
    || (anterior?.label as string | undefined)
    || cleanConfig.phoneNumberId
    || (provider === 'uazapi' ? 'WhatsApp' : 'WhatsApp Oficial')

  const campos = {
    tenant_id:       ctx.tenantId!,
    provider,
    label:           rotulo,
    config:          cleanConfig,
    phone_number_id: cleanConfig.phoneNumberId ?? null,
    waba_id:         cleanConfig.wabaId ?? null,
    is_active:       isActive,
    ...(extras?.branchId !== undefined ? { branch_id: extras.branchId } : {}),
    ...(extras?.userId   !== undefined ? { user_id:   extras.userId   } : {}),
    updated_at:      new Date().toISOString(),
  }

  const { data, error } = anterior
    ? await admin.from('whatsapp_numbers').update(campos)
        .eq('id', anterior.id as string).select('id').single()
    : await admin.from('whatsapp_numbers').insert(campos).select('id').single()

  if (error) return { ok: false, error: error.message }
  const id = data!.id as string

  // Aqui havia um `desativarOutroProvedorWhatsApp`: ativar um provedor derrubava
  // o outro, porque duas conexões ativas eram estado inválido quando a rede só
  // podia ter um número. Agora é o normal.

  // Na API oficial, guardar as credenciais com `is_active` É conectar — não há
  // pareamento nem handshake depois disso.
  if (isActive !== (anterior?.is_active ?? false)) {
    await (isActive
      ? integracaoConectada(provider, ctx, rotulo, id)
      : integracaoDesconectada(provider, ctx, 'pedido', rotulo, id))
  }

  revalidatePath('/admin/settings')
  return { ok: true, numeroId: id }
}

/**
 * As caixas de WhatsApp da rede, para a tela de integrações.
 *
 * ⚠️ `config` vai junto, com token e `accessToken` dentro, porque é o que o
 * formulário reexibe hoje — `getIntegrations` já fazia exatamente isto para
 * estes provedores, e tirar aqui faria o campo abrir vazio e o salvamento
 * apagar a credencial. **Não é um bom lugar para a credencial estar**, e a tela
 * de números é onde isso deve ser resolvido (campo mascarado + gravação por
 * merge). Trocar agora seria consertar uma coisa quebrando outra.
 */
export interface NumeroNaTela {
  id:        string
  provider:  string
  label:     string
  phone:     string | null
  isActive:  boolean
  isDefault: boolean
  managed:   boolean
  branchId:  string | null
  userId:    string | null
  wabaId:        string | null
  phoneNumberId: string | null
  config:    Record<string, unknown>
}

export async function listarNumerosWhatsApp(): Promise<NumeroNaTela[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const { getNumerosDaRede } = await import('@/lib/whatsapp/factory')
  return (await getNumerosDaRede(ctx.tenantId!)).map(n => ({
    id: n.id, provider: n.provider, label: n.label, phone: n.phone,
    isActive: n.isActive, isDefault: n.isDefault, managed: n.managed,
    branchId: n.branchId, userId: n.userId,
    wabaId: n.wabaId, phoneNumberId: n.phoneNumberId,
    config: n.config as unknown as Record<string, unknown>,
  }))
}

/**
 * Define o padrão da rede.
 *
 * Duas escritas que precisam valer juntas, e o banco tem um índice único parcial
 * que RECUSA dois padrões — então tirar o antigo vem primeiro, senão o `update`
 * do novo falha com 23505 e a rede fica sem padrão nenhum.
 */
export async function definirNumeroPadrao(
  numeroId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const admin = createAdminClient()

  const alvo = await ler(admin
    .from('whatsapp_numbers').select('id')
    .eq('id', numeroId).eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar a caixa de WhatsApp')
  if (!alvo) return { ok: false, error: 'Conexão não encontrada nesta rede.' }

  const { error: erroLimpa } = await admin
    .from('whatsapp_numbers')
    .update({ is_default: false })
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_default', true)
  if (erroLimpa) return { ok: false, error: erroLimpa.message }

  const { error } = await admin
    .from('whatsapp_numbers')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', numeroId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function testWhatsAppConnection(
  provider: WhatsAppConfig['provider'],
): Promise<{ ok: boolean; detail?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const { getNumerosDaRede, resolveProvider } = await import('@/lib/whatsapp/factory')
  const candidatos = (await getNumerosDaRede(ctx.tenantId!))
    .filter(n => n.isActive && n.provider === provider)

  if (candidatos.length === 0) {
    return { ok: false, detail: 'Configuração não encontrada ou não ativa' }
  }
  // Com mais de uma caixa do mesmo provedor, testar "a da rede" não quer dizer
  // nada. O padrão é a única resposta defensável aqui; a tela de números (que
  // testa UMA linha) é quem resolve isso de verdade.
  const numero = candidatos.find(n => n.isDefault) ?? candidatos[0]!

  return resolveProvider(numero.config).testConnection()
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

  const existing = await ler(admin
    .from('integration_configs')
    .select('config')
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_ads')
    .single(), 'buscar a integração')

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
  const data = await ler(admin
    .from('integration_configs')
    .select('config')
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_ads')
    .single(), 'buscar a integração')

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
  const existing = await ler(admin
    .from('integration_configs')
    .select('config')
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_messaging')
    .maybeSingle(), 'buscar a integração')

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

/**
 * Rótulo e vínculos de uma caixa.
 *
 * Separado de `salvarNumeroWhatsApp` porque são coisas de naturezas diferentes:
 * lá se mexe em CREDENCIAL, aqui em como a rede organiza a caixa. Juntar faria
 * quem quer só renomear ter de reenviar o token.
 *
 * `branchId` é RÓTULO (decisão do Heitor, 2026-09-25): serve para a tela
 * agrupar e para relatório. Não entra em RLS nem na escolha de por onde sai, e
 * a conversa continua nascendo com `branch_id` nulo.
 */
export async function atualizarVinculosDoNumero(
  numeroId: string,
  dados: { rotulo?: string; branchId?: string | null; userId?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const admin = createAdminClient()

  const alvo = await ler(admin
    .from('whatsapp_numbers').select('id')
    .eq('id', numeroId).eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar a caixa de WhatsApp')
  if (!alvo) return { ok: false, error: 'Conexão não encontrada nesta rede.' }

  const rotulo = dados.rotulo?.trim()
  if (dados.rotulo !== undefined && !rotulo) {
    return { ok: false, error: 'O nome da conexão não pode ficar vazio.' }
  }

  const { error } = await admin
    .from('whatsapp_numbers')
    .update({
      ...(rotulo ? { label: rotulo } : {}),
      ...(dados.branchId !== undefined ? { branch_id: dados.branchId } : {}),
      ...(dados.userId   !== undefined ? { user_id:   dados.userId   } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', numeroId)

  if (error) {
    // O índice único parcial recusa dois números para o mesmo usuário. Dizer
    // isso é melhor que repassar "duplicate key value violates...".
    if (error.code === '23505') {
      return { ok: false, error: 'Esse usuário já fala por outro número. Um usuário tem uma caixa só.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/admin/settings')
  return { ok: true }
}

/**
 * Remove uma caixa que NÃO é gerenciada por nós.
 *
 * Instância gerenciada sai por `removerConexaoUazapi`, que apaga na uazapi
 * primeiro — apagar a linha aqui deixaria uma instância paga sem dono e sem
 * ninguém que consiga vê-la.
 */
export async function removerNumeroWhatsApp(
  numeroId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const admin = createAdminClient()

  const alvo = await ler(admin
    .from('whatsapp_numbers').select('id, managed, is_default')
    .eq('id', numeroId).eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar a caixa de WhatsApp')
  if (!alvo) return { ok: false, error: 'Conexão não encontrada nesta rede.' }

  if (alvo.managed) {
    return {
      ok: false,
      error: 'Esta conexão é gerenciada: use "Remover conexão", que também apaga a instância.',
    }
  }

  const { error } = await admin.from('whatsapp_numbers').delete().eq('id', numeroId)
  if (error) return { ok: false, error: error.message }

  // Ficar sem padrão é estado que a rede precisa resolver, e o sistema avisa em
  // vez de eleger um sozinho — eleger seria o `data[0]` de novo, com outro nome.
  revalidatePath('/admin/settings')
  revalidatePath('/admin/inbox')
  return { ok: true }
}

/** Unidades e pessoas, para os selects de vínculo da caixa. */
export interface OpcoesDeVinculo {
  unidades: { id: string; nome: string }[]
  pessoas:  { id: string; nome: string }[]
}

export async function opcoesDeVinculoDoNumero(): Promise<OpcoesDeVinculo> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const admin = createAdminClient()

  const [{ data: branches }, { data: users }] = await Promise.all([
    admin.from('branches').select('id, name')
      .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'),
    admin.from('users').select('id, name')
      .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'),
  ])

  return {
    unidades: (branches ?? []).map(b => ({ id: b.id as string, nome: b.name as string })),
    pessoas:  (users    ?? []).map(u => ({ id: u.id as string, nome: u.name as string })),
  }
}
