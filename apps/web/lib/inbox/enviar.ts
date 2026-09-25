import { createAdminClient } from '@/lib/supabase/admin'
import { resolverCanal, type EscolhaDeCaixa } from '@/lib/channels/factory'
import { estadoDaJanela } from '@/lib/channels/window'
import type { ChannelKind } from '@/lib/channels/types'
import { gravar, ler } from '@/lib/db'

/**
 * Quando o contato falou pela última vez NESTA caixa.
 *
 * A janela de 24h é do par (contato, caixa), não da conversa: se o usuário
 * responde pelo número dele e o cliente nunca falou com aquele número, não há
 * janela nenhuma — por mais recente que seja a mensagem na outra caixa.
 *
 * Devolve `null` quando não existe conversa daquele contato naquela caixa, que
 * é a resposta certa: janela fechada.
 */
export async function ultimoInboundNaCaixa(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string, channel: ChannelKind, numeroId: string, externalId: string,
): Promise<string | null> {
  const linha = await ler(admin
    .from('conversations')
    .select('last_inbound_at')
    .eq('tenant_id', tenantId)
    .eq('channel', channel)
    .eq('whatsapp_number_id', numeroId)
    .eq('contact_external_id', externalId)
    .maybeSingle(), 'buscar a janela na caixa de saída')

  return (linha?.last_inbound_at as string | null) ?? null
}

/** O nome que a rede deu à caixa. Só para o aviso ficar legível. */
async function rotuloDaCaixa(
  admin: ReturnType<typeof createAdminClient>, numeroId: string,
): Promise<string> {
  const linha = await ler(admin
    .from('whatsapp_numbers').select('label').eq('id', numeroId).maybeSingle(),
    'buscar o rótulo da caixa')
  return (linha?.label as string | null) ?? 'outro número'
}

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
  /** A caixa por onde SAIU — pode não ser a da conversa. */
  numeroId?:  string | null
  /**
   * O que o cliente vai estranhar, quando a caixa de saída não é a da conversa.
   * Vazio no caso comum. Quem mostra é a tela; quem decide é `escolha.ts`.
   */
  aviso?:     string | null
}

export async function enviarNaConversa(
  tenantId: string,
  conversationId: string,
  texto: string,
  remetente: Remetente,
  opcoes?: { replyToExternalId?: string | null },
): Promise<ResultadoDoEnvio> {
  const admin = createAdminClient()

  const conv = await ler(admin
    .from('conversations')
    .select('id, channel, tenant_id, branch_id, status, contact_phone, contact_external_id, last_inbound_at, whatsapp_number_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .maybeSingle(), 'buscar a conversa')

  if (!conv) return { ok: false, error: 'Conversa não encontrada' }
  if (conv.status === 'closed') return { ok: false, error: 'Conversa encerrada' }

  const channel = conv.channel as ChannelKind
  const caixaDaConversa = conv.whatsapp_number_id as string | null

  // De onde sai? Um lugar só decide — antes havia um `if` com forma de WhatsApp
  // e um `else` que marcava a mensagem como "enviada" sem enviar nada.
  //
  // `tipo: 'conversa'` NÃO quer dizer "pela caixa da conversa a qualquer
  // custo": quer dizer "esta é a caixa da conversa, e este é quem está
  // falando". Quem tem número próprio vence — decisão do Heitor, e o custo dela
  // está tratado logo abaixo, na janela.
  const escolha: EscolhaDeCaixa = {
    tipo: 'conversa', numeroId: caixaDaConversa, userId: remetente.id,
  }
  const canal = await resolverCanal(tenantId, channel, escolha)

  if (!canal && channel !== 'manual') {
    return {
      ok: false,
      error: `Canal ${channel} não está conectado. Configure em Configurações → Integrações.`,
    }
  }

  // ── A janela é da CAIXA QUE VAI ENVIAR, não da conversa ────────────────────
  //
  // Quando o usuário fala pelo número dele e o cliente nunca falou com aquele
  // número, não existe janela — por mais recente que seja a última mensagem na
  // outra caixa. Usar `conv.last_inbound_at` aqui faria o sistema achar que
  // pode mandar texto livre, gravar a mensagem, e só então a Meta recusar com
  // um 400 genérico. É exatamente o "enviado" mentiroso que esta função existe
  // para não produzir.
  const caixaDiferente = !!canal?.numeroId && !!caixaDaConversa
    && canal.numeroId !== caixaDaConversa

  const ultimoInbound = caixaDiferente
    ? await ultimoInboundNaCaixa(
        admin, tenantId, channel, canal!.numeroId!,
        conv.contact_external_id as string,
      )
    : (conv.last_inbound_at as string | null)

  const janela = estadoDaJanela(channel, ultimoInbound, canal?.nome)
  if (!janela.aberta) {
    // A falha precisa dizer POR QUE, senão quem atende tenta de novo.
    return {
      ok: false,
      error: caixaDiferente
        ? `Janela fechada no seu número (${canal!.rotulo}): este contato nunca falou `
          + `com ele. Envie um template ou responda pelo número da conversa.`
        : (janela.motivo ?? 'Janela de resposta fechada.'),
    }
  }

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
      // A caixa fica na MENSAGEM porque ela pode divergir da conversa.
      whatsapp_number_id: canal?.numeroId ?? null,
      reply_to_external_id: opcoes?.replyToExternalId ?? null,
    })
    .select('id')
    .single()

  if (error || !msg) return { ok: false, error: error?.message ?? 'Erro ao gravar a mensagem.' }
  const mensagemId = msg.id as string

  if (!canal) {
    // `manual`: nota interna, não tem para onde enviar. Fica registrada.
    await gravar(admin.from('messages').update({ status: 'sent' }).eq('id', mensagemId), 'marcar a mensagem como enviada')
    return { ok: true, mensagemId }
  }

  // O destinatário é o id do contato NO CANAL: telefone no WhatsApp, PSID ou
  // IGSID nos canais da Meta. Telefone primeiro quando existe: a chave da
  // conversa pode ser um @lid, que funciona, mas o número é o identificador
  // estável dos dois lados.
  const destino = (conv.contact_phone as string | null) ?? (conv.contact_external_id as string | null)
  if (!destino) {
    await gravar(admin.from('messages').update({ status: 'failed' }).eq('id', mensagemId), 'marcar a mensagem como falhada')
    return { ok: false, error: 'Esta conversa não tem um destinatário identificado.', mensagemId }
  }

  try {
    const { externalId } = await canal.provider.send(destino, texto.trim(), {
      replyToExternalId: opcoes?.replyToExternalId ?? undefined,
    })
    await gravar(admin
      .from('messages')
      .update({ status: 'sent', external_id: externalId, provider: canal.nome })
      .eq('id', mensagemId), 'registrar a resposta do provedor')

    // A conversa ADQUIRE a caixa no primeiro envio bem-sucedido — e só se ainda
    // não tiver uma. É assim que a conversa nascida em `createConversationForLead`
    // (que nasce sem caixa) passa a ter a sua, no mesmo instante e pelo mesmo
    // motivo que `provider` já era gravado.
    //
    // ⚠️ NUNCA sobrescreve. Se a conversa já tem caixa e o usuário respondeu
    // pela dele, a conversa continua sendo da caixa original: é por ela que o
    // cliente conhece este atendimento, e é nela que a resposta dele vai cair.
    if (!caixaDaConversa && canal.numeroId) {
      await gravar(admin
        .from('conversations')
        .update({ whatsapp_number_id: canal.numeroId, provider: canal.nome })
        .eq('id', conversationId)
        .is('whatsapp_number_id', null), 'carimbar a caixa na conversa')
    }

    // O aviso volta junto com o sucesso — não para pedir permissão (a tela já
    // avisou antes de digitar, na fase da UI), mas para quem chamou por fora do
    // inbox poder registrar que a mensagem saiu por outra caixa.
    const { avisoDeCaixaDiferente } = await import('@/lib/whatsapp/escolha')
    const aviso = caixaDiferente
      ? avisoDeCaixaDiferente(
          { id: canal.numeroId!, label: canal.rotulo ?? 'seu número' },
          { id: caixaDaConversa!, label: await rotuloDaCaixa(admin, caixaDaConversa!) },
        )
      : null

    return {
      ok: true, mensagemId, externalId,
      provedor: canal.nome, numeroId: canal.numeroId, aviso,
    }
  } catch (e) {
    // A falha fica visível na conversa em vez de virar um "enviado" mentiroso.
    console.error('[enviarNaConversa]', e)
    await gravar(admin.from('messages').update({ status: 'failed' }).eq('id', mensagemId), 'marcar a mensagem como falhada')
    return { ok: false, error: (e as Error).message, mensagemId }
  }
}
