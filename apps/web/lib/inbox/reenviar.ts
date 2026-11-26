import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolverCanal, type CanalResolvido } from '@/lib/channels/factory'
import { estadoDaJanela } from '@/lib/channels/window'
import type { ChannelKind, MediaKind } from '@/lib/channels/types'
import { gravar, ler, tentar } from '@/lib/db'
import { falhaDoEnvio } from '@/lib/inbox/falhas'
import { numeroRemovidoDaConversa, recusaDoNumeroRemovido } from '@/lib/inbox/numero-removido'
import { ultimoInboundNaCaixa, type Remetente } from '@/lib/inbox/enviar'
import { numeroDoReenvio } from '@/lib/inbox/numero-do-reenvio'
import { urlDaMidia } from '@/lib/inbox/media'
import { montarParametrosEnvio, valoresDoTextoDoModelo } from '@/lib/templates/core'

/**
 * O "Tentar de novo" da bolha "Não enviada" (R11 — o Heitor, 26/11, na página
 * de perguntas: "Está no escopo: o botão 'Tentar de novo' na bolha que não
 * saiu"). O núcleo, sem tela: quem chama (`reenviarMensagem`, em
 * `actions/inbox.ts`) já conferiu o plano, a permissão, o suporte e o alcance.
 *
 * - Reenvia a MESMA mensagem — o texto (com a citação), o modelo (com os
 *   mesmos valores, lidos do histórico) ou o anexo (do nosso bucket) — pelo
 *   mesmo número, ou pelo da conversa se aquele saiu (`numeroDoReenvio`).
 * - As travas do envio normal: a conversa encerrada, o número removido da
 *   conversa, a janela de 24 h da caixa que VAI enviar (o modelo é o que a
 *   contorna, como no envio dele).
 * - Não duplica a bolha: a MESMA linha volta a 'sending' (só a que está
 *   'failed' — dois cliques não mandam duas vezes) e depois a 'sent' ou de
 *   novo a 'failed', com o motivo. A régua das respostas conta uma vez só: o
 *   gatilho `trg_mensagem_aceita` (migration 20261210100001) mede quando ela
 *   PASSA a aceita. A hora da linha vira a do reenvio — é quando a cliente a
 *   recebe (princípio 3).
 * - O fato "mensagem enviada" não sai de novo: ele já saiu na primeira
 *   tentativa (`sendMessage`), e as automações não podem reagir duas vezes.
 *
 * Mora em `lib/`, fora de `'use server'`: recebe a rede por parâmetro.
 */

export interface ResultadoDoReenvio {
  ok:     boolean
  error?: string
  /** A mensagem gravada, quando a linha chegou a ser reenviada (deu certo ou falhou de novo). */
  mensagemId?: string
}

interface LinhaDaMensagem {
  id: string; conversation_id: string; direction: string; status: string; channel: string
  content: string | null; media_type: string | null; media_path: string | null
  template_id: string | null; whatsapp_number_id: string | null; reply_to_external_id: string | null
}

interface LinhaDaConversa {
  id: string; channel: string; status: string; contact_phone: string | null
  contact_external_id: string | null; last_inbound_at: string | null; whatsapp_number_id: string | null
}

type Envio = (canal: CanalResolvido, destino: string) => Promise<{ externalId: string }>

export async function reenviarNaConversa(
  tenantId: string,
  messageId: string,
  remetente: Remetente,
): Promise<ResultadoDoReenvio> {
  const admin = createAdminClient()

  const msg = await ler(admin.from('messages')
    .select('id, conversation_id, direction, status, channel, content, media_type, media_path, template_id, whatsapp_number_id, reply_to_external_id')
    .eq('id', messageId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a mensagem') as LinhaDaMensagem | null
  if (!msg) return { ok: false, error: 'Mensagem não encontrada.' }
  if (msg.direction !== 'outbound') return { ok: false, error: 'Só a mensagem enviada pela rede se tenta de novo.' }
  if (msg.status === 'sending') return { ok: false, error: 'Esta mensagem já está saindo.' }
  if (msg.status !== 'failed') return { ok: false, error: 'Esta mensagem já saiu.' }

  const conv = await ler(admin.from('conversations')
    .select('id, channel, status, contact_phone, contact_external_id, last_inbound_at, whatsapp_number_id')
    .eq('id', msg.conversation_id).eq('tenant_id', tenantId).maybeSingle(), 'buscar a conversa') as LinhaDaConversa | null
  if (!conv) return { ok: false, error: 'Conversa não encontrada.' }
  if (conv.status === 'closed') return { ok: false, error: 'Conversa encerrada' }

  // O número da conversa foi removido (r2-cfg-06): não se responde por ela.
  const removido = await numeroRemovidoDaConversa(admin, conv.whatsapp_number_id)
  if (removido) return { ok: false, error: recusaDoNumeroRemovido(removido) }

  const channel = conv.channel as ChannelKind
  const canal = await canalDoReenvio(tenantId, channel, msg, conv, remetente.id)
  if ('erro' in canal) return { ok: false, error: canal.erro }

  const destino = conv.contact_phone ?? conv.contact_external_id
  if (!destino) return { ok: false, error: 'Esta conversa não tem um destinatário identificado.' }

  // O que sai: o modelo (fora da janela), o anexo ou o texto (dentro dela).
  const preparo = msg.template_id
    ? await envioDoModelo(admin, tenantId, msg, canal.canal)
    : await envioDentroDaJanela(admin, tenantId, msg, conv, canal.canal)
  if ('erro' in preparo) return { ok: false, error: preparo.erro }

  // Pega a MESMA linha — só se ela ainda está "Não enviada". Dois cliques (ou
  // duas abas) não mandam duas vezes: o segundo não acha linha 'failed'.
  const pega = await ler(admin.from('messages')
    .update({
      status: 'sending', erro_codigo: null, erro_texto: null,
      whatsapp_number_id: canal.canal.numeroId,
      sent_by_id: remetente.id, sent_by_name: remetente.nome,
      created_at: new Date().toISOString(),
    })
    .eq('id', msg.id).eq('tenant_id', tenantId).eq('status', 'failed')
    .select('id'), 'pegar a mensagem para tentar de novo') as { id: string }[] | null
  if (!pega?.length) return { ok: false, error: 'Esta mensagem já está saindo.' }

  try {
    const { externalId } = await preparo.enviar(canal.canal, destino)
    await gravar(admin.from('messages')
      .update({ status: 'sent', external_id: externalId, provider: canal.canal.nome })
      .eq('id', msg.id), 'registrar a resposta do provedor')
    // A conversa sem caixa adquire a de saída (a regra de `enviarNaConversa`);
    // `tentar`: a mensagem JÁ saiu, e lançar aqui a daria por falhada.
    if (!conv.whatsapp_number_id && canal.canal.numeroId) {
      await tentar(admin.from('conversations')
        .update({ whatsapp_number_id: canal.canal.numeroId, provider: canal.canal.nome })
        .eq('id', conv.id).is('whatsapp_number_id', null), 'carimbar a caixa na conversa')
    }
    return { ok: true, mensagemId: msg.id }
  } catch (e) {
    console.error('[reenviarNaConversa]', e)
    const falha = falhaDoEnvio(e)
    await gravar(admin.from('messages')
      .update({ status: 'failed', erro_codigo: falha.codigo, erro_texto: falha.texto })
      .eq('id', msg.id), 'marcar a mensagem como falhada')
    return { ok: false, error: falha.texto, mensagemId: msg.id }
  }
}

/** A caixa (e o provedor) por onde sai de novo. */
async function canalDoReenvio(
  tenantId: string, channel: ChannelKind, msg: LinhaDaMensagem, conv: LinhaDaConversa, userId: string | null,
): Promise<{ canal: CanalResolvido } | { erro: string }> {
  if (channel !== 'whatsapp') {
    const canal = await resolverCanal(tenantId, channel, { tipo: 'conversa', numeroId: null, userId: null })
    return canal ? { canal } : { erro: `Canal ${channel} não está conectado. Configure em Configurações → Integrações.` }
  }
  const { getNumerosDaRede, resolveProvider } = await import('@/lib/whatsapp/factory')
  const escolha = numeroDoReenvio(await getNumerosDaRede(tenantId), {
    daMensagem: msg.whatsapp_number_id, daConversa: conv.whatsapp_number_id, userId,
  })
  if ('erro' in escolha) return { erro: escolha.erro }
  const n = escolha.numero
  return {
    canal: { provider: resolveProvider(n.config), nome: n.provider, numeroId: n.id, rotulo: n.label },
  }
}

/** O texto ou o anexo: a janela de 24 h da caixa que VAI enviar, como no envio normal. */
async function envioDentroDaJanela(
  admin: ReturnType<typeof createAdminClient>, tenantId: string,
  msg: LinhaDaMensagem, conv: LinhaDaConversa, canal: CanalResolvido,
): Promise<{ enviar: Envio } | { erro: string }> {
  const channel = conv.channel as ChannelKind
  const caixaDiferente = !!canal.numeroId && !!conv.whatsapp_number_id && canal.numeroId !== conv.whatsapp_number_id
  const ultimoInbound = caixaDiferente
    ? await ultimoInboundNaCaixa(admin, tenantId, channel, canal.numeroId!, conv.contact_external_id ?? '')
    : conv.last_inbound_at
  const janela = estadoDaJanela(channel, ultimoInbound, canal.nome)
  if (!janela.aberta) {
    return {
      erro: caixaDiferente
        ? `Janela fechada no número ${canal.rotulo ?? 'de saída'}: este contato nunca falou com ele. Envie um template ou responda pelo número da conversa.`
        : (janela.motivo ?? 'Janela de resposta fechada.'),
    }
  }

  if (msg.media_type && msg.media_path) {
    if (!canal.provider.sendMedia) return { erro: 'Este canal não aceita anexo pela integração atual.' }
    const baixado = await admin.storage.from('inbox-media').download(msg.media_path)
    if (baixado.error || !baixado.data) return { erro: 'O arquivo desta mensagem não está mais guardado: anexe de novo.' }
    const url = await urlDaMidia(msg.media_path)
    if (!url) return { erro: 'Falha ao gerar o link do arquivo. Tente de novo.' }
    const bytes = await baixado.data.arrayBuffer()
    const kind = msg.media_type as MediaKind
    const ext = msg.media_path.split('.').pop()?.toLowerCase() ?? 'bin'
    const conteudo = (msg.content ?? '').trim()
    // O envio grava a legenda, ou o nome do arquivo sem legenda, ou "[tipo]".
    const ehNome = !conteudo || conteudo === `[${kind}]` || conteudo.toLowerCase().endsWith(`.${ext}`)
    const sendMedia = canal.provider.sendMedia.bind(canal.provider)
    return {
      enviar: (_c, destino) => sendMedia(destino, {
        kind, bytes, url,
        mimeType: baixado.data!.type || 'application/octet-stream',
        filename: ehNome && conteudo && conteudo !== `[${kind}]` ? conteudo : `arquivo.${ext}`,
        caption:  ehNome ? undefined : conteudo,
      }),
    }
  }

  const texto = (msg.content ?? '').trim()
  if (!texto) return { erro: 'A mensagem está vazia.' }
  return {
    enviar: (c, destino) => c.provider.send(destino, texto, {
      replyToExternalId: msg.reply_to_external_id ?? undefined,
    }),
  }
}

/** O modelo (template): aprovado, da conta do número que envia, com os mesmos valores. */
async function envioDoModelo(
  admin: ReturnType<typeof createAdminClient>, tenantId: string,
  msg: LinhaDaMensagem, canal: CanalResolvido,
): Promise<{ enviar: Envio } | { erro: string }> {
  const tpl = await ler(admin.from('message_templates')
    .select('id, name, language, status, header_text, body_text, footer_text, waba_id, nao_suportado')
    .eq('id', msg.template_id!).eq('tenant_id', tenantId).maybeSingle(), 'buscar o template') as {
      id: string; name: string; language: string; status: string
      header_text: string | null; body_text: string; footer_text: string | null
      waba_id: string | null; nao_suportado: string | null
    } | null
  if (!tpl) return { erro: 'Template não encontrado.' }
  if (tpl.status !== 'APPROVED') return { erro: 'Este template ainda não foi aprovado pela Meta.' }
  if (tpl.nao_suportado) return { erro: tpl.nao_suportado }
  if (!canal.provider.sendTemplate) return { erro: 'Templates exigem o WhatsApp Oficial conectado.' }

  const { getNumero } = await import('@/lib/whatsapp/factory')
  const numero = canal.numeroId ? await getNumero(canal.numeroId) : null
  if (!numero?.wabaId || tpl.waba_id !== numero.wabaId) {
    return { erro: `Este template não existe na conta do número ${canal.rotulo ?? 'de saída'}.` }
  }

  const valores = valoresDoTextoDoModelo(tpl, msg.content ?? '')
  if (!valores) return { erro: 'Não deu para refazer este modelo a partir da mensagem: mande-o de novo pela lista de modelos.' }

  const sendTemplate = canal.provider.sendTemplate.bind(canal.provider)
  return {
    enviar: (_c, destino) => sendTemplate(destino, {
      name: tpl.name, language: tpl.language, components: montarParametrosEnvio(tpl, valores),
    }),
  }
}
