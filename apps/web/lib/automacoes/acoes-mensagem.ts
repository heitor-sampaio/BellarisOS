import { createAdminClient } from '@/lib/supabase/admin'
import { enviarNaConversa } from '@/lib/inbox/enviar'
import { emitirEventoDeConversa } from '@/lib/events/conversa'
import { EVENTOS } from '@estetica-os/types'
import type { ChannelKind } from '@/lib/channels/types'
import type { ContextoDaExecucao } from './contexto'
import type { AtorDaAutomacao } from './acoes-crm'

/**
 * A ação que fala com o CLIENTE — a de maior consequência do catálogo.
 *
 * Três coisas a distinguem das outras:
 *
 *  1. **Precisa de uma conversa.** Mensagem não existe no vácuo: ela mora numa
 *     thread do inbox, que é onde a equipe vai ver a resposta. Quando o fluxo
 *     não tem conversa no contexto, procuramos a do cliente; não havendo
 *     nenhuma, o passo diz isso em vez de inventar um canal.
 *  2. **A janela de 24h da Meta decide o que dá para mandar.** Fora dela, texto
 *     livre é recusado pela API — e sem checar vira "enviado" que o cliente
 *     nunca recebe. Por isso o node exige um template aprovado para esse caso,
 *     e sem ele o passo falha com motivo legível.
 *  3. **Passa pelos limites** de silêncio noturno e teto por cliente, que as
 *     ações internas não têm.
 *
 * O envio em si é `lib/inbox/enviar.ts`, o mesmo caminho da pessoa no inbox.
 */

export interface PedidoDeMensagem {
  canal:       ChannelKind
  texto:       string
  templateId?: string | null
}

export interface ResultadoDaMensagem {
  resumo:      Record<string, unknown>
  /** Quando preenchido, o motor devolve o run à fila em vez de seguir. */
  esperarAte?: Date
}

/**
 * A conversa em que falar.
 *
 * Preferência pela que já está no contexto (o fluxo nasceu de uma mensagem);
 * senão, a mais recente do cliente naquele canal. Não CRIA conversa: abrir uma
 * thread para mandar a primeira mensagem é outra feature — e no WhatsApp
 * oficial nem seria possível sem template.
 */
async function conversaPara(
  tenantId: string,
  contexto: ContextoDaExecucao,
  canal: ChannelKind,
): Promise<{ id: string } | { motivo: string }> {
  const daConversa = contexto.conversa as { id?: string; canal?: string } | null | undefined
  if (daConversa?.id && (!daConversa.canal || daConversa.canal === canal)) {
    return { id: daConversa.id }
  }

  const clienteId = (contexto.cliente as { id?: string } | null)?.id
  if (!clienteId) {
    return { motivo: 'Este fluxo não tem conversa nem cliente — não há para quem mandar.' }
  }

  const { data, error } = await createAdminClient()
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', clienteId)
    .eq('channel', canal)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)

  if (error) throw new Error(`Não consegui achar a conversa: ${error.message}`)

  const conv = data?.[0]
  if (!conv) {
    return { motivo: `Este cliente não tem conversa aberta em ${canal}. A automação não abre conversa nova.` }
  }
  return { id: conv.id as string }
}

export async function mandarMensagem(
  ator: AtorDaAutomacao,
  contexto: ContextoDaExecucao,
  pedido: PedidoDeMensagem,
): Promise<ResultadoDaMensagem> {
  const texto = pedido.texto.trim()
  if (!texto) throw new Error('A mensagem está vazia.')
  if (!pedido.canal) throw new Error('Nenhum canal escolhido.')

  const alvo = await conversaPara(ator.tenantId, contexto, pedido.canal)
  if ('motivo' in alvo) return { resumo: { enviada: false, motivo: alvo.motivo } }

  const r = await enviarNaConversa(ator.tenantId, alvo.id, texto, {
    id:   null,
    nome: `Automação · ${ator.nome}`,
  })

  if (!r.ok) {
    // Janela fechada não é um erro do sistema: é uma regra da Meta que a
    // clínica precisa ver como tal, com a instrução do que fazer. Como
    // template ainda não está implementado, a mensagem é explícita sobre isso.
    const fechou = /janela/i.test(r.error ?? '')
    throw new Error(
      fechou
        ? `${r.error} Para falar fora das 24h é preciso um template aprovado, que esta versão ainda não envia.`
        : (r.error ?? 'Falha no envio.'),
    )
  }

  // O mesmo evento que a resposta da equipe emite — quem lê a corrente não
  // deveria precisar saber se quem digitou foi uma pessoa ou o motor. A
  // diferença aparece na origem e no ator.
  await emitirEventoDeConversa(EVENTOS.CONVERSA_MENSAGEM_ENVIADA, alvo.id, ator.tenantId, {
    texto,
    mensagemId: r.mensagemId!,
    ator:       { id: null, nome: `Automação · ${ator.nome}`, tipo: 'sistema' },
    origem:     'automacao',
    profundidade: ator.profundidade + 1,
  })

  return {
    resumo: {
      enviada: true, canal: pedido.canal, conversaId: alvo.id,
      // O texto interpolado, não o modelo: é ele que o cliente recebeu.
      texto: texto.length > 120 ? `${texto.slice(0, 120)}…` : texto,
    },
  }
}
