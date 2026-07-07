import { type NextRequest, NextResponse } from 'next/server'
import { OfficialAPIProvider } from '@/lib/whatsapp/official'
import { getTenantByPhoneNumberId, getWhatsAppConfig } from '@/lib/whatsapp/factory'
import { resolveConversation, insertInboundMessage, updateMessageStatus } from '@/lib/inbox/resolve-conversation'
import type { OfficialConfig } from '@/lib/whatsapp/types'

// -- GET: Meta webhook subscription verification ------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)

  // We don't know the tenant at handshake time — try all active official configs
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const { data: configs } = await admin
    .from('integration_configs')
    .select('config')
    .eq('provider', 'official')
    .eq('is_active', true)

  for (const row of (configs ?? [])) {
    const config = row.config as OfficialConfig
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

  const tenantId = await getTenantByPhoneNumberId(phoneNumberId)
  if (!tenantId) return NextResponse.json({ ok: true })

  const config = await getWhatsAppConfig(tenantId)
  if (!config || config.provider !== 'official') return NextResponse.json({ ok: true })

  const provider = new OfficialAPIProvider(config as OfficialConfig)

  // Validate HMAC signature
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

  const result = await resolveConversation(tenantId, inbound, 'whatsapp')
  if (!result) return NextResponse.json({ ok: true })

  await insertInboundMessage(result.conversationId, tenantId, inbound, 'whatsapp')

  return NextResponse.json({ ok: true })
}
