import 'server-only'
import webpush from 'web-push'
import { GoogleAuth } from 'google-auth-library'
import { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
type PushData = Record<string, unknown> | undefined

// ─── Web Push (VAPID) ─────────────────────────────────────────────────────────
function getWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  return webpush
}

/** Envia web-push para uma lista de subscriptions (endpoint + keys). */
export async function sendWebPushToSubs(
  subs: { endpoint: string; keys: { p256dh: string; auth: string } }[],
  title: string,
  body: string,
  data?: PushData,
): Promise<void> {
  if (!subs.length) return
  const payload = JSON.stringify({ title, body, ...(data ? { data } : {}) })
  await Promise.allSettled(
    subs.map(sub =>
      getWebPush().sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload),
    ),
  )
}

// ─── FCM HTTP v1 ──────────────────────────────────────────────────────────────
let _fcmAccessToken: string | null = null
let _fcmTokenExpiry = 0
let _fcmProjectId: string | null = null

export function parseServiceAccount(raw: string): Record<string, unknown> {
  const candidates = [
    raw.trim(),
    raw.trim().replace(/^'([\s\S]*)'$/, '$1'),
    raw.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/\\"/g, '"'),
  ]
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.private_key === 'string') {
          parsed.private_key = (parsed.private_key as string).replace(/\\n/g, '\n')
        }
        return parsed
      }
    } catch { /* try next */ }
  }
  throw new Error(
    `GOOGLE_SERVICE_ACCOUNT is not valid JSON. First 40 chars: ${JSON.stringify(raw.trim().slice(0, 40))}`,
  )
}

async function getFcmReady(): Promise<{ accessToken: string; projectId: string } | null> {
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT
  if (!sa) return null
  if (_fcmAccessToken && _fcmProjectId && Date.now() < _fcmTokenExpiry) {
    return { accessToken: _fcmAccessToken, projectId: _fcmProjectId }
  }
  try {
    const creds = parseServiceAccount(sa)
    _fcmProjectId = (creds.project_id as string) ?? null
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })
    const client = await auth.getClient()
    const res = await client.getAccessToken()
    _fcmAccessToken = res.token ?? null
    _fcmTokenExpiry = Date.now() + 55 * 60 * 1000
    if (!_fcmAccessToken || !_fcmProjectId) return null
    return { accessToken: _fcmAccessToken, projectId: _fcmProjectId }
  } catch (e) {
    console.error('[FCM]', e)
    return null
  }
}

/**
 * Envia FCM (notification payload) para uma lista de device tokens.
 * Remove do banco tokens inválidos (404 / UNREGISTERED / NOT_FOUND).
 */
export async function sendFcmToTokens(
  tokens: string[],
  title: string,
  body: string,
  admin: Admin,
  data?: PushData,
): Promise<void> {
  if (!tokens.length) return
  const fcm = await getFcmReady()
  if (!fcm) return
  const { accessToken, projectId } = fcm
  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

  await Promise.allSettled(
    tokens.map(async token => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
            ...(data ? { data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) } : {}),
          },
        }),
      })
      if (!res.ok) {
        const errBody = await res.text()
        console.error(`[FCM] send failed token=...${token.slice(-8)} status=${res.status}:`, errBody)
        if (res.status === 404 || errBody.includes('UNREGISTERED') || errBody.includes('NOT_FOUND')) {
          await admin.from('push_tokens').delete().eq('token', token)
        }
      }
    }),
  )
}
