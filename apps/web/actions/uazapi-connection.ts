'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UazapiConfig } from '@/lib/whatsapp/types'
import {
  conexaoGerenciadaDisponivel, criarInstancia, removerInstancia, configurarWebhook,
  definirRitmo, conectarInstancia, statusDaInstancia, desconectarInstancia,
  lerProxy, definirProxy,
} from '@/lib/whatsapp/uazapi-admin'
import { telefoneDoJid } from '@/lib/whatsapp/uazapi'
import { desativarOutroProvedorWhatsApp } from '@/lib/whatsapp/ativacao'
import { integracaoConectada, integracaoDesconectada } from '@/lib/events/integracao'
import { gravar } from '@/lib/db'

/**
 * Conexão de WhatsApp gerenciada pelo BellarisOS.
 *
 * A rede não precisa de conta na uazapi: a instância nasce na nossa, e a clínica
 * só escaneia o QR.
 */

/** 0 = sem teto. A uazapi não documenta limite por admintoken. */
function tetoDeInstancias(): number {
  return Number(process.env.UAZAPI_MAX_INSTANCIAS ?? 0) || 0
}

/**
 * Proxy próprio, quando a instalação contrata IP à parte.
 *
 * Opcional de propósito: toda instância da uazapi já sai por um proxy gerenciado
 * por ela. Forçar um IP contratado sem saber se o interno é dedicado seria gastar
 * por um isolamento que talvez já exista.
 */
function proxyParaTenant(tenantId: string): string | null {
  const template = process.env.UAZAPI_PROXY_TEMPLATE
  if (template) return template.replace(/\{tenant\}/g, tenantId.slice(0, 8))
  return null
}

export interface EstadoConexaoUazapi {
  disponivel:   boolean
  gerenciada:   boolean
  conectada:    boolean
  aguardandoQr: boolean
  phone:        string | null
  name:         string | null
  /** `internal` = IP da uazapi; outro valor = IP contratado por nós. */
  proxyModo:    string | null
  proxyPais:    string | null
  erro:         string | null
  usadas:       number
  teto:         number
}

/**
 * Config da rede + se ela está ativa.
 *
 * `ativa` vem junto porque é o que evita reescrever o banco a cada leitura de
 * estado: sem saber o valor atual, a única forma de "garantir ativo" é gravar
 * sempre — e gravar sempre foi o que pôs a tela em loop.
 */
async function configDaRede(
  tenantId: string,
): Promise<{ config: UazapiConfig; ativa: boolean } | null> {
  const { data, error } = await createAdminClient()
    .from('integration_configs')
    .select('config, is_active')
    .eq('tenant_id', tenantId)
    .eq('provider', 'uazapi')
    .maybeSingle()

  if (error) { console.error('[uazapi-connection] config:', error.message); return null }
  if (!data?.config) return null
  return {
    config: { provider: 'uazapi', ...(data.config as object) } as UazapiConfig,
    ativa:  data.is_active === true,
  }
}

/** Quantas instâncias gerenciadas existem — conta TODAS as redes. */
async function instanciasEmUso(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('integration_configs')
    .select('config')
    .eq('provider', 'uazapi')

  if (error) { console.error('[uazapi-connection] contagem:', error.message); return 0 }
  return (data ?? []).filter(r => (r.config as Record<string, unknown>)?.managed === true).length
}

/** Base desta instância; cai no env só para config antiga sem `baseUrl`. */
function baseDa(config: UazapiConfig): string {
  return (config.baseUrl ?? process.env.UAZAPI_BASE_URL ?? '').replace(/\/$/, '')
}

export async function getEstadoConexaoUazapi(): Promise<EstadoConexaoUazapi> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const base: EstadoConexaoUazapi = {
    disponivel:   conexaoGerenciadaDisponivel(),
    gerenciada:   false,
    conectada:    false,
    aguardandoQr: false,
    phone:        null,
    name:         null,
    proxyModo:    null,
    proxyPais:    null,
    erro:         null,
    usadas:       0,
    teto:         tetoDeInstancias(),
  }

  const registro = await configDaRede(ctx.tenantId!)
  const config   = registro?.config
  if (!config?.managed) return { ...base, usadas: await instanciasEmUso() }

  base.gerenciada = true
  base.usadas     = await instanciasEmUso()

  // A verdade sobre o pareamento está na uazapi: o celular pode ter sido
  // desligado do WhatsApp Web sem passar por aqui.
  try {
    const status = await statusDaInstancia(baseDa(config), config.token)
    base.conectada    = status.connected
    base.aguardandoQr = !status.connected
    base.name         = status.nome ?? config.connectedName ?? null
    base.phone        = telefoneDoJid(status.jid) ?? config.connectedPhone ?? null

    // ⚠️ Esta função é LEITURA, chamada em polling. Ela só escreve quando o banco
    // realmente diverge da uazapi, e nunca revalida rota.
    //
    // Antes ela chamava `marcarConectada` a cada passagem, e `marcarConectada`
    // fazia `revalidatePath('/admin/settings')` — a própria rota que acabara de
    // pedir o estado. O retorno da Server Action vinha com a árvore invalidada,
    // o componente remontava, pedia o estado de novo, e a tela ficava piscando
    // para sempre, com uma escrita no banco e duas chamadas à uazapi por volta.
    const precisaAtivar   = status.connected && !registro!.ativa
    const dadosMudaram    = status.connected
      && (config.connectedPhone !== base.phone || config.connectedName !== base.name)
    if (precisaAtivar || dadosMudaram) {
      await marcarConectada(ctx.tenantId!, config, base.phone, base.name, ctx)
    }

    const proxy = await lerProxy(baseDa(config), config.token)
    base.proxyModo = proxy?.modo ?? null
    base.proxyPais = proxy?.pais ?? null
  } catch (e) {
    base.erro = e instanceof Error ? e.message : 'Falha ao consultar a uazapi'
    base.aguardandoQr = true
  }

  return base
}

/**
 * Cria a instância desta rede.
 *
 * A ordem carrega o argumento: a config é gravada logo depois de criar, porque
 * instância criada e não gravada é cobrança sem ninguém para associar.
 */
export async function criarConexaoUazapi(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const admin = createAdminClient()

  if (!conexaoGerenciadaDisponivel()) {
    return { ok: false, error: 'Conexão gerenciada indisponível nesta instalação.' }
  }

  const atual = (await configDaRede(ctx.tenantId!))?.config
  if (atual?.managed && atual.token) {
    return { ok: false, error: 'Esta rede já tem uma conexão gerenciada.' }
  }

  const teto = tetoDeInstancias()
  if (teto > 0 && (await instanciasEmUso()) >= teto) {
    return { ok: false, error: `Limite de ${teto} conexões atingido nesta instalação.` }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return { ok: false, error: 'NEXT_PUBLIC_APP_URL não configurada — o webhook nasceria apontando para lugar nenhum.' }
  }

  // O nome aparece no painel da uazapi. Com o tenant nele, achar de quem é uma
  // instância na hora de remover deixa de ser adivinhação.
  const { data: tenant } = await admin
    .from('tenants').select('name').eq('id', ctx.tenantId!).maybeSingle()
  const nome = `${(tenant as { name: string } | null)?.name ?? 'Rede'}-${ctx.tenantId!.slice(0, 8)}`
    .replace(/[^a-zA-Z0-9-]+/g, '-').toLowerCase()

  let criada
  try {
    criada = await criarInstancia(nome)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao criar a instância.' }
  }

  const base = (process.env.UAZAPI_BASE_URL ?? '').replace(/\/$/, '')
  const config: Omit<UazapiConfig, 'provider'> = {
    token:        criada.token,
    instanceId:   criada.instanceId,
    instanceName: criada.instanceName,
    baseUrl:      base,
    managed:      true,
  }

  const { error } = await admin
    .from('integration_configs')
    .upsert({
      tenant_id:  ctx.tenantId!,
      provider:   'uazapi',
      config,
      // Só vira ativa quando o celular parear: ativa sem pareamento faria
      // `resolverCanal` devolver um provedor que não entrega nada.
      is_active:  false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,provider' })

  if (error) {
    console.error('[criarConexaoUazapi] gravar config:', error.message, criada.instanceId)
    try { await removerInstancia(base, criada.token) } catch (e) {
      console.error('[criarConexaoUazapi] instância órfã na uazapi:', criada.instanceId, e)
    }
    return { ok: false, error: 'Falha ao salvar a conexão. Tente de novo.' }
  }

  // Webhook é passo separado na uazapi. Sem ele a instância conecta, a tela diz
  // "conectado" e nenhuma mensagem chega.
  try {
    await configurarWebhook(base, criada.token, `${appUrl}/api/webhooks/uazapi`)
    await gravar(admin.from('integration_configs')
      .update({ config: { ...config, webhookAppliedAt: new Date().toISOString() } })
      .eq('tenant_id', ctx.tenantId!).eq('provider', 'uazapi'), 'salvar a conexão do WhatsApp')
  } catch (e) {
    console.error('[criarConexaoUazapi] webhook:', e)
    return { ok: false, error: 'Instância criada, mas o webhook falhou. Use "Reparar conexão".' }
  }

  // Ritmo em SEGUNDOS (confirmado: a instância nasce com 1 e 3).
  try { await definirRitmo(base, criada.token, 1, 3) } catch (e) {
    console.error('[criarConexaoUazapi] ritmo:', e)
  }

  // Proxy próprio é opcional — a uazapi já entrega um gerenciado.
  const proxyUrl = proxyParaTenant(ctx.tenantId!)
  if (proxyUrl) {
    try {
      await definirProxy(base, criada.token, proxyUrl)
      await gravar(admin.from('integration_configs')
        .update({ config: { ...config, proxyUrl, proxyAppliedAt: new Date().toISOString() } })
        .eq('tenant_id', ctx.tenantId!).eq('provider', 'uazapi'), 'salvar a conexão do WhatsApp')
    } catch (e) {
      console.error('[criarConexaoUazapi] proxy:', e)
    }
  }

  revalidatePath('/admin/settings')
  return { ok: true }
}

/** Reaplica webhook, ritmo e proxy numa instância que já existe. */
export async function repararConexaoUazapi(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const config = (await configDaRede(ctx.tenantId!))?.config
  if (!config?.managed) return { ok: false, error: 'Nenhuma conexão gerenciada nesta rede.' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return { ok: false, error: 'NEXT_PUBLIC_APP_URL não configurada.' }

  try {
    await configurarWebhook(baseDa(config), config.token, `${appUrl}/api/webhooks/uazapi`)
    await definirRitmo(baseDa(config), config.token, 1, 3)
    const proxyUrl = proxyParaTenant(ctx.tenantId!)
    if (proxyUrl) await definirProxy(baseDa(config), config.token, proxyUrl)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao reparar.' }
  }

  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function getQrCodeUazapi(): Promise<{
  ok: boolean; qr?: string | null; paircode?: string | null; conectada?: boolean; error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const config = (await configDaRede(ctx.tenantId!))?.config
  if (!config?.managed) return { ok: false, error: 'Nenhuma conexão gerenciada nesta rede.' }

  try {
    // `/instance/status` é barato e idempotente; `/instance/connect` é escrita e
    // leva de 5 a 9 segundos. Consultar primeiro evita reiniciar o pareamento a
    // cada volta do polling.
    const status = await statusDaInstancia(baseDa(config), config.token)
    if (status.connected) {
      await marcarConectada(ctx.tenantId!, config, telefoneDoJid(status.jid), status.nome, ctx)
      // Aqui revalidar é correto: é a transição "pareando" → "conectado", que
      // acontece uma vez e encerra o polling. O que não pode revalidar é a
      // leitura de estado, que roda em laço.
      revalidatePath('/admin/settings')
      revalidatePath('/admin/inbox')
      return { ok: true, conectada: true, qr: null }
    }
    if (status.qrcode) return { ok: true, conectada: false, qr: status.qrcode }

    // Sem QR no status: ainda não foi iniciado (ou expirou). Aí sim escreve.
    const par = await conectarInstancia(baseDa(config), config.token)
    return { ok: true, conectada: false, qr: par.qrcode, paircode: par.paircode }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao obter o QR code.' }
  }
}

/** Alternativa ao QR: código digitado no celular. */
export async function getCodigoPareamentoUazapi(
  telefone: string,
): Promise<{ ok: boolean; code?: string | null; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < 10) return { ok: false, error: 'Informe o número com DDD.' }

  const config = (await configDaRede(ctx.tenantId!))?.config
  if (!config?.managed) return { ok: false, error: 'Nenhuma conexão gerenciada nesta rede.' }

  try {
    const par = await conectarInstancia(baseDa(config), config.token, digitos)
    return { ok: true, code: par.paircode }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao gerar o código.' }
  }
}

/**
 * Pareou: ativa a integração e guarda o número.
 *
 * Sem ativar, `getWhatsAppConfig` ignora a config e o inbox segue dizendo que o
 * canal não está conectado, mesmo com o celular pareado.
 */
async function marcarConectada(
  tenantId: string, config: UazapiConfig, phone: string | null, name: string | null,
  ctx?: { tenantId?: string | null; internalUserId?: string | null; userName?: string | null },
): Promise<void> {
  const admin = createAdminClient()

  // Estado antes de escrever: esta função é chamada tanto na transição quanto
  // quando só o número mudou, e o evento tem de sair apenas na TRAVESSIA. Sem
  // isso, o polling do pareamento emitiria "conectada" em cada volta.
  const { data: antes } = await admin
    .from('integration_configs')
    .select('is_active')
    .eq('tenant_id', tenantId)
    .eq('provider', 'uazapi')
    .maybeSingle()

  // `provider` mora na coluna, não no jsonb. Removido explicitamente em vez de
  // gravar `undefined` e confiar no acaso da serialização.
  const { provider: _ignorado, ...semProvider } = config

  const { error } = await admin
    .from('integration_configs')
    .update({
      config:     { ...semProvider, connectedPhone: phone, connectedName: name },
      is_active:  true,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('provider', 'uazapi')

  if (error) { console.error('[marcarConectada]', error.message); return }

  // Ativar a uazapi sem desativar a `official` deixava as duas ativas, e o envio
  // saía pela oficial — que a rede tinha configurado mas não usa.
  await desativarOutroProvedorWhatsApp(tenantId, 'uazapi')

  if (!antes?.is_active) {
    // O ator é quem está na tela — os dois caminhos que chegam aqui, o QR e o
    // polling do estado, rodam autenticados. O `ctx` é opcional só para um
    // chamador futuro que não tenha um; ali o ator vira sistema, que é a
    // verdade.
    await integracaoConectada('uazapi', ctx ?? { tenantId }, phone ?? name)
  }

  // Sem `revalidatePath` aqui: quem chama decide. Esta função roda dentro de
  // leituras em polling, e revalidar a rota que pediu a leitura é o que fazia a
  // tela piscar sem parar.
}

/** Desliga o celular, mantendo a instância de pé. */
export async function desconectarUazapi(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const config = (await configDaRede(ctx.tenantId!))?.config
  if (!config?.managed) return { ok: false, error: 'Nenhuma conexão gerenciada nesta rede.' }

  try {
    await desconectarInstancia(baseDa(config), config.token)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao desconectar.' }
  }

  const { error } = await createAdminClient()
    .from('integration_configs')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'uazapi')

  if (error) return { ok: false, error: error.message }

  await integracaoDesconectada('uazapi', ctx, 'pedido')

  revalidatePath('/admin/settings')
  revalidatePath('/admin/inbox')
  return { ok: true }
}

/**
 * Remove de vez: apaga na uazapi e limpa a config.
 *
 * A ordem importa. Se apagássemos a config primeiro e a remoção falhasse,
 * ficaríamos pagando por uma instância que ninguém mais consegue nem ver.
 */
export async function removerConexaoUazapi(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const config = (await configDaRede(ctx.tenantId!))?.config
  if (!config?.managed) return { ok: false, error: 'Nenhuma conexão gerenciada nesta rede.' }

  try {
    await removerInstancia(baseDa(config), config.token)
  } catch (e) {
    return {
      ok: false,
      error: `A uazapi recusou remover: ${e instanceof Error ? e.message : 'erro desconhecido'}. `
           + 'A conexão foi mantida para não gerar cobrança sem dono.',
    }
  }

  const { error } = await createAdminClient()
    .from('integration_configs')
    .delete()
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'uazapi')

  if (error) return { ok: false, error: error.message }

  // `removida` e não `pedido`: desligar o celular e apagar a instância levam ao
  // mesmo "não está mais no ar", mas só um deles é reversível apertando um
  // botão — e é isso que a automação de aviso precisa distinguir.
  await integracaoDesconectada('uazapi', ctx, 'removida')

  revalidatePath('/admin/settings')
  revalidatePath('/admin/inbox')
  return { ok: true }
}
