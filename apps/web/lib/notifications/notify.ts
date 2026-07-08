import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFcmToTokens, sendWebPushToSubs } from '@/lib/notifications/push'

type Admin = ReturnType<typeof createAdminClient>

export type NotifyPayload = {
  type:  string
  title: string
  body:  string
  data?: Record<string, unknown>
}

/**
 * Notifica um CLIENTE: registra em client_notifications (sino + realtime) e
 * envia push nativo (FCM) + web-push aos dispositivos do cliente.
 * Fire-and-forget — nunca lança (não pode quebrar a ação que a chamou).
 */
export async function notifyClient(admin: Admin, clientId: string, p: NotifyPayload): Promise<void> {
  try {
    await admin.from('client_notifications').insert({
      client_id: clientId,
      title:     p.title,
      body:      p.body,
      type:      p.type,
      data:      p.data ?? null,
    })

    const [{ data: tokens }, { data: subs }] = await Promise.all([
      admin.from('push_tokens').select('token').eq('client_id', clientId),
      admin.from('web_push_subscriptions').select('endpoint, keys').eq('client_id', clientId),
    ])

    await Promise.allSettled([
      sendFcmToTokens((tokens ?? []).map(t => t.token as string), p.title, p.body, admin, p.data),
      sendWebPushToSubs(
        (subs ?? []).map(s => ({ endpoint: s.endpoint as string, keys: s.keys as { p256dh: string; auth: string } })),
        p.title, p.body, p.data,
      ),
    ])
  } catch (e) {
    console.error('[notifyClient]', e)
  }
}

/**
 * Notifica um USUÁRIO de staff (userId = public.users.id interno): registra em
 * user_notifications (sino + realtime) e envia push nativo (FCM) aos dispositivos.
 * Fire-and-forget — nunca lança.
 */
export async function notifyUser(admin: Admin, userId: string, p: NotifyPayload): Promise<void> {
  try {
    await admin.from('user_notifications').insert({
      user_id: userId,
      title:   p.title,
      body:    p.body,
      type:    p.type,
      data:    p.data ?? null,
    })

    const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', userId)
    await sendFcmToTokens((tokens ?? []).map(t => t.token as string), p.title, p.body, admin, p.data)
  } catch (e) {
    console.error('[notifyUser]', e)
  }
}
