import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UazapiProvider, telefoneDoJid } from '@/lib/whatsapp/uazapi'
import { getNumeroPorTokenUazapi } from '@/lib/whatsapp/factory'
import type { UazapiConfig } from '@/lib/whatsapp/types'
import {
  resolveConversation, insertInboundMessage, updateMessageStatus, applyMessageEdit,
} from '@/lib/inbox/resolve-conversation'
import { ler } from '@/lib/db'

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

  // A CAIXA que recebeu — o token identifica a linha, não a rede.
  const numero = await getNumeroPorTokenUazapi(token)
  if (!numero) return NextResponse.json({ ok: true })

  const tenantId = numero.tenantId
  const config   = numero.config as UazapiConfig

  try {
    // Evento de conexão: é o que faz a tela contar a verdade quando a clínica
    // conecta ou desliga pelo celular, sem polling.
    if (!raiz?.message) {
      await tratarConexao(numero.id, raiz, corpo)
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
    const resultado = await resolveConversation(
      tenantId, inbound, 'whatsapp',
      { id: numero.id, channel: 'whatsapp', provider: numero.provider },
      provider,
    )
    if (!resultado) return NextResponse.json({ ok: true })

    // O provider vai junto: é ele que sabe baixar a mídia.
    await insertInboundMessage(
      resultado.conversationId, tenantId, inbound, 'whatsapp', provider,
      { id: numero.id, channel: 'whatsapp', provider: numero.provider },
    )
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
 *
 * **Atualiza a LINHA, por id.** Até aqui atualizava por `(tenant_id, provider)`,
 * o que com duas caixas uazapi na mesma rede fazia o evento de conexão de uma
 * reescrever `is_active` e `connectedPhone` da OUTRA — a segunda caixa a
 * conectar derrubaria a primeira, em silêncio.
 */
async function tratarConexao(
  numeroId: string, raiz: any, corpo: any,
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
  const data = await ler(admin
    .from('whatsapp_numbers')
    .select('config')
    .eq('id', numeroId)
    .maybeSingle(), 'buscar a caixa de WhatsApp')

  const atual = (data?.config ?? {}) as Record<string, unknown>
  const jid   = raiz?.status?.jid ?? corpo?.instance?.owner ?? null
  const phone = telefoneDoJid(jid)

  const { error } = await admin
    .from('whatsapp_numbers')
    .update({
      is_active:  conectado,
      config:     conectado && phone ? { ...atual, connectedPhone: phone } : atual,
      // A coluna é a verdade para quem lê; o campo no jsonb sobrevive porque é
      // o que a tela de configuração ainda mostra.
      ...(conectado && phone ? { phone_e164: phone } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', numeroId)

  if (error) { console.error('[webhook/uazapi] conexão:', error.message) }

  // Aqui havia um `desativarOutroProvedorWhatsApp`: com um número por rede,
  // duas conexões ativas eram estado inválido e uma tinha de derrubar a outra.
  // Com caixas próprias isso deixou de ser verdade — uazapi e oficial convivem,
  // cada uma com seu provedor, e derrubar a vizinha passaria a ser o bug.
}
