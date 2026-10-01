import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, tentar } from '@/lib/db'
import { resolveConversation, insertMensagemDoAplicativo } from '@/lib/inbox/resolve-conversation'
import { conteudoDaMensagemCloud, type MensagemCloud, type OfficialAPIProvider } from '@/lib/whatsapp/official'
import type { CaixaReceptora, InboundMsg } from '@/lib/channels/types'

/**
 * Os webhooks da COEXISTÊNCIA — o número segue no aplicativo WhatsApp Business
 * do celular e o BellarisOS atende ao lado (conectado pelo cadastro
 * incorporado, `lib/whatsapp/cadastro-incorporado.ts`).
 *
 * Três campos que o webhook comum não conhece:
 *  - `smb_message_echoes`: o que a clínica mandou PELO CELULAR. Sem isto, o
 *    inbox só veria o lado do cliente das conversas atendidas no aparelho.
 *  - `history`: até 180 dias de conversas do aplicativo, em pedaços, depois da
 *    conexão. Entra IMPORTADO: não vira não lida, não reordena a fila para o
 *    passado, não dispara automação.
 *  - `smb_app_state_sync`: a agenda de contatos do aparelho. Dá NOME à pessoa
 *    que ainda não tem — o histórico não traz nome nenhum.
 *
 * Nenhum dos três emite evento: nada disso é o cliente falando agora.
 */

interface Mudanca {
  field?: string
  value?: {
    metadata?: { display_phone_number?: string; phone_number_id?: string }
    message_echoes?: (MensagemCloud & { to?: string })[]
    history?: {
      metadata?: { phase?: number; chunk_order?: number; progress?: number }
      threads?: { id?: string; messages?: (MensagemCloud & { to?: string; history_context?: { status?: string } })[] }[]
      errors?: { code?: number; message?: string }[]
    }[]
    state_sync?: {
      type?: string; action?: string
      contact?: { full_name?: string; first_name?: string; phone_number?: string }
    }[]
  }
}

export const CAMPOS_DA_COEXISTENCIA = ['smb_message_echoes', 'history', 'smb_app_state_sync'] as const

/** As mudanças da entrega que são da coexistência (qualquer entrada, qualquer posição). */
export function mudancasDaCoexistencia(corpo: unknown): Mudanca[] {
  const entradas = (corpo as { entry?: { changes?: Mudanca[] }[] } | null)?.entry ?? []
  return entradas.flatMap(e => e.changes ?? [])
    .filter(m => (CAMPOS_DA_COEXISTENCIA as readonly string[]).includes(m.field ?? ''))
}

const digitos = (s: string | undefined | null) => (s ?? '').replace(/\D/g, '') || null

const STATUS_DO_HISTORICO: Record<string, 'sent' | 'delivered' | 'read' | 'failed'> = {
  SENT: 'sent', DELIVERED: 'delivered', READ: 'read', PLAYED: 'read', ERROR: 'failed', PENDING: 'sent',
}

/**
 * A mensagem do aplicativo no formato que a entrada de conversa entende. A
 * identidade é SEMPRE a do cliente — `to` quando quem mandou foi a clínica.
 */
function mensagemDoAplicativo(
  msg: MensagemCloud & { to?: string },
  cliente: string,
  idReserva: string,
): InboundMsg | null {
  const fone = digitos(cliente)
  if (!fone) return null
  const { content, type, media } = conteudoDaMensagemCloud(msg)
  const segundos = parseInt(msg.timestamp ?? '', 10)
  return {
    externalUserId: fone,
    phone:          fone,
    aliases:        [fone],
    content,
    externalId:     msg.id ?? idReserva,
    timestamp:      new Date(Number.isFinite(segundos) ? segundos * 1000 : Date.now()).toISOString(),
    type,
    media,
    ...(msg.context?.id ? { replyToExternalId: String(msg.context.id) } : {}),
  }
}

export async function tratarCoexistencia(
  tenantId: string,
  caixa:    CaixaReceptora,
  provider: OfficialAPIProvider,
  mudancas: Mudanca[],
): Promise<void> {
  for (const m of mudancas) {
    const v = m.value ?? {}
    // O número da CLÍNICA, para saber de que lado está cada mensagem do histórico.
    const daClinica = digitos(v.metadata?.display_phone_number)

    if (m.field === 'smb_message_echoes') {
      for (const eco of v.message_echoes ?? []) {
        const msg = mensagemDoAplicativo(eco, eco.to ?? '', `eco:${eco.to}:${eco.timestamp}`)
        if (!msg) continue
        const conversa = await resolveConversation(tenantId, msg, 'whatsapp', caixa, undefined, { semEventos: true })
        if (!conversa) continue
        // Ao vivo: é a clínica respondendo agora, pelo celular — conta como
        // resposta (zera o "aguardando"), por isso NÃO é importada.
        await insertMensagemDoAplicativo(conversa.conversationId, tenantId, msg,
          { direction: 'outbound', importada: false, status: 'sent' }, caixa, provider)
      }
    }

    if (m.field === 'history') {
      for (const lote of v.history ?? []) {
        // A clínica recusou compartilhar o histórico no aplicativo (2593109):
        // não há o que importar, e não é falha nossa.
        if (lote.errors?.length) {
          console.warn('[coexistencia] histórico não compartilhado:', JSON.stringify(lote.errors))
          continue
        }
        for (const thread of lote.threads ?? []) {
          const cliente = thread.id
          if (!digitos(cliente)) continue
          let conversaId: string | null = null
          for (const h of thread.messages ?? []) {
            const daClinicaEsta = !!daClinica && digitos(h.from) === daClinica
            const msg = mensagemDoAplicativo(h, cliente!, `hist:${cliente}:${h.timestamp}`)
            if (!msg) continue
            if (!conversaId) {
              const conversa = await resolveConversation(tenantId, msg, 'whatsapp', caixa, undefined, { semEventos: true })
              if (!conversa) break
              conversaId = conversa.conversationId
            }
            await insertMensagemDoAplicativo(conversaId, tenantId, msg, {
              direction: daClinicaEsta ? 'outbound' : 'inbound',
              importada: true,
              status:    STATUS_DO_HISTORICO[h.history_context?.status ?? ''] ?? 'delivered',
            }, caixa)
          }
        }
      }
    }

    if (m.field === 'smb_app_state_sync') {
      for (const item of v.state_sync ?? []) {
        if (item.type !== 'contact' || item.action !== 'add') continue
        await nomearPelaAgenda(tenantId, item.contact?.phone_number, item.contact?.full_name ?? item.contact?.first_name)
      }
    }
  }
}

/**
 * A agenda do aparelho dá nome a quem ainda não tem.
 *
 * - Pessoa que já existe (qualquer identificador igual ao telefone): ganha o
 *   nome da agenda SÓ se estiver sem nome, ou com o próprio número como nome.
 *   Nome que alguém da equipe escreveu não é trocado.
 * - Pessoa que ainda não existe: nasce só com nome e telefone. A conversa, se um
 *   dia vier (pelo histórico ou por mensagem nova), a encontra pelo telefone —
 *   é o gatilho `trg_conversa_ganha_contato`. Contato sem conversa não é
 *   defeito (§9.2.1).
 *
 * Só a PESSOA: a tela lê o nome dela, não a cópia da conversa.
 */
async function nomearPelaAgenda(tenantId: string, telefone: string | undefined, nome: string | undefined) {
  const fone = digitos(telefone)
  const nomeLimpo = nome?.trim()
  if (!fone || !nomeLimpo) return
  const admin = createAdminClient()

  const pessoa = await ler(admin.from('contacts').select('id, name')
    .eq('tenant_id', tenantId).overlaps('identifiers', [fone]).limit(1).maybeSingle(), 'buscar a pessoa pelo telefone')

  if (pessoa) {
    const atual = (pessoa.name as string | null)?.trim() ?? ''
    // "Sem nome" = vazio, ou só um número de telefone (o que a conversa põe
    // quando o WhatsApp não mandou nome).
    const semNome = !atual || /^[\d\s+().-]+$/.test(atual)
    if (!semNome || atual === nomeLimpo) return
    await tentar(admin.from('contacts').update({ name: nomeLimpo, updated_at: new Date().toISOString() })
      .eq('id', pessoa.id as string), 'dar à pessoa o nome da agenda do aparelho')
    return
  }

  await tentar(admin.from('contacts').insert({
    tenant_id: tenantId, name: nomeLimpo, phone: fone, identifiers: [fone],
  }), 'criar a pessoa da agenda do aparelho')
}
