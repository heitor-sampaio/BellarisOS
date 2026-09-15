import { type NextRequest, NextResponse } from 'next/server'
import { getTenantPorPagina } from '@/lib/channels/factory'
import { MetaMessagingProvider, verificarAssinaturaMeta } from '@/lib/meta/messaging'
import {
  resolveConversation, insertInboundMessage,
} from '@/lib/inbox/resolve-conversation'
import type { ChannelKind } from '@/lib/channels/types'

/**
 * Webhook de mensagens da Meta — Instagram Direct e Facebook Messenger.
 *
 * Fica separado de `/api/webhooks/whatsapp` porque na Meta cada PRODUTO tem sua
 * própria URL de callback: o WhatsApp Cloud aponta para lá, Messenger e
 * Instagram apontam para cá. Mesmo app, webhooks diferentes.
 *
 * O envelope diz de qual produto veio em `object`; o resto do formato é igual.
 */

// -- GET: verificação da inscrição -------------------------------------------
export async function GET(req: NextRequest) {
  const url       = new URL(req.url)
  const mode      = url.searchParams.get('hub.mode')
  const token     = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  // Um app, um token: não dá para descobrir a rede no handshake, porque a Meta
  // ainda não mandou página nenhuma.
  const esperado = process.env.META_VERIFY_TOKEN
  if (!esperado) {
    console.error('[webhook/meta] META_VERIFY_TOKEN não configurado')
    return new Response('Forbidden', { status: 403 })
  }

  if (mode === 'subscribe' && token === esperado && challenge) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// -- POST: mensagens recebidas ------------------------------------------------
export async function POST(req: NextRequest) {
  let rawText: string
  let body: any

  try {
    rawText = await req.text()
    body    = JSON.parse(rawText)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!verificarAssinaturaMeta(rawText, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const objeto: string = body?.object
  const channel: ChannelKind | null =
      objeto === 'instagram' ? 'instagram'
    : objeto === 'page'      ? 'messenger'
    : null

  // WhatsApp e mudanças de outros produtos caem aqui: responder 200 evita que a
  // Meta reentregue em laço o que este endpoint não trata.
  if (!channel) return NextResponse.json({ ok: true })

  // Uma entrega pode trazer várias entradas; cada uma é de uma página.
  for (const entrada of (body?.entry ?? [])) {
    try {
      await processarEntrada(entrada, channel)
    } catch (err) {
      // Uma entrada com problema não pode derrubar as outras da mesma entrega.
      console.error('[webhook/meta] entrada:', err)
    }
  }

  return NextResponse.json({ ok: true })
}

async function processarEntrada(entrada: any, channel: ChannelKind) {
  // `entry.id` é o id da página no Messenger e o da conta IG no Instagram —
  // `getTenantPorPagina` aceita os dois.
  const contaId: string | undefined = entrada?.id
  if (!contaId) return

  const encontrado = await getTenantPorPagina(contaId)
  if (!encontrado) return   // página de outra instalação: ignora em silêncio

  const { tenantId, config } = encontrado
  const page = config.pages.find(p => p.pageId === contaId || p.igUserId === contaId)
  if (!page) return

  const provider = new MetaMessagingProvider(page, channel)
  const inbound  = provider.parseInbound(entrada)
  if (!inbound) return   // eco da nossa própria mensagem, leitura, entrega…

  // Nome do perfil: sem isso o card nasce com o PSID (16 dígitos) como nome.
  // Falha aqui não pode barrar a mensagem.
  if (!inbound.displayName) {
    const perfil = await provider.fetchPerfil(inbound.externalUserId)
    const nome = perfil.username ? `@${perfil.username}` : perfil.name
    if (nome) inbound.displayName = nome
  }

  const result = await resolveConversation(tenantId, inbound, channel)
  if (!result) return

  await insertInboundMessage(result.conversationId, tenantId, inbound, channel, provider)
}
