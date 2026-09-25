import { type NextRequest, NextResponse } from 'next/server'
import { OfficialAPIProvider } from '@/lib/whatsapp/official'
import { getNumeroPorPhoneNumberId } from '@/lib/whatsapp/factory'
import { resolveConversation, insertInboundMessage, updateMessageStatus } from '@/lib/inbox/resolve-conversation'
import type { OfficialConfig } from '@/lib/whatsapp/types'
import { ler } from '@/lib/db'

// -- GET: Meta webhook subscription verification ------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)

  // No handshake não há de onde saber a caixa: a Meta só manda o `verifyToken`,
  // e é justamente compará-lo que identifica quem está sendo verificado. Daí a
  // varredura.
  //
  // ⚠️ Sem filtro `is_active`, e isto é deliberado: o handshake acontece DURANTE
  // a configuração, antes de a linha entrar no ar. Filtrar aqui faria a
  // verificação falhar exatamente na primeira vez, que é a única que importa.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const linhas = await ler(admin
    .from('whatsapp_numbers')
    .select('config')
    .eq('provider', 'official'), 'carregar as caixas de WhatsApp')

  for (const row of (linhas ?? [])) {
    const config = { ...(row.config as object), provider: 'official' } as OfficialConfig
    const provider = new OfficialAPIProvider(config)
    const challenge = provider.handleChallenge(url)
    if (challenge) return new Response(challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

// -- POST: Receive messages + status updates -----------------------------------
export async function POST(req: NextRequest) {
  let rawText: string
  let body: unknown

  try {
    rawText = await req.text()
    body    = JSON.parse(rawText)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const p = body as any

  // Extract phoneNumberId from payload to identify tenant
  const phoneNumberId = p?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id as string | undefined
  if (!phoneNumberId) return NextResponse.json({ ok: true })

  // A CAIXA que recebeu, não "a config da rede".
  //
  // Antes isto devolvia só o tenant e o número era descartado: recarregava-se a
  // config oficial ativa da rede e era com o `appSecret` DELA que a assinatura
  // era conferida. Com um número só dava na mesma; com dois apps na Meta, toda
  // entrega do segundo cairia em 401 — e o log diria "assinatura inválida", que
  // é a pista errada.
  const numero = await getNumeroPorPhoneNumberId(phoneNumberId)
  if (!numero || numero.provider !== 'official') return NextResponse.json({ ok: true })

  const tenantId = numero.tenantId
  const provider = new OfficialAPIProvider(numero.config as OfficialConfig)

  // Validate HMAC signature — com o segredo DESTA caixa.
  const signature = req.headers.get('x-hub-signature-256')
  if (!provider.verifySignature(rawText, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Status update
  const statusUpdate = provider.parseStatus(body)
  if (statusUpdate) {
    await updateMessageStatus(tenantId, statusUpdate.externalId, statusUpdate.status)
    return NextResponse.json({ ok: true })
  }

  // Inbound message
  const inbound = provider.parseInbound(body)
  if (!inbound) return NextResponse.json({ ok: true })

  const result = await resolveConversation(
    tenantId, inbound, 'whatsapp',
    { id: numero.id, channel: 'whatsapp', provider: numero.provider },
    provider,
  )
  if (!result) return NextResponse.json({ ok: true })

  // O provedor vai junto: é ele que sabe autenticar o download da mídia.
  await insertInboundMessage(
    result.conversationId, tenantId, inbound, 'whatsapp', provider,
    { id: numero.id, channel: 'whatsapp', provider: numero.provider },
  )

  return NextResponse.json({ ok: true })
}
