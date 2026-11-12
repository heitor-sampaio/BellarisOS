import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { sendFcmToTokens, sendWebPushToSubs } from '@/lib/notifications/push'
import { nomeParaSaudar } from '@/lib/saudacao'

/**
 * O ENVIO de uma campanha às clientes que o gatilho escolheu — um só, para o
 * disparo imediato, o agendado e os automáticos do cron (C51/C56, F69). Eram
 * dois envios copiados (o da campanha e o do cron), e os dois:
 *
 * - liam os aparelhos pela FICHA (`push_tokens.client_id`): a mesma pessoa em
 *   duas clínicas com um login, que instalou o app pela B, ganhava o sino da
 *   campanha da A e o celular não tocava. Agora são os aparelhos de TODAS as
 *   fichas do login (`aparelhos_das_clientes`, a régua do `notifyClient`);
 * - conferiam "já mandei hoje?" LENDO os disparos e depois gravando: duas
 *   passagens juntas mandavam duas vezes. Agora o disparo é REIVINDICADO antes
 *   de mandar: um por campanha, cliente e dia (índice único
 *   `campaign_dispatches_um_por_dia`); a passagem que não pegou a linha não
 *   manda.
 *
 * Fora de `'use server'`: recebe a campanha, e quem chama já conferiu.
 */

type Admin = ReturnType<typeof createAdminClient>

export interface CampanhaParaEnviar {
  id:                string
  title:             string
  body:              string
  notification_type: string
}

const LOTE = 100

/** "Oi, {{first_name}}" → "Oi, Ivone" (sem o tratamento: "Dona Ivone" é Ivone — D19). */
export function aplicarNome(texto: string, nome: string): string {
  const primeiro = nomeParaSaudar(nome) || nome
  return texto.replace(/\{\{first_name\}\}/g, primeiro)
}

/**
 * Manda a campanha a estas clientes, uma vez por dia (`dia`, 'AAAA-MM-DD' no
 * relógio da clínica). Devolve quantas ESTA chamada mandou.
 */
export async function enviarCampanha(
  admin: Admin,
  camp: CampanhaParaEnviar,
  clientes: { id: string; name: string }[],
  dia: string,
): Promise<number> {
  let enviadas = 0
  for (let i = 0; i < clientes.length; i += LOTE) {
    const lote = clientes.slice(i, i + LOTE)

    // 1. Reivindica: só as clientes cuja linha ESTA passagem gravou seguem.
    const pegas = await ler(admin
      .from('campaign_dispatches')
      .upsert(lote.map(c => ({ campaign_id: camp.id, client_id: c.id, status: 'SENT', dia })),
        { onConflict: 'campaign_id,client_id,dia', ignoreDuplicates: true })
      .select('id, client_id'), 'reivindicar os disparos da campanha') as { id: string; client_id: string }[] | null
    if (!pegas?.length) continue
    const minhas = new Map(pegas.map(p => [p.client_id, p.id]))
    const alvo = lote.filter(c => minhas.has(c.id))

    // 2. O sino de cada uma.
    const avisos = await ler(admin
      .from('client_notifications')
      .insert(alvo.map(c => ({
        client_id: c.id,
        title:     aplicarNome(camp.title, c.name),
        body:      aplicarNome(camp.body, c.name),
        type:      camp.notification_type,
        data:      { campaign_id: camp.id },
        is_read:   false,
      })))
      .select('id, client_id'), 'gravar as notificações da campanha') as { id: string; client_id: string }[] | null
    await Promise.all((avisos ?? []).map(a => gravar(admin
      .from('campaign_dispatches').update({ notification_id: a.id }).eq('id', minhas.get(a.client_id)!),
      'ligar o disparo à notificação')))
    enviadas += alvo.length

    // 3. O celular: os aparelhos de todas as fichas do login de cada uma.
    const aparelhos = (await ler(admin.rpc('aparelhos_das_clientes', { p_clientes: alvo.map(c => c.id) }),
      'carregar os aparelhos das clientes') ?? []) as {
        client_id: string; token: string | null; endpoint: string | null; keys: { p256dh: string; auth: string } | null
      }[]
    await Promise.allSettled(alvo.map(c => {
      const dela = aparelhos.filter(a => a.client_id === c.id)
      if (!dela.length) return Promise.resolve()
      const titulo = aplicarNome(camp.title, c.name)
      const corpo = aplicarNome(camp.body, c.name)
      return Promise.allSettled([
        sendFcmToTokens(dela.flatMap(a => (a.token ? [a.token] : [])), titulo, corpo, admin),
        sendWebPushToSubs(dela.flatMap(a => (a.endpoint && a.keys ? [{ endpoint: a.endpoint, keys: a.keys }] : [])), titulo, corpo),
      ])
    }))
  }
  return enviadas
}
