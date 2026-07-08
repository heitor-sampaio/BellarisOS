'use server'

import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export type UserNotification = {
  id:          string
  title:       string
  body:        string | null
  type:        string
  is_read:     boolean
  is_received: boolean
  created_at:  string
}

export async function getUserNotifications(): Promise<{ notifications: UserNotification[] }> {
  const ctx = await getTenantContext()
  if (ctx.isClient || !ctx.internalUserId) return { notifications: [] }

  const admin = createAdminClient()
  const { data } = await admin
    .from('user_notifications')
    .select('id, title, body, type, is_read, is_received, created_at')
    .eq('user_id', ctx.internalUserId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(40)

  return { notifications: (data ?? []) as UserNotification[] }
}

// Sino aberto: zera o badge (notificações continuam na lista até serem clicadas)
export async function markAllUserNotificationsReceived(): Promise<void> {
  const ctx = await getTenantContext()
  if (ctx.isClient || !ctx.internalUserId) return

  const admin = createAdminClient()
  await admin
    .from('user_notifications')
    .update({ is_received: true })
    .eq('user_id', ctx.internalUserId)
    .eq('is_received', false)
}

// Notificação aberta: remove da lista
export async function markUserNotificationRead(id: string): Promise<void> {
  const ctx = await getTenantContext()
  if (ctx.isClient || !ctx.internalUserId) return

  const admin = createAdminClient()
  await admin
    .from('user_notifications')
    .update({ is_read: true, is_received: true })
    .eq('id', id)
    .eq('user_id', ctx.internalUserId)
}
