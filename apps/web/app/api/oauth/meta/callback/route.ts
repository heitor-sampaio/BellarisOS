import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MetaMessagingPage } from '@/lib/meta/messaging'

const GRAPH = 'https://graph.facebook.com/v25.0'
const BACK  = '/admin/settings?tab=integrations'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const cookieStore = await cookies()
  const savedState  = cookieStore.get('meta_oauth_state')?.value
  const produto     = cookieStore.get('meta_oauth_produto')?.value === 'mensagens'
    ? 'mensagens' as const
    : 'ads' as const
  cookieStore.delete('meta_oauth_state')
  cookieStore.delete('meta_oauth_produto')

  const makeErrUrl = (reason: string) => {
    const u = new URL(BACK, req.url)
    u.searchParams.set('meta_error', '1')
    u.searchParams.set('meta_error_reason', reason)
    return u
  }

  if (error)               return NextResponse.redirect(makeErrUrl(`meta:${error}`))
  if (!code)               return NextResponse.redirect(makeErrUrl('no_code'))
  if (!state)              return NextResponse.redirect(makeErrUrl('no_state'))
  if (!savedState)         return NextResponse.redirect(makeErrUrl('no_cookie'))
  if (state !== savedState) return NextResponse.redirect(makeErrUrl('state_mismatch'))

  try {
    const origin      = req.nextUrl.origin
    const appId       = process.env.META_APP_ID!
    const appSecret   = process.env.META_APP_SECRET!
    const redirectUri = `${origin}/api/oauth/meta/callback`

    // 1. Troca code → short-lived token
    const shortParams = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })
    const shortRes    = await fetch(`${GRAPH}/oauth/access_token?${shortParams}`)
    const shortData   = await shortRes.json() as { access_token?: string; error?: { message: string } }
    if (!shortRes.ok || shortData.error) throw new Error(shortData.error?.message ?? 'Token exchange failed')

    // 2. Troca short-lived → long-lived (60 dias)
    //
    // ⚠️ Para mensagens isto não é otimização: o token de PÁGINA só é permanente
    // quando derivado de um token de usuário LONGO. Derivado do curto, ele expira
    // em horas e o inbox para de responder sem nenhum erro visível.
    const ltParams = new URLSearchParams({
      grant_type:        'fb_exchange_token',
      client_id:         appId,
      client_secret:     appSecret,
      fb_exchange_token: shortData.access_token!,
    })
    const ltRes  = await fetch(`${GRAPH}/oauth/access_token?${ltParams}`)
    const ltData = await ltRes.json() as { access_token?: string }
    const token  = ltData.access_token ?? shortData.access_token!

    // 3. Nome do usuário
    const meRes  = await fetch(`${GRAPH}/me?fields=name&access_token=${token}`)
    const meData = await meRes.json() as { name?: string }

    const ctx   = await getTenantContext()
    const admin = createAdminClient()

    const config = produto === 'mensagens'
      ? await configDeMensagens(token, meData.name ?? '')
      : await configDeAnuncios(token, meData.name ?? '')

    const { error: upsertError } = await admin
      .from('integration_configs')
      .upsert({
        tenant_id:  ctx.tenantId!,
        provider:   produto === 'mensagens' ? 'meta_messaging' : 'meta_ads',
        config,
        is_active:  false,   // só ativa depois de escolher conta/página na tela
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,provider' })

    if (upsertError) throw new Error(upsertError.message)

    revalidatePath('/admin/settings')

    const passo = produto === 'mensagens' ? 'select_page' : 'select'
    return NextResponse.redirect(new URL(`${BACK}&meta_step=${passo}`, req.url))
  } catch (e) {
    console.error('[meta-oauth-callback]', e)
    return NextResponse.redirect(makeErrUrl(e instanceof Error ? e.message : 'unknown'))
  }
}

// -- Anúncios -----------------------------------------------------------------

async function configDeAnuncios(token: string, userName: string) {
  const acctRes  = await fetch(`${GRAPH}/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${token}`)
  const acctData = await acctRes.json() as { data?: Array<{ id: string; name: string }> }
  const adAccounts = (acctData.data ?? []).map(a => ({
    id:   a.id.replace('act_', ''),
    name: a.name,
  }))

  const pixRes  = await fetch(`${GRAPH}/me/adspixels?fields=id,name&access_token=${token}`)
  const pixData = await pixRes.json() as { data?: Array<{ id: string; name: string }> }
  const pixels  = (pixData.data ?? []).map(p => ({ id: p.id, name: p.name }))

  return {
    access_token:   token,
    meta_user_name: userName,
    ad_accounts:    adAccounts,
    pixels,
  }
}

// -- Mensagens ----------------------------------------------------------------

/**
 * Páginas do usuário, cada uma com o token da PÁGINA e a conta do Instagram
 * ligada a ela — o Instagram Direct é sempre operado pela página, nunca pelo
 * perfil solto.
 */
async function configDeMensagens(token: string, userName: string) {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${token}`,
  )
  const data = await res.json() as {
    data?: Array<{
      id: string; name: string; access_token: string
      instagram_business_account?: { id: string; username?: string }
    }>
    error?: { message: string }
  }
  if (!res.ok || data.error) throw new Error(data.error?.message ?? 'Falha ao listar páginas')

  const pages: MetaMessagingPage[] = (data.data ?? []).map(p => ({
    pageId:     p.id,
    pageName:   p.name,
    pageToken:  p.access_token,
    igUserId:   p.instagram_business_account?.id       ?? null,
    igUsername: p.instagram_business_account?.username ?? null,
  }))

  // Inscrição no webhook. Sem este passo a Meta aceita o OAuth, mostra tudo
  // conectado e simplesmente NÃO entrega mensagem nenhuma — é a pegadinha
  // clássica da integração de Messenger.
  await Promise.all(pages.map(p => inscreverPagina(p)))

  return {
    access_token:   token,   // token de usuário longo, para renovar as páginas
    meta_user_name: userName,
    pages,
    // Uma página só: já escolhe. Mais de uma, a tela pergunta.
    activePageId: pages.length === 1 ? pages[0]!.pageId : '',
  }
}

async function inscreverPagina(page: MetaMessagingPage) {
  try {
    const res = await fetch(`${GRAPH}/${page.pageId}/subscribed_apps`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // ⚠️ `message_deliveries` e `message_reads` são o que faz os tiques
        // andarem. Sem eles a Meta entrega a mensagem e nunca conta que
        // entregou: a conversa fica inteira em um tique, como se nada tivesse
        // chegado. No painel do app, os campos equivalentes do produto
        // Instagram precisam estar marcados pelo mesmo motivo.
        subscribed_fields: 'messages,messaging_postbacks,message_deliveries,message_reads',
        access_token:      page.pageToken,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      console.error('[meta-oauth] subscribed_apps', page.pageId, JSON.stringify(err?.error ?? {}))
    }
  } catch (e) {
    // Falhar aqui não pode derrubar a conexão inteira: a tela ainda mostra as
    // páginas e o dono pode reconectar.
    console.error('[meta-oauth] subscribed_apps', page.pageId, e)
  }
}
