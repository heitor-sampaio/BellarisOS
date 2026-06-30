import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const GRAPH = 'https://graph.facebook.com/v25.0'
const BACK  = '/admin/settings?tab=integrations'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const cookieStore = await cookies()
  const savedState  = cookieStore.get('meta_oauth_state')?.value
  cookieStore.delete('meta_oauth_state')

  const errUrl = new URL(`${BACK}&meta_error=1`, req.url)

  if (error || !code || !state || state !== savedState) {
    return NextResponse.redirect(errUrl)
  }

  try {
    const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const appId       = process.env.META_APP_ID!
    const appSecret   = process.env.META_APP_SECRET!
    const redirectUri = `${appUrl}/api/oauth/meta/callback`

    // 1. Troca code → short-lived token
    const shortParams = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })
    const shortRes    = await fetch(`${GRAPH}/oauth/access_token?${shortParams}`)
    const shortData   = await shortRes.json() as { access_token?: string; error?: { message: string } }
    if (!shortRes.ok || shortData.error) throw new Error(shortData.error?.message ?? 'Token exchange failed')

    // 2. Troca short-lived → long-lived (60 dias)
    const ltParams = new URLSearchParams({
      grant_type:       'fb_exchange_token',
      client_id:        appId,
      client_secret:    appSecret,
      fb_exchange_token: shortData.access_token!,
    })
    const ltRes  = await fetch(`${GRAPH}/oauth/access_token?${ltParams}`)
    const ltData = await ltRes.json() as { access_token?: string }
    const token  = ltData.access_token ?? shortData.access_token!

    // 3. Nome do usuário
    const meRes  = await fetch(`${GRAPH}/me?fields=name&access_token=${token}`)
    const meData = await meRes.json() as { name?: string }

    // 4. Contas de anúncios
    const acctRes  = await fetch(`${GRAPH}/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${token}`)
    const acctData = await acctRes.json() as { data?: Array<{ id: string; name: string }> }
    const adAccounts = (acctData.data ?? []).map(a => ({
      id:   a.id.replace('act_', ''),
      name: a.name,
    }))

    // 5. Pixels
    const pixRes  = await fetch(`${GRAPH}/me/adspixels?fields=id,name&access_token=${token}`)
    const pixData = await pixRes.json() as { data?: Array<{ id: string; name: string }> }
    const pixels  = (pixData.data ?? []).map(p => ({ id: p.id, name: p.name }))

    // 6. Salva config pendente no banco
    const ctx   = await getTenantContext()
    const admin = createAdminClient()

    await admin
      .from('integration_configs')
      .upsert({
        tenant_id:  ctx.tenantId!,
        provider:   'meta_ads',
        config: {
          access_token:   token,
          meta_user_name: meData.name ?? '',
          ad_accounts:    adAccounts,
          pixels,
        },
        is_active:  false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,provider' })

    revalidatePath('/admin/settings')

    return NextResponse.redirect(new URL(`${BACK}&meta_step=select`, req.url))
  } catch (e) {
    console.error('[meta-oauth-callback]', e)
    return NextResponse.redirect(errUrl)
  }
}
