import { type NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { ZAPIProvider } from '@/lib/whatsapp/zapi'
import { getTenantByZAPIInstance, getWhatsAppConfig } from '@/lib/whatsapp/factory'
import { resolveConversation, insertInboundMessage, updateMessageStatus } from '@/lib/inbox/resolve-conversation'
import type { ZAPIConfig } from '@/lib/whatsapp/types'

export async function POST(req: NextRequest) {
  let body: unknown
  let rawText: string

  try {
    rawText = await req.text()
    body    = JSON.parse(rawText)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const p = body as any

  // Z-API sends instanceId in the payload — use it to identify the tenant
  const instanceId = p?.instanceId as string | undefined
  if (!instanceId) return NextResponse.json({ ok: true }) // ignore

  const tenantId = await getTenantByZAPIInstance(instanceId)
  if (!tenantId) return NextResponse.json({ ok: true }) // unknown instance

  const config = await getWhatsAppConfig(tenantId)
  if (!config || config.provider !== 'zapi') return NextResponse.json({ ok: true })

  // Validate Security Token (client-token header) when configured in the Z-API dashboard
  const zapiConfig = config as ZAPIConfig
  if (zapiConfig.webhookToken) {
    const incoming = req.headers.get('client-token') ?? ''
    try {
      const a = Buffer.from(incoming)
      const b = Buffer.from(zapiConfig.webhookToken)
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const provider = new ZAPIProvider(config as ZAPIConfig)

  // Status update (delivery/read receipt)
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
