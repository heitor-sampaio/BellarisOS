'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ZAPIConfig } from '@/lib/whatsapp/types'
import {
  criarInstancia, cancelarInstancia, qrCodeDaInstancia, statusDaInstancia,
  dispositivoDaInstancia, desconectarInstancia, codigoDePareamento,
} from '@/lib/whatsapp/zapi-partner'

/**
 * Conexão de WhatsApp gerenciada pelo BellarisOS.
 *
 * A rede não precisa de conta na Z-API: a instância nasce na nossa, e a clínica
 * só escaneia o QR. O formulário manual continua existindo para quem já tem
 * conta própria e não quer migrar.
 */

/**
 * Teto de instâncias por token de integrador.
 *
 * A Z-API libera 25 por token e pedir outro é manual. Avisar ANTES de bater o
 * limite evita a próxima rede a entrar simplesmente não conseguir conectar, com
 * um erro que ninguém liga ao teto.
 */
const TETO_POR_TOKEN = 25
const AVISAR_A_PARTIR_DE = 20

export interface EstadoConexaoZapi {
  /** O recurso está disponível nesta instalação (token de parceiro no ambiente). */
  disponivel:   boolean
  gerenciada:   boolean
  conectada:    boolean
  aguardandoQr: boolean
  phone:        string | null
  name:         string | null
  /** Aparelho fora de alcance: conectado, mas nada sai. */
  celularOffline: boolean
  trialDue:     number | null
  erro:         string | null
  /** Quantas instâncias gerenciadas existem nesta instalação, e o teto. */
  usadas:       number
  teto:         number
}

async function configDaRede(tenantId: string): Promise<ZAPIConfig | null> {
  const { data, error } = await createAdminClient()
    .from('integration_configs')
    .select('config, is_active')
    .eq('tenant_id', tenantId)
    .eq('provider', 'zapi')
    .maybeSingle()

  if (error) { console.error('[zapi-connection] config:', error.message); return null }
  if (!data?.config) return null
  return { provider: 'zapi', ...(data.config as object) } as ZAPIConfig
}

/** Quantas instâncias gerenciadas já existem — conta TODAS as redes. */
async function instanciasEmUso(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('integration_configs')
    .select('config')
    .eq('provider', 'zapi')

  if (error) { console.error('[zapi-connection] contagem:', error.message); return 0 }
  return (data ?? []).filter(r => (r.config as Record<string, unknown>)?.managed === true).length
}

export async function getEstadoConexaoZapi(): Promise<EstadoConexaoZapi> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const base: EstadoConexaoZapi = {
    disponivel:     !!process.env.ZAPI_PARTNER_TOKEN,
    gerenciada:     false,
    conectada:      false,
    aguardandoQr:   false,
    phone:          null,
    name:           null,
    celularOffline: false,
    trialDue:       null,
    erro:           null,
    usadas:         0,
    teto:           TETO_POR_TOKEN,
  }

  const config = await configDaRede(ctx.tenantId!)
  if (!config?.managed) return { ...base, usadas: await instanciasEmUso() }

  base.gerenciada = true
  base.trialDue   = config.trialDue ?? null
  base.usadas     = await instanciasEmUso()

  // A verdade sobre o pareamento está na Z-API, não no nosso banco: o celular
  // pode ter sido desligado do WhatsApp Web sem passar por aqui.
  try {
    const status = await statusDaInstancia(config.instanceId, config.token)
    base.conectada      = status.connected
    base.aguardandoQr   = !status.connected
    base.celularOffline = status.connected && !status.smartphoneConnected
    base.erro           = status.error

    if (status.connected) {
      const device = await dispositivoDaInstancia(config.instanceId, config.token)
      base.phone = device?.phone ?? config.connectedPhone ?? null
      base.name  = device?.name  ?? config.connectedName  ?? null
    }
  } catch (e) {
    base.erro = e instanceof Error ? e.message : 'Falha ao consultar a Z-API'
    base.aguardandoQr = true
  }

  return base
}

/**
 * Cria a instância desta rede.
 *
 * Guarda a config ANTES de qualquer outra coisa: instância criada e não gravada
 * é uma cobrança órfã na nossa fatura, sem ninguém para associar.
 */
export async function criarConexaoZapi(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const admin = createAdminClient()

  if (!process.env.ZAPI_PARTNER_TOKEN) {
    return { ok: false, error: 'Conexão gerenciada indisponível nesta instalação.' }
  }

  const atual = await configDaRede(ctx.tenantId!)
  if (atual?.managed && atual.instanceId) {
    return { ok: false, error: 'Esta rede já tem uma conexão gerenciada.' }
  }

  const usadas = await instanciasEmUso()
  if (usadas >= TETO_POR_TOKEN) {
    return {
      ok: false,
      error: `Limite de ${TETO_POR_TOKEN} conexões deste token atingido. Solicite um novo token de integrador à Z-API.`,
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return { ok: false, error: 'NEXT_PUBLIC_APP_URL não configurada — sem ela o webhook nasceria apontando para lugar nenhum.' }
  }

  // O nome aparece no painel da Z-API. Com o tenant no nome, achar de quem é
  // uma instância na hora de cancelar deixa de ser adivinhação.
  const { data: tenant } = await admin
    .from('tenants').select('name').eq('id', ctx.tenantId!).maybeSingle()
  const nome = `${(tenant as { name: string } | null)?.name ?? 'Rede'} (${ctx.tenantId!.slice(0, 8)})`

  let criada
  try {
    criada = await criarInstancia(nome, `${appUrl}/api/webhooks/zapi`)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao criar a instância.' }
  }

  const config: Omit<ZAPIConfig, 'provider'> = {
    instanceId: criada.id,
    token:      criada.token,
    managed:    true,
    trialDue:   criada.due,
  }

  const { error } = await admin
    .from('integration_configs')
    .upsert({
      tenant_id:  ctx.tenantId!,
      provider:   'zapi',
      config,
      // Só vira ativa quando o celular parear: ativa sem pareamento faria
      // `resolverCanal` devolver um provedor que não entrega nada.
      is_active:  false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,provider' })

  if (error) {
    // A instância JÁ existe e já está sendo cobrada. Cancelar aqui evita a
    // órfã; se o cancelamento também falhar, o log é a única pista.
    console.error('[criarConexaoZapi] gravar config:', error.message, criada.id)
    try { await cancelarInstancia(criada.id, criada.token) } catch (e) {
      console.error('[criarConexaoZapi] instância órfã na Z-API:', criada.id, e)
    }
    return { ok: false, error: 'Falha ao salvar a conexão. Tente de novo.' }
  }

  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function getQrCodeZapi(): Promise<{
  ok: boolean; qr?: string | null; conectada?: boolean; error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const config = await configDaRede(ctx.tenantId!)
  if (!config?.managed) return { ok: false, error: 'Nenhuma conexão gerenciada nesta rede.' }

  try {
    const status = await statusDaInstancia(config.instanceId, config.token)
    if (status.connected) {
      await marcarConectada(ctx.tenantId!, config)
      return { ok: true, conectada: true, qr: null }
    }
    return { ok: true, conectada: false, qr: await qrCodeDaInstancia(config.instanceId, config.token) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao obter o QR code.' }
  }
}

/** Alternativa ao QR: código digitado no celular. */
export async function getCodigoPareamentoZapi(
  telefone: string,
): Promise<{ ok: boolean; code?: string | null; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < 10) return { ok: false, error: 'Informe o número com DDD.' }

  const config = await configDaRede(ctx.tenantId!)
  if (!config?.managed) return { ok: false, error: 'Nenhuma conexão gerenciada nesta rede.' }

  try {
    return { ok: true, code: await codigoDePareamento(config.instanceId, config.token, digitos) }
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
async function marcarConectada(tenantId: string, config: ZAPIConfig): Promise<void> {
  const device = await dispositivoDaInstancia(config.instanceId, config.token)
  const admin  = createAdminClient()

  const { error } = await admin
    .from('integration_configs')
    .update({
      config: {
        ...config,
        provider: undefined,   // a coluna `provider` já guarda isso
        connectedPhone: device?.phone ?? null,
        connectedName:  device?.name  ?? null,
      },
      is_active:  true,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('provider', 'zapi')

  if (error) console.error('[marcarConectada]', error.message)
  else {
    revalidatePath('/admin/settings')
    revalidatePath('/admin/inbox')
  }
}

/** Desliga o celular, mantendo a instância (e a cobrança) de pé. */
export async function desconectarZapi(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const config = await configDaRede(ctx.tenantId!)
  if (!config?.managed) return { ok: false, error: 'Nenhuma conexão gerenciada nesta rede.' }

  try {
    await desconectarInstancia(config.instanceId, config.token)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao desconectar.' }
  }

  const { error } = await createAdminClient()
    .from('integration_configs')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'zapi')

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/settings')
  revalidatePath('/admin/inbox')
  return { ok: true }
}

/**
 * Remove a conexão de vez: cancela na Z-API e apaga a config.
 *
 * A ordem importa. Se apagássemos a config primeiro e o cancelamento falhasse,
 * ficaríamos pagando por uma instância que ninguém mais consegue nem ver.
 */
export async function removerConexaoZapi(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const config = await configDaRede(ctx.tenantId!)
  if (!config?.managed) return { ok: false, error: 'Nenhuma conexão gerenciada nesta rede.' }

  try {
    await cancelarInstancia(config.instanceId, config.token)
  } catch (e) {
    return {
      ok: false,
      error: `A Z-API recusou o cancelamento: ${e instanceof Error ? e.message : 'erro desconhecido'}. `
           + 'A conexão foi mantida para não gerar cobrança sem dono.',
    }
  }

  const { error } = await createAdminClient()
    .from('integration_configs')
    .delete()
    .eq('tenant_id', ctx.tenantId!)
    .eq('provider', 'zapi')

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/settings')
  revalidatePath('/admin/inbox')
  return { ok: true }
}
