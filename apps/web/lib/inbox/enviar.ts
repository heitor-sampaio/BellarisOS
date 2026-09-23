import { createAdminClient } from '@/lib/supabase/admin'
import { resolverCanal } from '@/lib/channels/factory'
import { estadoDaJanela } from '@/lib/channels/window'
import type { ChannelKind } from '@/lib/channels/types'

/**
 * O envio de uma mensagem numa conversa — o núcleo, sem tela e sem usuário.
 *
 * Saiu de `actions/inbox.ts` porque agora há **dois** remetentes: a pessoa no
 * inbox e o motor de automações. A action continua existindo e passou a chamar
 * daqui; uma segunda implementação divergiria no primeiro ajuste, e a primeira
 * divergência seria justamente a janela de 24h — a regra que, quando falha,
 * marca como "enviado" o que o cliente nunca recebeu.
 *
 * ⚠️ Mora em `lib/` e não em `actions/`: todo export de um arquivo
 * `'use server'` vira endpoint público, e um enviador exposto assim deixaria
 * qualquer cliente mandar mensagem pela conta da clínica.
 */

export interface Remetente {
  /** `users.id` — o id do MEMBRO, não o do auth. Nulo quando é automação. */
  id:   string | null
  nome: string | null
}

export interface ResultadoDoEnvio {
  ok:         boolean
  mensagemId?: string
  externalId?: string
  error?:     string
  /** Canal que atendeu, para quem precisa registrar. */
  provedor?:  string
}

export async function enviarNaConversa(
  tenantId: string,
  conversationId: string,
  texto: string,
  remetente: Remetente,
  opcoes?: { replyToExternalId?: string | null },
): Promise<ResultadoDoEnvio> {
  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('conversations')
    .select('id, channel, tenant_id, status, contact_phone, contact_external_id, last_inbound_at')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!conv) return { ok: false, error: 'Conversa não encontrada' }
  if (conv.status === 'closed') return { ok: false, error: 'Conversa encerrada' }

  const channel = conv.channel as ChannelKind

  // Como se envia neste canal? Um lugar só decide — antes havia um `if` com
  // forma de WhatsApp e um `else` que marcava a mensagem como "enviada" sem
  // enviar nada.
  const canal = await resolverCanal(tenantId, channel)

  if (!canal && channel !== 'manual') {
    return {
      ok: false,
      error: `Canal ${channel} não está conectado. Configure em Configurações → Integrações.`,
    }
  }

  // Janela de 24h da Meta. Fora dela a API recusa, então barrar aqui evita a
  // mensagem sumir depois de dada como enviada.
  const janela = estadoDaJanela(channel, conv.last_inbound_at as string | null, canal?.nome)
  if (!janela.aberta) return { ok: false, error: janela.motivo ?? 'Janela de resposta fechada.' }

  const { data: msg, error } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      tenant_id:       tenantId,
      direction:       'outbound',
      content:         texto.trim(),
      channel:         conv.channel,
      status:          'sending',
      sent_by_id:      remetente.id,
      sent_by_name:    remetente.nome,
      reply_to_external_id: opcoes?.replyToExternalId ?? null,
    })
    .select('id')
    .single()

  if (error || !msg) return { ok: false, error: error?.message ?? 'Erro ao gravar a mensagem.' }
  const mensagemId = msg.id as string

  if (!canal) {
    // `manual`: nota interna, não tem para onde enviar. Fica registrada.
    await admin.from('messages').update({ status: 'sent' }).eq('id', mensagemId)
    return { ok: true, mensagemId }
  }

  // O destinatário é o id do contato NO CANAL: telefone no WhatsApp, PSID ou
  // IGSID nos canais da Meta. Telefone primeiro quando existe: a chave da
  // conversa pode ser um @lid, que funciona, mas o número é o identificador
  // estável dos dois lados.
  const destino = (conv.contact_phone as string | null) ?? (conv.contact_external_id as string | null)
  if (!destino) {
    await admin.from('messages').update({ status: 'failed' }).eq('id', mensagemId)
    return { ok: false, error: 'Esta conversa não tem um destinatário identificado.', mensagemId }
  }

  try {
    const { externalId } = await canal.provider.send(destino, texto.trim(), {
      replyToExternalId: opcoes?.replyToExternalId ?? undefined,
    })
    await admin
      .from('messages')
      .update({ status: 'sent', external_id: externalId, provider: canal.nome })
      .eq('id', mensagemId)
    return { ok: true, mensagemId, externalId, provedor: canal.nome }
  } catch (e) {
    // A falha fica visível na conversa em vez de virar um "enviado" mentiroso.
    console.error('[enviarNaConversa]', e)
    await admin.from('messages').update({ status: 'failed' }).eq('id', mensagemId)
    return { ok: false, error: (e as Error).message, mensagemId }
  }
}
