'use server'

import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export type ClientNotification = {
  id:          string
  title:       string
  body:        string | null
  type:        string
  is_read:     boolean
  is_received: boolean
  created_at:  string
  data:        { appointment_id?: string; link?: string } | null
}

export async function getClientNotifications(): Promise<{ notifications: ClientNotification[] }> {
  const ctx = await getTenantContext()
  if (!ctx.isClient) return { notifications: [] }

  const admin = createAdminClient()
  const { data } = await admin
    .from('client_notifications')
    .select('id, title, body, type, is_read, is_received, created_at, data')
    .eq('client_id', ctx.clientId!)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(40)

  return { notifications: (data ?? []) as ClientNotification[] }
}

// Bell opened: resets badge only (notifications stay in list until clicked)
export async function markAllNotificationsReceived(): Promise<void> {
  const ctx = await getTenantContext()
  if (!ctx.isClient) return

  const admin = createAdminClient()
  await admin
    .from('client_notifications')
    .update({ is_received: true })
    .eq('client_id', ctx.clientId!)
    .eq('is_received', false)
}

// Notification modal opened: removes from list + updates campaign read metrics
export async function markNotificationRead(id: string): Promise<void> {
  const ctx = await getTenantContext()
  if (!ctx.isClient) return

  // Verify ownership before calling RPC
  const admin = createAdminClient()
  const { data: notif } = await admin
    .from('client_notifications')
    .select('id')
    .eq('id', id)
    .eq('client_id', ctx.clientId!)
    .single()

  if (!notif) return

  // Atomic: marks read + updates campaign_dispatches.status + increments total_read
  await admin.rpc('mark_notification_read', { p_notification_id: id })
}
