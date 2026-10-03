'use server'

import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { WhatsAppConfig } from '@/lib/whatsapp/types'
import { integracaoConectada, integracaoDesconectada } from '@/lib/events/integracao'
import { ler } from '@/lib/db'
import { enderecoPublico } from '@/lib/whatsapp/endereco-publico'
import { mascararSegredos, mesclarSegredos } from '@/lib/integracoes/sem-segredo'
import { conectarPeloCadastro } from '@/lib/whatsapp/cadastro-incorporado'
import type { ModoOficial } from '@/lib/whatsapp/modo-oficial'

export interface IntegrationConfig {
  id:         string
  provider:   string
  config:     Record<string, unknown>
  is_active:  boolean
  updated_at: string
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
/**
 * As chaves que a TELA grava em cada provedor — e só elas.
 *
 * O formulário aceitava qualquer chave: quem tinha `settings: MANAGE` gravava
 * um `baseUrl` apontando para onde quisesse, e o servidor fazia a chamada
 * levando o token da caixa (SSRF). Chave fora da lista é descartada.
 */
const CHAVES_DA_CONFIG: Record<WhatsAppConfig['provider'], string[]> = {
  uazapi:   ['token', 'baseUrl'],
  official: ['phoneNumberId', 'accessToken', 'verifyToken', 'appSecret', 'wabaId', 'modo'],
}

export async function salvarNumeroWhatsApp(
  numeroId:  string | null,
  provider:  WhatsAppConfig['provider'],
  config:    Record<string, string>,
  isActive:  boolean,
  // Quem fala pelo número NÃO entra aqui: é `atualizarVinculosDoNumero`, a
  // única escrita em `whatsapp_number_users`.
  extras?:   { rotulo?: string; branchId?: string | null },
): Promise<{ ok: boolean; numeroId?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()

  // Estado anterior, para o evento sair só na TRAVESSIA. Este formulário também
  // é usado para corrigir uma credencial com a integração já no ar, e emitir
  // "conectada" a cada salvamento faria a corrente contar uma reconexão que não
  // houve.
  const anterior = numeroId
    ? await ler(admin
        .from('whatsapp_numbers')
        .select('id, is_active, label, config')
        .eq('id', numeroId)
        .eq('tenant_id', ctx.tenantId!)
        .maybeSingle(), 'buscar a caixa de WhatsApp')
    : null

  if (numeroId && !anterior) return { ok: false, error: 'Conexão não encontrada nesta rede.' }

  // Só as chaves do provedor, e sem string vazia. O segredo que a tela
  // recebeu mascarado volta como marcador: vale o que está no banco.
  const permitidas = CHAVES_DA_CONFIG[provider] ?? []
  const cleanConfig = mesclarSegredos(Object.fromEntries(
    Object.entries(config).filter(([k, v]) => permitidas.includes(k) && typeof v === 'string' && v.trim() !== '')
  ) as Record<string, string>, (anterior?.config ?? null) as Record<string, unknown> | null)
  if (cleanConfig.baseUrl && !enderecoPublico(cleanConfig.baseUrl)) {
    return { ok: false, error: 'O endereço do servidor precisa ser público e começar com https://.' }
  }

  // A caixa conectada pelo cadastro incorporado tem o token de negócio que a
  // Meta emitiu — e a tela nem o recebe (`listarNumerosWhatsApp`). Gravar o
  // formulário manual por cima apagaria a credencial: o que muda por aqui é só
  // ligar e desligar; para trocar de conta, conecta-se de novo pela Meta.
  const configAnterior = (anterior?.config ?? {}) as Record<string, unknown>
  if (configAnterior.conexao === 'cadastro_incorporado') {
    const { error } = await admin.from('whatsapp_numbers')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', anterior!.id as string)
    if (error) return { ok: false, error: error.message }
    if (isActive !== (anterior?.is_active ?? false)) {
      await (isActive
        ? integracaoConectada(provider, ctx, anterior!.label as string, anterior!.id as string)
        : integracaoDesconectada(provider, ctx, 'pedido', anterior!.label as string, anterior!.id as string))
    }
    revalidatePath('/admin/settings')
    return { ok: true, numeroId: anterior!.id as string }
  }

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
 * `config` vai SEM credencial: o segredo guardado vira o marcador
 * `SEGREDO_GUARDADO` (`lib/integracoes/sem-segredo.ts`), e salvar com ele
 * mantém o do banco (`mesclarSegredos` em `salvarNumeroWhatsApp`). Até
 * 2026-10-03 o token ia inteiro para a tela.
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
  userIds:   string[]
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
    branchId: n.branchId, userIds: n.userIds,
    wabaId: n.wabaId, phoneNumberId: n.phoneNumberId,
    config: mascararSegredos(semSegredoDoCadastro(n.config as unknown as Record<string, unknown>)),
  }))
}

/**
 * A caixa do cadastro incorporado não tem formulário: o token de negócio e o
 * PIN ficam no servidor. (As de credencial colada à mão ainda levam a config
 * inteira — ver o aviso em `NumeroNaTela`.)
 */
function semSegredoDoCadastro(config: Record<string, unknown>): Record<string, unknown> {
  if (config.conexao !== 'cadastro_incorporado') return config
  const resto = { ...config }
  delete resto.accessToken
  delete resto.pin
  return resto
}

/**
 * Conecta um número pelo cadastro incorporado da Meta (Embedded Signup).
 *
 * O navegador manda o que a janela da Meta devolveu: o código (vale 30 s) e os
 * ids da conta e do número. Os ids NÃO são confiados: o servidor troca o código
 * pelo token e confere com ele que o número é daquela conta — ver
 * `lib/whatsapp/cadastro-incorporado.ts`.
 */
export async function conectarWhatsAppPelaMeta(pedido: {
  code:          string
  wabaId:        string
  phoneNumberId: string
  businessId?:   string | null
  modo:          ModoOficial
}): Promise<{ ok: true; numeroId: string; avisos: string[] } | { ok: false; error: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const modo: ModoOficial = pedido?.modo === 'cloud_api' ? 'cloud_api' : 'coexistencia'

  const r = await conectarPeloCadastro(ctx.tenantId!, { ...pedido, modo })
  if (!r.ok) return r

  await integracaoConectada('official', ctx, r.rotulo, r.numeroId)
  revalidatePath('/admin/settings')
  return { ok: true, numeroId: r.numeroId, avisos: r.avisos }
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

/**
 * As chaves que cada integração de anúncio aceita pela tela — como
 * `CHAVES_DA_CONFIG` nas caixas. Qualquer outra era gravada sem pergunta.
 */
const CHAVES_DO_ADS: Record<'meta_ads' | 'google_ads', string[]> = {
  meta_ads:   ['adAccountId', 'accessToken', 'pixelId'],
  google_ads: ['customerId', 'developerToken', 'clientId', 'clientSecret', 'refreshToken'],
}

export async function saveAdsConfig(
  provider: 'meta_ads' | 'google_ads',
  config: Record<string, string>,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const admin = createAdminClient()
  const anterior = await ler(admin
    .from('integration_configs').select('config')
    .eq('tenant_id', ctx.tenantId!).eq('provider', provider).maybeSingle(), 'buscar a integração')

  // O segredo mascarado na tela volta como marcador: vale o do banco.
  const permitidas = CHAVES_DO_ADS[provider] ?? []
  const cleanConfig = mesclarSegredos(Object.fromEntries(
    Object.entries(config).filter(([k, v]) => permitidas.includes(k) && typeof v === 'string' && v.trim() !== '')
  ) as Record<string, string>, (anterior?.config ?? null) as Record<string, unknown> | null)

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

  // `maybeSingle`: rede sem a linha é "reconecte", não erro 500 — com
  // `.single()` o "não achei" virava exceção dentro de `ler`.
  const existing = await ler(admin
    .from('integration_configs')
    .select('config')
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'meta_ads')
    .maybeSingle(), 'buscar a integração')

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
        // Costura do E2E (a Graph falsa): some se não estava lá.
        ...(typeof prev.graphBase === 'string' ? { graphBase: prev.graphBase } : {}),
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
    .maybeSingle(), 'buscar a integração')

  const cfg = (data?.config ?? {}) as Record<string, unknown>
  const token = cfg.access_token as string | undefined
  if (!token) return { ok: false, error: 'Token não encontrado. Reconecte com o Facebook.' }

  // A Graph falsa do E2E (`graphBase`) — fora das chaves que a tela grava.
  const GRAPH = typeof cfg.graphBase === 'string' ? cfg.graphBase.replace(/\/$/, '') : 'https://graph.facebook.com/v25.0'

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
 *
 * `userIds` é a lista INTEIRA de quem fala pelo número (2026-09-27: um número
 * de atendimento, três SDRs). Quem não está nela sai. Cada pessoa continua
 * tendo no máximo um número — senão "por onde ela responde" viraria desempate.
 * Tudo grava numa transação só (`definir_vinculos_do_numero`): são duas
 * tabelas, e salvar o nome sem as pessoas deixaria a tela dizendo "erro" com
 * metade salva.
 */
export async function atualizarVinculosDoNumero(
  numeroId: string,
  dados: { rotulo: string; branchId: string | null; userIds: string[] },
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const admin = createAdminClient()

  const rotulo = dados.rotulo.trim()
  if (!rotulo) return { ok: false, error: 'O nome da conexão não pode ficar vazio.' }
  const userIds = [...new Set(dados.userIds)]

  // Quem já fala por OUTRO número, dito pelo nome. O índice único recusaria de
  // qualquer jeito (e continua sendo a trava), mas com "duplicate key" a
  // pessoa não saberia quem tirar de onde.
  if (userIds.length) {
    const ocupados = await ler(admin
      .from('whatsapp_number_users')
      .select('users(name), whatsapp_numbers(label)')
      .eq('tenant_id', ctx.tenantId!)
      .in('user_id', userIds)
      .neq('whatsapp_number_id', numeroId), 'conferir quem já fala por outro número')
    const primeiro = (ocupados ?? [])[0] as unknown as
      { users: { name: string } | null; whatsapp_numbers: { label: string } | null } | undefined
    if (primeiro) {
      return {
        ok: false,
        error: `${primeiro.users?.name ?? 'Essa pessoa'} já fala por "${primeiro.whatsapp_numbers?.label ?? 'outro número'}". `
          + 'Cada pessoa responde por um número só — tire-a de lá primeiro.',
      }
    }
  }

  // Número, unidade e pessoas são conferidos contra a rede DENTRO da função
  // (chaves compostas com `tenant_id`): id de outra rede não passa.
  const { error } = await admin.rpc('definir_vinculos_do_numero', {
    p_numero:   numeroId,
    p_tenant:   ctx.tenantId!,
    p_label:    rotulo,
    p_branch:   dados.branchId,
    p_usuarios: userIds,
  })

  if (error) {
    if (error.code === 'P0002') return { ok: false, error: 'Conexão não encontrada nesta rede.' }
    if (error.code === '23505') {
      return { ok: false, error: 'Alguém da lista já fala por outro número. Cada pessoa responde por um número só.' }
    }
    if (error.code === '23503') return { ok: false, error: 'Pessoa ou unidade fora desta rede.' }
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

  // Uma leitura que falha não pode virar lista vazia: a tela mostraria o número
  // sem ninguém ligado, e salvar gravaria exatamente isso.
  const [branches, users] = await Promise.all([
    ler(admin.from('branches').select('id, name')
      .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'), 'carregar as unidades'),
    ler(admin.from('users').select('id, name')
      .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'), 'carregar a equipe'),
  ])

  return {
    unidades: (branches ?? []).map(b => ({ id: b.id as string, nome: b.name as string })),
    pessoas:  (users    ?? []).map(u => ({ id: u.id as string, nome: u.name as string })),
  }
}
