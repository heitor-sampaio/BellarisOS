import 'server-only'
import { conferirLimite } from '@estetica-os/nucleo/lib/planos/limites'
import { randomInt } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, tentar } from '@/lib/db'
import type { ModoOficial } from '@/lib/whatsapp/modo-oficial'
import type { OfficialConfig } from '@/lib/whatsapp/types'

/**
 * O cadastro incorporado da Meta (Embedded Signup), do lado do servidor.
 *
 * A clínica clica em "Conectar pela Meta", faz o cadastro numa janela da Meta
 * sobre o BellarisOS e escolhe a conta do WhatsApp (WABA) e o número. A janela
 * devolve ao navegador um CÓDIGO (vale 30 s) e os ids da conta e do número. É
 * aqui que isso vira caixa:
 *
 *  1. troca o código pelo token de negócio (`/oauth/access_token`, com o
 *     segredo do app — por isso no servidor);
 *  2. confere, COM esse token, que o número é daquela conta: os ids vêm do
 *     navegador, e o token é a prova de que a clínica autorizou aquela conta;
 *  3. grava a caixa (ainda inativa) — ANTES de pedir qualquer coisa à Meta que
 *     gere webhook, senão o histórico da coexistência chegaria sem caixa para
 *     recebê-lo e se perderia (a Meta o manda uma vez só);
 *  4. inscreve o app nos webhooks da conta (`subscribed_apps`);
 *  5. Cloud API: registra o número com um PIN de duas etapas. Coexistência:
 *     NÃO registra (o número já é do aplicativo) e pede a sincronização dos
 *     contatos e do histórico — a Meta dá 24 h para isso;
 *  6. ativa a caixa (e a faz padrão, se a rede não tinha).
 *
 * Falha antes do passo 6 deixa a caixa inativa: reconectar reaproveita a linha.
 */

const GRAPH = 'https://graph.facebook.com/v25.0'

/**
 * A Graph da Meta — ou a falsa do E2E. `META_GRAPH_BASE_TESTE` só existe no
 * ambiente de teste (playwright.build.config.ts e o workflow); em produção a
 * variável não está definida.
 */
export const graphDoCadastro = () => (process.env.META_GRAPH_BASE_TESTE || GRAPH).replace(/\/$/, '')

export interface PedidoDeConexao {
  code:          string
  wabaId:        string
  phoneNumberId: string
  businessId?:   string | null
  modo:          ModoOficial
}

export type ResultadoDaConexao =
  | { ok: true; numeroId: string; rotulo: string; avisos: string[] }
  | { ok: false; error: string }

interface Resposta<T> { ok: boolean; dados: T; erro: string | null }

async function chamar<T>(caminho: string, opcoes: {
  metodo?: 'GET' | 'POST'
  token?:  string
  query?:  Record<string, string>
  corpo?:  Record<string, unknown>
} = {}): Promise<Resposta<T>> {
  const url = new URL(`${graphDoCadastro()}/${caminho}`)
  for (const [k, v] of Object.entries(opcoes.query ?? {})) url.searchParams.set(k, v)
  try {
    const res = await fetch(url, {
      method:  opcoes.metodo ?? 'GET',
      headers: {
        ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}),
        ...(opcoes.corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    })
    const dados = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
    const erro = !res.ok || dados?.error ? (dados?.error?.message ?? `HTTP ${res.status}`) : null
    return { ok: !erro, dados, erro }
  } catch (e) {
    return { ok: false, dados: {} as T, erro: e instanceof Error ? e.message : String(e) }
  }
}

const soDigitos = (s: unknown): s is string => typeof s === 'string' && /^\d{1,30}$/.test(s)

export async function conectarPeloCadastro(
  tenantId: string,
  pedido:   PedidoDeConexao,
): Promise<ResultadoDaConexao> {
  // Os ids vão para o CAMINHO da URL da Graph: só dígitos, ou nada.
  if (!soDigitos(pedido.wabaId) || !soDigitos(pedido.phoneNumberId)) {
    return { ok: false, error: 'A Meta não devolveu a conta e o número escolhidos. Tente de novo.' }
  }
  if (typeof pedido.code !== 'string' || !pedido.code || pedido.code.length > 4000) {
    return { ok: false, error: 'A Meta não devolveu a autorização. Tente de novo.' }
  }
  const businessId = soDigitos(pedido.businessId) ? pedido.businessId : undefined
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) return { ok: false, error: 'O app da Meta não está configurado no servidor.' }

  // 1. Código → token de negócio.
  const troca = await chamar<{ access_token?: string }>('oauth/access_token', {
    query: { client_id: appId, client_secret: appSecret, code: pedido.code },
  })
  const token = troca.dados.access_token
  if (!troca.ok || !token) {
    console.error('[cadastro-incorporado] troca do código:', troca.erro)
    return { ok: false, error: 'A autorização da Meta expirou ou não valeu. Conecte de novo — o código vale só 30 segundos.' }
  }

  // 2. O número é daquela conta, e o token a alcança.
  const numeros = await chamar<{ data?: { id: string; display_phone_number?: string; verified_name?: string }[] }>(
    `${pedido.wabaId}/phone_numbers`,
    { token, query: { fields: 'id,display_phone_number,verified_name' } },
  )
  if (!numeros.ok) {
    console.error('[cadastro-incorporado] números da conta:', numeros.erro)
    return { ok: false, error: 'Não consegui ler a conta do WhatsApp que a Meta autorizou.' }
  }
  const numero = (numeros.dados.data ?? []).find(n => n.id === pedido.phoneNumberId)
  if (!numero) return { ok: false, error: 'O número escolhido não pertence à conta do WhatsApp autorizada.' }

  const telefone = (numero.display_phone_number ?? '').replace(/\D/g, '') || null
  const rotulo = [numero.verified_name, numero.display_phone_number].filter(Boolean).join(' · ') || 'WhatsApp Oficial'

  // 3. A caixa, ainda inativa. O índice único em `phone_number_id` é global:
  //    o mesmo número em outra rede é recusado aqui, antes de mexer na Meta.
  const admin = createAdminClient()
  const existente = await ler(admin.from('whatsapp_numbers')
    .select('id, tenant_id').eq('phone_number_id', pedido.phoneNumberId).maybeSingle(), 'buscar a caixa do número')
  if (existente && existente.tenant_id !== tenantId) {
    return { ok: false, error: 'Este número já está conectado a outra conta do BellarisOS.' }
  }
  // Número NOVO na rede conta para o LIMITE do plano (lib/planos/limites.ts).
  if (!existente) {
    const limite = await conferirLimite(tenantId, 'whatsapp')
    if (limite) return { ok: false, error: limite }
  }

  const pin = pedido.modo === 'cloud_api' ? String(randomInt(0, 1_000_000)).padStart(6, '0') : undefined
  const config: OfficialConfig = {
    provider:      'official',
    phoneNumberId: pedido.phoneNumberId,
    wabaId:        pedido.wabaId,
    accessToken:   token,
    modo:          pedido.modo,
    conexao:       'cadastro_incorporado',
    ...(businessId ? { businessId } : {}),
    ...(pin ? { pin } : {}),
    // O envio e a mídia da caixa seguem para a mesma Graph (a falsa, no teste).
    ...(process.env.META_GRAPH_BASE_TESTE ? { graphBase: graphDoCadastro() } : {}),
  }
  const campos = {
    tenant_id: tenantId, provider: 'official', label: rotulo,
    phone_e164: telefone, phone_number_id: pedido.phoneNumberId, waba_id: pedido.wabaId,
    config, is_active: false, updated_at: new Date().toISOString(),
  }
  const gravada = existente
    ? await admin.from('whatsapp_numbers').update(campos).eq('id', existente.id as string).select('id').single()
    : await admin.from('whatsapp_numbers').insert(campos).select('id').single()
  if (gravada.error) {
    console.error('[cadastro-incorporado] gravar a caixa:', gravada.error.message)
    return { ok: false, error: gravada.error.code === '23505'
      ? 'Este número já está conectado a outra conta do BellarisOS.'
      : 'Não consegui gravar a conexão.' }
  }
  const numeroId = gravada.data.id as string

  // 4. Os webhooks da conta. Sem isto a Meta conecta, mostra tudo certo e não
  //    entrega mensagem nenhuma.
  const inscricao = await chamar(`${pedido.wabaId}/subscribed_apps`, { metodo: 'POST', token })
  if (!inscricao.ok) {
    console.error('[cadastro-incorporado] subscribed_apps:', inscricao.erro)
    return { ok: false, error: 'A Meta não aceitou ligar as mensagens deste número ao BellarisOS. Tente conectar de novo.' }
  }

  // 5. Cloud API registra; coexistência sincroniza (depois de ativar).
  if (pin) {
    const registro = await chamar(`${pedido.phoneNumberId}/register`, {
      metodo: 'POST', token, corpo: { messaging_product: 'whatsapp', pin },
    })
    if (!registro.ok) {
      console.error('[cadastro-incorporado] register:', registro.erro)
      return { ok: false, error: `A Meta não registrou o número na API: ${registro.erro}` }
    }
  }

  // 6. No ar. Padrão da rede se ela ainda não tinha um (o índice garante um só;
  //    se outro ganhou a corrida, esta simplesmente não vira padrão).
  const ativa = await admin.from('whatsapp_numbers')
    .update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', numeroId)
  if (ativa.error) return { ok: false, error: 'Não consegui ativar a conexão.' }
  const padrao = await ler(admin.from('whatsapp_numbers').select('id')
    .eq('tenant_id', tenantId).eq('is_default', true).limit(1), 'buscar o padrão da rede')
  if (!padrao?.length) {
    // Acessório: sem padrão, a tela já avisa e deixa escolher.
    await tentar(admin.from('whatsapp_numbers').update({ is_default: true }).eq('id', numeroId), 'fazer a caixa nova ser o padrão da rede')
  }

  // Coexistência: contatos e histórico. Não derruba a conexão se falhar — o
  // número já atende —, mas a tela avisa, porque a janela é de 24 h.
  const avisos: string[] = []
  if (pedido.modo === 'coexistencia') {
    for (const [tipo, nome] of [['smb_app_state_sync', 'os contatos'], ['history', 'o histórico de conversas']] as const) {
      const sync = await chamar(`${pedido.phoneNumberId}/smb_app_data`, {
        metodo: 'POST', token, corpo: { messaging_product: 'whatsapp', sync_type: tipo },
      })
      if (!sync.ok) {
        console.error(`[cadastro-incorporado] smb_app_data ${tipo}:`, sync.erro)
        avisos.push(`A Meta não começou a trazer ${nome} do aplicativo (${sync.erro}).`)
      }
    }
  }

  return { ok: true, numeroId, rotulo, avisos }
}
