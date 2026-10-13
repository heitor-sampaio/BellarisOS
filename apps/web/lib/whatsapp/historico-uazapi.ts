import 'server-only'
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
 * (\`/chat/find\` + \`/message/find\`, formato documentado) em vez de lido dos
 * lotes \`history\` do webhook, cujo formato não é. Grava como o histórico da
 * coexistência: importado, lido, sem evento de conversa (a automação de
 * boas-vindas responderia a conversas de semanas atrás) e sem baixar mídia.
 * Trazer de novo não duplica (dedup pelo id da mensagem).
 *
 * Cada pedido é uma linha de \`whatsapp_historicos\`: só uma em aberto por
 * caixa (índice), e a passagem REIVINDICA a linha antes de rodar.
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

type Admin = ReturnType<typeof createAdminClient>

/** Abre um pedido para a caixa. `null` quando já há um em aberto. */
export async function pedirHistoricoUazapi(tenantId: string, numeroId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from('whatsapp_historicos')
    .insert({ tenant_id: tenantId, whatsapp_number_id: numeroId })
    .select('id').single<{ id: string }>()
  if (error) {
    if (error.code === '23505') return null
    throw new Error(`abrir a importação do histórico: ${error.message}`)
  }
  return data.id
}

/** Roda um pedido (em `after()`): reivindica, espera o histórico fechar, importa. */
export async function importarHistoricoUazapi(historicoId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: linha } = await admin.from('whatsapp_historicos')
    .update({ status: 'importando', iniciada_em: new Date().toISOString() })
    .eq('id', historicoId).eq('status', 'pendente')
    .select('tenant_id, whatsapp_number_id').maybeSingle<{ tenant_id: string; whatsapp_number_id: string }>()
  if (!linha) return   // outra passagem já pegou

  const placar = { conversas: 0, mensagens: 0 }
  try {
    const numero = await getNumero(linha.whatsapp_number_id)
    if (!numero || numero.provider !== 'uazapi' || numero.tenantId !== linha.tenant_id) {
      throw new Error('A caixa não é mais do WhatsApp Web desta rede.')
    }
    const provider = new UazapiProvider(numero.config as UazapiConfig)
    const caixa: CaixaReceptora = { id: numero.id, channel: 'whatsapp', provider: 'uazapi' }

    for (const inicio = Date.now(); Date.now() - inicio < ESPERA_MAX_MS;) {
      if (await provider.historicoInicialPronto()) break
      await new Promise(ok => setTimeout(ok, ESPERA_ENTRE_MS))
    }

    const corte = Date.now() - DIAS * 86_400_000
    let offset = 0
    pagina: for (;;) {
      const { chats, temMais } = await provider.buscarConversas(offset, PAGINA_CONVERSAS)
      for (const chat of chats) {
        const ultima = emMilissegundos(chat.wa_lastMsgTimestamp)
        // Vêm da mais recente para a mais antiga: a primeira velha encerra.
        if (ultima && ultima < corte) break pagina
        const n = await importarConversa(linha.tenant_id, provider, caixa, chat, corte)
        if (n === null) continue
        placar.conversas++
        placar.mensagens += n
        if (placar.conversas >= MAX_CONVERSAS) break pagina
        if (placar.conversas % 10 === 0) await atualizar(admin, historicoId, placar)
      }
      if (!temMais || chats.length === 0) break
      offset += chats.length
    }
    await gravar(admin.from('whatsapp_historicos').update({
      status: 'concluida', ...placar, concluida_em: new Date().toISOString(),
    }).eq('id', historicoId), 'concluir a importação do histórico')
  } catch (e) {
    console.error('[historico-uazapi]', historicoId, e)
    await admin.from('whatsapp_historicos').update({
      status: 'falhou', ...placar, erro: e instanceof Error ? e.message.slice(0, 500) : 'erro',
      concluida_em: new Date().toISOString(),
    }).eq('id', historicoId)
  }
}

async function atualizar(admin: Admin, id: string, placar: { conversas: number; mensagens: number }) {
  await admin.from('whatsapp_historicos').update(placar).eq('id', id)
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

/** A última importação da caixa, para a tela. */
export async function ultimaImportacaoDoHistorico(numeroId: string): Promise<{
  status: string; conversas: number; mensagens: number; erro: string | null; concluida_em: string | null
} | null> {
  const { data } = await createAdminClient().from('whatsapp_historicos')
    .select('status, conversas, mensagens, erro, concluida_em')
    .eq('whatsapp_number_id', numeroId).order('criada_em', { ascending: false }).limit(1)
  return (data?.[0] as never) ?? null
}
