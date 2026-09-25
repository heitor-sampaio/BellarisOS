'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UazapiConfig, NumeroDeWhatsApp } from '@/lib/whatsapp/types'
import {
  conexaoGerenciadaDisponivel, criarInstancia, removerInstancia, configurarWebhook,
  definirRitmo, conectarInstancia, statusDaInstancia, desconectarInstancia,
  lerProxy, definirProxy,
} from '@/lib/whatsapp/uazapi-admin'
import { telefoneDoJid } from '@/lib/whatsapp/uazapi'
import { getNumero, getNumerosDaRede } from '@/lib/whatsapp/factory'
import { integracaoConectada, integracaoDesconectada } from '@/lib/events/integracao'
import { gravar, ler } from '@/lib/db'

/**
 * Conexão de WhatsApp gerenciada pelo BellarisOS.
 *
 * A rede não precisa de conta na uazapi: a instância nasce na nossa, e a clínica
 * só escaneia o QR.
 *
 * ⚠️ **Todo export daqui é um endpoint público.** Enquanto a rede tinha uma
 * conexão só, estas funções eram seguras por acidente: o tenant vinha da sessão
 * e a linha era achada por tenant, então não havia o que forjar. Agora que elas
 * recebem um `numeroId`, o id é controlado por quem chama — e sem
 * `numeroDaRede()` qualquer usuário autenticado de qualquer rede puxaria o QR
 * code, e desconectaria, o WhatsApp de outra clínica. A checagem de posse não é
 * polimento: é o que substitui a segurança que se perdeu.
 */

/** 0 = sem teto. A uazapi não documenta limite por admintoken. */
function tetoDeInstancias(): number {
  return Number(process.env.UAZAPI_MAX_INSTANCIAS ?? 0) || 0
}

/**
 * Teto POR REDE.
 *
 * Existe porque o guard "uma conexão gerenciada por rede" foi removido — ele é
 * incompatível com múltiplos números. Só que aquele guard também servia de
 * idempotência: sem nada no lugar, cada clique em "criar" nasce uma instância
 * **cobrada**. O risco aqui é dinheiro real, e um teto é barato.
 */
function tetoPorRede(): number {
  return Number(process.env.UAZAPI_MAX_POR_REDE ?? 5) || 5
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
  /** A caixa a que este estado se refere. A tela usa para as demais chamadas. */
  numeroId:     string | null
  rotulo:       string | null
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
 * A caixa, CONFIRMADA como sendo desta rede.
 *
 * Nunca aceite o id cru vindo do cliente. Este é o guarda de todas as funções
 * abaixo, e a razão de ele existir está no cabeçalho do arquivo.
 */
async function numeroDaRede(
  tenantId: string, numeroId: string,
): Promise<NumeroDeWhatsApp | null> {
  const numero = await getNumero(numeroId)
  if (!numero || numero.tenantId !== tenantId) return null
  if (numero.provider !== 'uazapi') return null
  return numero
}

/**
 * A caixa uazapi gerenciada desta rede, quando há exatamente UMA.
 *
 * Ponte para a tela que ainda não passa id. Com mais de uma caixa gerenciada
 * não existe "a" conexão da rede, e adivinhar aqui seria ressuscitar o
 * desempate silencioso — então devolve `null` e a tela precisa escolher.
 */
async function unicaGerenciada(tenantId: string): Promise<NumeroDeWhatsApp | null> {
  const geridas = (await getNumerosDaRede(tenantId))
    .filter(n => n.provider === 'uazapi' && n.managed)
  return geridas.length === 1 ? geridas[0]! : null
}

/** Quantas instâncias gerenciadas existem — conta TODAS as redes. */
async function instanciasEmUso(): Promise<number> {
  // Coluna, não jsonb: `managed` deixou de morar dentro de `config` justamente
  // para esta contagem poder usar índice.
  const { count, error } = await createAdminClient()
    .from('whatsapp_numbers')
    .select('id', { count: 'exact', head: true })
    .eq('provider', 'uazapi')
    .eq('managed', true)

  if (error) { console.error('[uazapi-connection] contagem:', error.message); return 0 }
  return count ?? 0
}

async function geridasNaRede(tenantId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from('whatsapp_numbers')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('provider', 'uazapi')
    .eq('managed', true)

  if (error) { console.error('[uazapi-connection] contagem da rede:', error.message); return 0 }
  return count ?? 0
}

/** Base desta instância; cai no env só para config antiga sem `baseUrl`. */
function baseDa(config: UazapiConfig): string {
  return (config.baseUrl ?? process.env.UAZAPI_BASE_URL ?? '').replace(/\/$/, '')
}

export async function getEstadoConexaoUazapi(
  /** Omitido: a rede tem UMA conexão gerenciada e é dela que se fala. */
  numeroId?: string | null,
): Promise<EstadoConexaoUazapi> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const base: EstadoConexaoUazapi = {
    numeroId:     null,
    rotulo:       null,
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

  const numero = numeroId
    ? await numeroDaRede(ctx.tenantId!, numeroId)
    : await unicaGerenciada(ctx.tenantId!)

  if (!numero?.managed) return { ...base, usadas: await instanciasEmUso() }

  const config = numero.config as UazapiConfig
  base.numeroId   = numero.id
  base.rotulo     = numero.label
  base.gerenciada = true

  try {
    const status = await statusDaInstancia(baseDa(config), config.token)
    base.conectada    = status.connected
    base.aguardandoQr = !status.connected && !!status.qrcode
    base.phone        = telefoneDoJid(status.jid) ?? config.connectedPhone ?? null
    base.name         = status.nome ?? config.connectedName ?? null

    // Pareou enquanto a tela estava aberta: registra sem esperar o webhook.
    if (status.connected && !numero.isActive) {
      await marcarConectada(numero, base.phone, base.name, ctx)
    }
  } catch (e) {
    base.erro = e instanceof Error ? e.message : 'Falha ao consultar a instância.'
  }

  try {
    const proxy = await lerProxy(baseDa(config), config.token)
    base.proxyModo = proxy?.modo ?? null
    base.proxyPais = proxy?.pais ?? null
  } catch {
    // Proxy é informativo: não saber o IP não impede nada.
  }

  base.usadas = await instanciasEmUso()
  return base
}

/**
 * Cria a instância e a caixa.
 *
 * **A ordem foi invertida** em relação ao que existia, e isso melhora o que o
 * comentário antigo já se preocupava em proteger:
 *
 * 1. grava a LINHA (inativa, sem credencial) — daí sai o `numeroId`;
 * 2. cria a instância na uazapi, com o nome já carregando esse id;
 * 3. grava a credencial na linha.
 *
 * Falha em (2): apaga-se a linha e nada foi cobrado. Falha em (3): a linha
 * existe, é identificável, e a instância pode ser reconciliada — antes isso
 * deixava só um `console.error` e uma instância órfã anônima.
 */
export async function criarConexaoUazapi(
  dados?: { rotulo?: string; branchId?: string | null; userId?: string | null },
): Promise<{ ok: boolean; numeroId?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const admin = createAdminClient()

  if (!conexaoGerenciadaDisponivel()) {
    return { ok: false, error: 'Conexão gerenciada indisponível nesta instalação.' }
  }

  // O guard "uma por rede" saiu — é a trava que múltiplos números removem. O
  // teto por rede fica no lugar dele, porque cada instância é cobrada.
  const porRede = tetoPorRede()
  if ((await geridasNaRede(ctx.tenantId!)) >= porRede) {
    return { ok: false, error: `Esta rede já tem ${porRede} conexões de WhatsApp.` }
  }

  const teto = tetoDeInstancias()
  if (teto > 0 && (await instanciasEmUso()) >= teto) {
    return { ok: false, error: `Limite de ${teto} conexões atingido nesta instalação.` }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return { ok: false, error: 'NEXT_PUBLIC_APP_URL não configurada — o webhook nasceria apontando para lugar nenhum.' }
  }

  // (1) A linha primeiro. Nasce inativa e sem credencial: `resolverCanal` a
  // ignora, então ela não atrapalha ninguém enquanto a instância não existe.
  const { data: linha, error: erroLinha } = await admin
    .from('whatsapp_numbers')
    .insert({
      tenant_id: ctx.tenantId!,
      provider:  'uazapi',
      label:     dados?.rotulo?.trim() || 'WhatsApp',
      branch_id: dados?.branchId ?? null,
      user_id:   dados?.userId   ?? null,
      managed:   true,
      is_active: false,
      config:    {},
    })
    .select('id')
    .single()

  if (erroLinha || !linha) {
    return { ok: false, error: erroLinha?.message ?? 'Falha ao criar a conexão.' }
  }
  const numeroId = linha.id as string

  // O nome aparece no painel da uazapi. Com o tenant E o número nele, achar de
  // quem é uma instância na hora de remover deixa de ser adivinhação — e a
  // segunda caixa da mesma rede deixa de colidir com a primeira.
  const tenant = await ler(admin
    .from('tenants').select('name').eq('id', ctx.tenantId!).maybeSingle(), 'buscar a rede')
  const nome = `${(tenant as { name: string } | null)?.name ?? 'Rede'}-${ctx.tenantId!.slice(0, 8)}-${numeroId.slice(0, 8)}`
    .replace(/[^a-zA-Z0-9-]+/g, '-').toLowerCase()

  // (2) A instância.
  let criada
  try {
    criada = await criarInstancia(nome)
  } catch (e) {
    // Nada foi cobrado: a linha some e a rede pode tentar de novo.
    await admin.from('whatsapp_numbers').delete().eq('id', numeroId)
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

  // (3) A credencial na linha.
  const { error } = await admin
    .from('whatsapp_numbers')
    .update({ config, updated_at: new Date().toISOString() })
    .eq('id', numeroId)

  if (error) {
    // A linha continua lá, identificável, com o id que dá nome à instância na
    // uazapi — dá para reconciliar à mão em vez de pagar por uma órfã anônima.
    console.error('[criarConexaoUazapi] gravar config:', error.message, numeroId, criada.instanceId)
    try { await removerInstancia(base, criada.token) } catch (e) {
      console.error('[criarConexaoUazapi] instância órfã na uazapi:', criada.instanceId, e)
    }
    return { ok: false, error: 'Falha ao salvar a conexão. Tente de novo.' }
  }

  // Webhook é passo separado na uazapi. Sem ele a instância conecta, a tela diz
  // "conectado" e nenhuma mensagem chega.
  try {
    await configurarWebhook(base, criada.token, `${appUrl}/api/webhooks/uazapi`)
    await gravar(admin.from('whatsapp_numbers')
      .update({ config: { ...config, webhookAppliedAt: new Date().toISOString() } })
      .eq('id', numeroId), 'salvar a conexão do WhatsApp')
  } catch (e) {
    console.error('[criarConexaoUazapi] webhook:', e)
    return { ok: false, numeroId, error: 'Instância criada, mas o webhook falhou. Use "Reparar conexão".' }
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
      await gravar(admin.from('whatsapp_numbers')
        .update({ config: { ...config, proxyUrl, proxyAppliedAt: new Date().toISOString() } })
        .eq('id', numeroId), 'salvar a conexão do WhatsApp')
    } catch (e) {
      console.error('[criarConexaoUazapi] proxy:', e)
    }
  }

  revalidatePath('/admin/settings')
  return { ok: true, numeroId }
}

/** Reaplica webhook, ritmo e proxy numa instância que já existe. */
export async function repararConexaoUazapi(
  numeroId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const numero = await numeroDaRede(ctx.tenantId!, numeroId)
  if (!numero?.managed) return { ok: false, error: 'Conexão não encontrada nesta rede.' }
  const config = numero.config as UazapiConfig

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

export async function getQrCodeUazapi(numeroId: string): Promise<{
  ok: boolean; qr?: string | null; paircode?: string | null; conectada?: boolean; error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const numero = await numeroDaRede(ctx.tenantId!, numeroId)
  if (!numero?.managed) return { ok: false, error: 'Conexão não encontrada nesta rede.' }
  const config = numero.config as UazapiConfig

  try {
    // `/instance/status` é barato e idempotente; `/instance/connect` é escrita e
    // leva de 5 a 9 segundos. Consultar primeiro evita reiniciar o pareamento a
    // cada volta do polling.
    const status = await statusDaInstancia(baseDa(config), config.token)
    if (status.connected) {
      await marcarConectada(numero, telefoneDoJid(status.jid), status.nome, ctx)
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
  numeroId: string,
  telefone: string,
): Promise<{ ok: boolean; code?: string | null; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < 10) return { ok: false, error: 'Informe o número com DDD.' }

  const numero = await numeroDaRede(ctx.tenantId!, numeroId)
  if (!numero?.managed) return { ok: false, error: 'Conexão não encontrada nesta rede.' }
  const config = numero.config as UazapiConfig

  try {
    const par = await conectarInstancia(baseDa(config), config.token, digitos)
    return { ok: true, code: par.paircode }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao gerar o código.' }
  }
}

/**
 * Pareou: ativa a caixa e guarda o número.
 *
 * Sem ativar, `escolherNumeroDeSaida` ignora a linha e o inbox segue dizendo que
 * o canal não está conectado, mesmo com o celular pareado.
 */
async function marcarConectada(
  numero: NumeroDeWhatsApp, phone: string | null, name: string | null,
  ctx?: { tenantId?: string | null; internalUserId?: string | null; userName?: string | null },
): Promise<void> {
  const admin = createAdminClient()

  // Estado antes de escrever: esta função é chamada tanto na transição quanto
  // quando só o número mudou, e o evento tem de sair apenas na TRAVESSIA. Sem
  // isso, o polling do pareamento emitiria "conectada" em cada volta.
  const jaEstavaAtiva = numero.isActive

  // `provider` mora na coluna, não no jsonb. Removido explicitamente em vez de
  // gravar `undefined` e confiar no acaso da serialização.
  const { provider: _ignorado, ...semProvider } = numero.config as UazapiConfig

  const { error } = await admin
    .from('whatsapp_numbers')
    .update({
      config:     { ...semProvider, connectedPhone: phone, connectedName: name },
      phone_e164: phone,
      // O rótulo automático segue o nome do WhatsApp enquanto ninguém deu um
      // nome próprio à caixa. Rótulo escolhido pela rede nunca é sobrescrito.
      ...(name && (numero.label === 'WhatsApp' || numero.label === numero.phone)
        ? { label: name } : {}),
      is_active:  true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', numero.id)

  if (error) { console.error('[marcarConectada]', error.message); return }

  // Aqui havia um `desativarOutroProvedorWhatsApp`. Ele existia porque duas
  // conexões ativas eram estado inválido quando a rede só podia ter um número.
  // Agora uazapi e oficial convivem, cada uma na sua caixa, e derrubar a
  // vizinha passaria a ser o defeito.

  if (!jaEstavaAtiva) {
    // O ator é quem está na tela — os dois caminhos que chegam aqui, o QR e o
    // polling do estado, rodam autenticados. O `ctx` é opcional só para um
    // chamador futuro que não tenha um; ali o ator vira sistema, que é a
    // verdade.
    await integracaoConectada(
      'uazapi', ctx ?? { tenantId: numero.tenantId }, numero.label, numero.id,
    )
  }

  // Sem `revalidatePath` aqui: quem chama decide. Esta função roda dentro de
  // leituras em polling, e revalidar a rota que pediu a leitura é o que fazia a
  // tela piscar sem parar.
}

/** Desliga o celular, mantendo a instância de pé. */
export async function desconectarUazapi(
  numeroId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const numero = await numeroDaRede(ctx.tenantId!, numeroId)
  if (!numero?.managed) return { ok: false, error: 'Conexão não encontrada nesta rede.' }
  const config = numero.config as UazapiConfig

  try {
    await desconectarInstancia(baseDa(config), config.token)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao desconectar.' }
  }

  const { error } = await createAdminClient()
    .from('whatsapp_numbers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', numero.id)

  if (error) return { ok: false, error: error.message }

  await integracaoDesconectada('uazapi', ctx, 'pedido', numero.label, numero.id)

  revalidatePath('/admin/settings')
  revalidatePath('/admin/inbox')
  return { ok: true }
}

/**
 * Remove de vez: apaga na uazapi e apaga a caixa.
 *
 * A ordem importa. Se apagássemos a linha primeiro e a remoção falhasse,
 * ficaríamos pagando por uma instância que ninguém mais consegue nem ver.
 *
 * ⚠️ Esta é a função mais destrutiva do arquivo, e a que mais depende da
 * checagem de posse: com um id cru e sem `numeroDaRede`, ela apagaria a
 * instância PAGA de outra clínica.
 */
export async function removerConexaoUazapi(
  numeroId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const numero = await numeroDaRede(ctx.tenantId!, numeroId)
  if (!numero?.managed) return { ok: false, error: 'Conexão não encontrada nesta rede.' }
  const config = numero.config as UazapiConfig

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
    .from('whatsapp_numbers')
    .delete()
    .eq('id', numero.id)

  if (error) return { ok: false, error: error.message }

  // `removida` e não `pedido`: desligar o celular e apagar a instância levam ao
  // mesmo "não está mais no ar", mas só um deles é reversível apertando um
  // botão — e é isso que a automação de aviso precisa distinguir.
  await integracaoDesconectada('uazapi', ctx, 'removida', numero.label, numero.id)

  revalidatePath('/admin/settings')
  revalidatePath('/admin/inbox')
  return { ok: true }
}
