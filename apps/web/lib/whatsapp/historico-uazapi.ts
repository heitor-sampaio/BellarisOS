import 'server-only'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNumero } from '@/lib/whatsapp/factory'
import { UazapiProvider, emMilissegundos, type ChatDoHistorico } from '@/lib/whatsapp/uazapi'
import type { UazapiConfig } from '@/lib/whatsapp/types'
import type { CaixaReceptora, InboundMsg } from '@/lib/channels/types'
import { resolveConversation, insertMensagemDoAplicativo } from '@/lib/inbox/resolve-conversation'
import { gravar } from '@/lib/db'

/**
 * O HISTÓRICO de uma caixa do WhatsApp Web (uazapi) para o inbox (2026-10-13).
 *
 * Ao parear, o WhatsApp manda à instância um recorte recente das conversas
 * (o WhatsApp decide quanto); a uazapi o guarda. Aqui ele é BUSCADO
 * (`/chat/find` + `/message/find`, formato documentado) em vez de lido dos
 * lotes `history` do webhook, cujo formato não é. Grava como o histórico da
 * coexistência: importado, lido, sem evento de conversa (a automação de
 * boas-vindas responderia a conversas de semanas atrás) e sem baixar mídia.
 * Trazer de novo não duplica (dedup pelo id da mensagem).
 *
 * Cada pedido é uma linha de `whatsapp_historicos`: só uma em aberto por
 * caixa (índice), e a passagem REIVINDICA a linha antes de rodar. O andamento
 * (etapa, "12 de 80", sinal de vida) é o que Configurações → Ações em lote
 * mostra (`lib/lotes/acoes.ts`).
 */

/** Até onde se volta — o mesmo da coexistência. */
const DIAS = 180
const MAX_CONVERSAS = 500
const MAX_POR_CONVERSA = 300
const PAGINA_CONVERSAS = 50
const PAGINA_MENSAGENS = 100
/** O histórico inicial chega aos poucos depois do pareamento: espera até ele fechar. */
const ESPERA_MAX_MS = 10 * 60_000
const ESPERA_ENTRE_MS = 20_000
/** Sem sinal de vida há tanto tempo, a passagem morreu (deploy no meio). */
const SEM_SINAL_MS = 15 * 60_000
/** O começo do erro de quem foi interrompido — é por ele que a tela o distingue. */
export const INTERROMPIDA = 'Interrompida'

const agora = () => new Date().toISOString()

/**
 * A passagem roda em `after()`, e um deploy no meio a mata sem aviso. Sem sinal
 * de vida há 15 min, a linha vira falha "interrompida" — senão o índice de uma
 * em aberto por caixa travaria a próxima importação para sempre.
 */
export async function liberarInterrompidas(filtro: { tenantId?: string; numeroId?: string }): Promise<void> {
  let q = createAdminClient().from('whatsapp_historicos').update({
    status: 'falhou', concluida_em: agora(),
    erro: `${INTERROMPIDA}: a importação parou no meio (o servidor reiniciou). Traga de novo.`,
  }).in('status', ['pendente', 'importando']).lt('atualizada_em', new Date(Date.now() - SEM_SINAL_MS).toISOString())
  if (filtro.tenantId) q = q.eq('tenant_id', filtro.tenantId)
  if (filtro.numeroId) q = q.eq('whatsapp_number_id', filtro.numeroId)
  await gravar(q, 'liberar as importações interrompidas')
}

/** Abre um pedido para a caixa. `null` quando já há um em aberto. */
export async function pedirHistoricoUazapi(tenantId: string, numeroId: string): Promise<string | null> {
  await liberarInterrompidas({ numeroId })
  const { data, error } = await createAdminClient().from('whatsapp_historicos')
    .insert({ tenant_id: tenantId, whatsapp_number_id: numeroId })
    .select('id').single<{ id: string }>()
  if (error) {
    if (error.code === '23505') return null
    throw new Error(`abrir a importação do histórico: ${error.message}`)
  }
  return data.id
}

/**
 * Abre o pedido e o roda depois da resposta. Já havendo um em aberto para a
 * caixa, não abre outro (`false`). Falha aqui não derruba quem chamou — vira
 * log, e a tela oferece trazer de novo.
 */
export async function dispararHistoricoUazapi(tenantId: string, numeroId: string): Promise<boolean> {
  try {
    const id = await pedirHistoricoUazapi(tenantId, numeroId)
    if (!id) return false
    after(() => importarHistoricoUazapi(id))
    return true
  } catch (e) {
    console.error('[historico-uazapi] disparar:', e)
    return false
  }
}

/** Roda um pedido (em `after()`): reivindica, espera o histórico fechar, importa. */
export async function importarHistoricoUazapi(historicoId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: linha } = await admin.from('whatsapp_historicos')
    .update({ status: 'importando', etapa: 'aguardando_whatsapp', iniciada_em: agora(), atualizada_em: agora() })
    .eq('id', historicoId).eq('status', 'pendente')
    .select('tenant_id, whatsapp_number_id').maybeSingle<{ tenant_id: string; whatsapp_number_id: string }>()
  if (!linha) return   // outra passagem já pegou

  const placar = { conversas: 0, mensagens: 0 }
  const sinal = (extra: Record<string, unknown> = {}) =>
    admin.from('whatsapp_historicos').update({ ...placar, ...extra, atualizada_em: agora() }).eq('id', historicoId)
  try {
    const numero = await getNumero(linha.whatsapp_number_id)
    if (!numero || numero.provider !== 'uazapi' || numero.tenantId !== linha.tenant_id) {
      throw new Error('A caixa não é mais do WhatsApp Web desta rede.')
    }
    const provider = new UazapiProvider(numero.config as UazapiConfig)
    const caixa: CaixaReceptora = { id: numero.id, channel: 'whatsapp', provider: 'uazapi' }

    for (const inicio = Date.now(); Date.now() - inicio < ESPERA_MAX_MS;) {
      if (await provider.historicoInicialPronto()) break
      await sinal()
      await new Promise(ok => setTimeout(ok, ESPERA_ENTRE_MS))
    }
    await sinal({ etapa: 'importando' })

    const corte = Date.now() - DIAS * 86_400_000
    let offset = 0
    let totalGravado = false
    pagina: for (;;) {
      const { chats, temMais, total } = await provider.buscarConversas(offset, PAGINA_CONVERSAS)
      if (!totalGravado && total !== null) {
        await sinal({ total_conversas: Math.min(total, MAX_CONVERSAS) })
        totalGravado = true
      }
      for (const chat of chats) {
        const ultima = emMilissegundos(chat.wa_lastMsgTimestamp)
        // Vêm da mais recente para a mais antiga: a primeira velha encerra.
        if (ultima && ultima < corte) break pagina
        const n = await importarConversa(linha.tenant_id, provider, caixa, chat, corte)
        if (n === null) continue
        placar.conversas++
        placar.mensagens += n
        await sinal()
        if (placar.conversas >= MAX_CONVERSAS) break pagina
      }
      if (!temMais || chats.length === 0) break
      offset += chats.length
    }
    await gravar(sinal({ status: 'concluida', etapa: null, concluida_em: agora() }), 'concluir a importação do histórico')
  } catch (e) {
    console.error('[historico-uazapi]', historicoId, e)
    await sinal({
      status: 'falhou', etapa: null, concluida_em: agora(),
      erro: e instanceof Error ? e.message.slice(0, 500) : 'erro',
    })
  }
}

/**
 * Uma conversa: as mensagens dentro do corte, da mais antiga para a mais nova.
 * `null` quando nada dela é de atendimento (grupo, status, só mensagem que não
 * abriu); senão, quantas entraram de novo.
 */
async function importarConversa(
  tenantId: string, provider: UazapiProvider, caixa: CaixaReceptora,
  chat: ChatDoHistorico, corte: number,
): Promise<number | null> {
  const chatid = chat.wa_chatid
  if (!chatid) return null
  const lidas: { msg: InboundMsg; daClinica: boolean }[] = []
  let offset = 0
  while (lidas.length < MAX_POR_CONVERSA) {
    const { mensagens, temMais } = await provider.buscarMensagens(chatid, offset, PAGINA_MENSAGENS)
    let passouDoCorte = false
    for (const m of mensagens) {
      const ts = emMilissegundos(m.messageTimestamp ?? null)
      if (ts && ts < corte) { passouDoCorte = true; break }
      const lida = provider.lerDoHistorico(m, chat)
      if (lida) lidas.push(lida)
      if (lidas.length >= MAX_POR_CONVERSA) break
    }
    if (passouDoCorte || !temMais || mensagens.length === 0) break
    offset += mensagens.length
  }
  if (lidas.length === 0) return null

  lidas.sort((a, b) => a.msg.timestamp.localeCompare(b.msg.timestamp))
  const conversa = await resolveConversation(tenantId, lidas[0]!.msg, 'whatsapp', caixa, undefined, { semEventos: true })
  if (!conversa) return null
  let novas = 0
  for (const { msg, daClinica } of lidas) {
    const entrou = await insertMensagemDoAplicativo(conversa.conversationId, tenantId, msg, {
      direction: daClinica ? 'outbound' : 'inbound',
      importada: true,
      status:    daClinica ? 'delivered' : 'read',
    }, caixa)
    if (entrou) novas++
  }
  return novas
}

/** A última importação da caixa, para o bloco da conexão. */
export async function ultimaImportacaoDoHistorico(numeroId: string): Promise<{
  status: string; conversas: number; mensagens: number; erro: string | null; concluida_em: string | null
} | null> {
  await liberarInterrompidas({ numeroId })
  const { data } = await createAdminClient().from('whatsapp_historicos')
    .select('status, conversas, mensagens, erro, concluida_em')
    .eq('whatsapp_number_id', numeroId).order('criada_em', { ascending: false }).limit(1)
  return (data?.[0] as never) ?? null
}
