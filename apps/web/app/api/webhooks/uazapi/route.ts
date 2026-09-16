import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UazapiProvider, telefoneDoJid } from '@/lib/whatsapp/uazapi'
import { getTenantByUazapiToken } from '@/lib/whatsapp/factory'
import { desativarOutroProvedorWhatsApp } from '@/lib/whatsapp/ativacao'
import {
  resolveConversation, insertInboundMessage, updateMessageStatus, applyMessageEdit,
} from '@/lib/inbox/resolve-conversation'

/**
 * Webhook da uazapi.
 *
 * A uazapi ecoa o TOKEN da instância no corpo de cada entrega. Como o token é
 * secreto, roteamento e autenticação são a mesma operação — não há header extra
 * para configurar e esquecer, como acontecia com a Z-API (onde o `client-token`
 * era opcional e, sem ele, o webhook ficava aberto).
 *
 * Responde 200 SEMPRE, inclusive para token desconhecido e JSON inválido: 4xx
 * enche o registro de erros da uazapi e pode fazer ela desativar a entrega.
 */
export async function POST(req: NextRequest) {
  let corpo: any
  try {
    corpo = JSON.parse(await req.text())
  } catch {
    return NextResponse.json({ ok: true })
  }

  const raiz  = corpo?.data ?? corpo
  const token = corpo?.token ?? raiz?.token ?? corpo?.instance?.token
  if (typeof token !== 'string' || !token) return NextResponse.json({ ok: true })

  const encontrado = await getTenantByUazapiToken(token)
  if (!encontrado) return NextResponse.json({ ok: true })

  const { tenantId, config } = encontrado

  try {
    // Evento de conexão: é o que faz a tela contar a verdade quando a clínica
    // conecta ou desliga pelo celular, sem polling.
    if (!raiz?.message) {
      await tratarConexao(tenantId, config.token, raiz, corpo)
      return NextResponse.json({ ok: true })
    }

    const provider = new UazapiProvider(config)

    // Edição ANTES de tudo: ela chega com a cara de mensagem nova (id novo,
    // texto novo) e, na ordem errada, viraria uma segunda bolha em vez de
    // corrigir a primeira.
    const edicao = provider.parseEdit(corpo)
    if (edicao) {
      await applyMessageEdit(tenantId, edicao.externalId, edicao.texto)
      return NextResponse.json({ ok: true })
    }

    const status = provider.parseStatus(corpo)
    if (status) {
      await updateMessageStatus(tenantId, status.externalId, status.status)
      return NextResponse.json({ ok: true })
    }

    const inbound = provider.parseInbound(corpo)
    if (!inbound) return NextResponse.json({ ok: true })

    // O provider vai junto para o caso de o webhook não trazer o nome do
    // contato — aí a conversa pergunta, em vez de fixar o telefone como nome.
    const resultado = await resolveConversation(tenantId, inbound, 'whatsapp', provider)
    if (!resultado) return NextResponse.json({ ok: true })

    // O provider vai junto: é ele que sabe baixar a mídia.
    await insertInboundMessage(resultado.conversationId, tenantId, inbound, 'whatsapp', provider)
  } catch (err) {
    // Uma entrega com problema não pode virar 4xx e derrubar a assinatura.
    console.error('[webhook/uazapi]', err)
  }

  return NextResponse.json({ ok: true })
}

/**
 * Estado da instância mudou.
 *
 * Só desativa quando a uazapi diz explicitamente que desconectou — payload que
 * não fala de conexão nenhuma não deve mexer em `is_active`.
 */
async function tratarConexao(
  tenantId: string, token: string, raiz: any, corpo: any,
): Promise<void> {
  const estado = raiz?.status ?? corpo?.status ?? raiz?.instance?.status ?? corpo?.instance?.status
  if (estado === undefined || estado === null) return

  const conectado = typeof estado === 'object'
    ? estado.connected === true
    : String(estado).toLowerCase() === 'connected'

  const desconectado = typeof estado === 'object'
    ? estado.connected === false
    : ['disconnected', 'close', 'closed'].includes(String(estado).toLowerCase())

  if (!conectado && !desconectado) return

  const admin = createAdminClient()
  const { data } = await admin
    .from('integration_configs')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'uazapi')
    .maybeSingle()

  const atual = (data?.config ?? {}) as Record<string, unknown>
  const jid   = raiz?.status?.jid ?? corpo?.instance?.owner ?? null
  const phone = telefoneDoJid(jid)

  const { error } = await admin
    .from('integration_configs')
    .update({
      is_active: conectado,
      config: conectado && phone ? { ...atual, connectedPhone: phone } : atual,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('provider', 'uazapi')

  if (error) { console.error('[webhook/uazapi] conexão:', error.message); return }

  // Duas configs de WhatsApp ativas é estado inválido, e era assim que a rede
  // ficava: este evento ativava a uazapi e a `official` continuava de pé, então
  // o envio saía pela oficial e falhava com a mensagem já gravada.
  if (conectado) await desativarOutroProvedorWhatsApp(tenantId, 'uazapi')
}
