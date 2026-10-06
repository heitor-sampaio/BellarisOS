import 'server-only'
import { createAdminClient } from '../supabase/admin'
import { sendFcmToTokens, sendWebPushToSubs } from './push'
import { ler, tentar } from '../db'
import { sessaoDeSuporteAtual } from '../suporte/requisicao'
import { redeEstaBloqueada } from '../redes/bloqueio'
import { getCachedRedeDoCliente } from '../redes/cache'

type Admin = ReturnType<typeof createAdminClient>

export type NotifyPayload = {
  type:  string
  title: string
  body:  string
  data?: Record<string, unknown>
}

/**
 * O `notifyClient` para usar dentro de `after()`: a pergunta "é sessão de
 * suporte?" começa AGORA, ainda dentro da requisição (é dela que se leem os
 * cookies), e o callback só espera a resposta. Numa sessão de suporte, nada
 * sai para o paciente.
 */
export function notificadorDoCliente(): typeof notifyClient {
  const doSuporte = sessaoDeSuporteAtual()
  return async (admin, clientId, p) => {
    if (await doSuporte) return
    await notifyClient(admin, clientId, p)
  }
}

async function clienteDeRedeBloqueada(clientId: string): Promise<boolean> {
  try {
    const tenantId = await getCachedRedeDoCliente(clientId)
    return tenantId ? await redeEstaBloqueada(tenantId) : false
  } catch { return false }
}

/**
 * Notifica um CLIENTE: registra em client_notifications (sino + realtime) e
 * envia push nativo (FCM) + web-push aos dispositivos do cliente.
 * Fire-and-forget — nunca lança (não pode quebrar a ação que a chamou).
 */
export async function notifyClient(admin: Admin, clientId: string, p: NotifyPayload): Promise<void> {
  // No modo suporte nada sai para o paciente: o atendente remarcando um
  // horário não pode virar push no celular do cliente (lib/suporte/travas).
  if (await sessaoDeSuporteAtual()) return
  // A clínica bloqueada (assinatura): nada sai para o paciente.
  if (await clienteDeRedeBloqueada(clientId)) return
  try {
    await tentar(admin.from('client_notifications').insert({
      client_id: clientId,
      title:     p.title,
      body:      p.body,
      type:      p.type,
      data:      p.data ?? null,
    }), 'registrar a notificação do cliente')

    // `ler` dentro do try deste fire-and-forget: a falha cai no catch abaixo,
    // registrada, em vez de virar "o cliente não tem aparelho".
    const [tokens, subs] = await Promise.all([
      ler(admin.from('push_tokens').select('token').eq('client_id', clientId), 'carregar os aparelhos do cliente'),
      ler(admin.from('web_push_subscriptions').select('endpoint, keys').eq('client_id', clientId), 'carregar as inscrições do cliente'),
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
    await tentar(admin.from('user_notifications').insert({
      user_id: userId,
      title:   p.title,
      body:    p.body,
      type:    p.type,
      data:    p.data ?? null,
    }), 'registrar a notificação da equipe')

    const tokens = await ler(admin.from('push_tokens').select('token').eq('user_id', userId), 'carregar os aparelhos')
    await sendFcmToTokens((tokens ?? []).map(t => t.token as string), p.title, p.body, admin, p.data)
  } catch (e) {
    console.error('[notifyUser]', e)
  }
}
