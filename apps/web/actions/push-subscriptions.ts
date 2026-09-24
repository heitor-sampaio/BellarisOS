'use server'

import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar } from '@/lib/db'

export async function savePushToken({
  token,
  platform,
}: {
  token: string
  platform: 'android' | 'ios'
}): Promise<void> {
  const ctx = await getTenantContext()
  const admin = createAdminClient()
  await gravar(admin.from('push_tokens').upsert(
    {
      token,
      platform,
      client_id: ctx.isClient ? ctx.clientId : null,
      // user_id = public.users.id interno (bate com appointments.professional_id
      // e com notifyUser). NÃO usar ctx.userId (que é o auth id).
      user_id:   ctx.isClient ? null : ctx.internalUserId,
    },
    { onConflict: 'token' },
  ), 'registrar o aparelho para notificações')
}

export async function saveWebPushSubscription(sub: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}): Promise<void> {
  const ctx = await getTenantContext()
  if (!ctx.isClient) throw new Error('Forbidden')

  const admin = createAdminClient()
  await gravar(admin.from('web_push_subscriptions').upsert(
    { client_id: ctx.clientId!, endpoint: sub.endpoint, keys: sub.keys },
    { onConflict: 'client_id,endpoint' },
  ), 'registrar o navegador para notificações')
}

export async function removeWebPushSubscription(endpoint: string): Promise<void> {
  const ctx = await getTenantContext()
  if (!ctx.isClient) throw new Error('Forbidden')

  const admin = createAdminClient()
  await gravar(admin
    .from('web_push_subscriptions')
    .delete()
    .eq('client_id', ctx.clientId!)
    .eq('endpoint', endpoint), 'remover a inscrição de notificações')
}
