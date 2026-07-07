'use server'

import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function savePushToken({
  token,
  platform,
}: {
  token: string
  platform: 'android' | 'ios'
}): Promise<void> {
  const ctx = await getTenantContext()
  const admin = createAdminClient()
  await admin.from('push_tokens').upsert(
    {
      token,
      platform,
      client_id: ctx.isClient ? ctx.clientId : null,
      user_id:   ctx.isClient ? null : ctx.userId,
    },
    { onConflict: 'token' },
  )
}

export async function saveWebPushSubscription(sub: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}): Promise<void> {
  const ctx = await getTenantContext()
  if (!ctx.isClient) throw new Error('Forbidden')

  const admin = createAdminClient()
  await admin.from('web_push_subscriptions').upsert(
    { client_id: ctx.clientId!, endpoint: sub.endpoint, keys: sub.keys },
    { onConflict: 'client_id,endpoint' },
  )
}

export async function removeWebPushSubscription(endpoint: string): Promise<void> {
  const ctx = await getTenantContext()
  if (!ctx.isClient) throw new Error('Forbidden')

  const admin = createAdminClient()
  await admin
    .from('web_push_subscriptions')
    .delete()
    .eq('client_id', ctx.clientId!)
    .eq('endpoint', endpoint)
}
