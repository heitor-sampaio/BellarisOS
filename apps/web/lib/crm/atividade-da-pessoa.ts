import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

export interface AtividadeDaPessoa {
  /** A última mensagem em QUALQUER thread da pessoa. */
  last_interaction_at: string | null
  /** Desde quando ela espera resposta — a espera mais antiga entre as threads. */
  awaiting_since: string | null
}

/**
 * A atividade de cada pessoa, para o card do quadro de oportunidades.
 *
 * Antes vinha da conversa onde a oportunidade NASCEU
 * (`conversations!leads_conversation_id_fkey`). No handoff — nasce no número do
 * marketing, a unidade assume por outro — o card mostrava a conversa que já
 * tinha parado, e "aguardando resposta" sumia justamente de quem está
 * esperando na thread viva.
 *
 * A espera é a MAIS ANTIGA porque a pergunta do card é "tem alguém sem
 * resposta, e há quanto tempo?". A mais recente esconderia uma mensagem
 * esquecida na outra caixa.
 *
 * Fora de `actions/` porque é leitura de página: todo export de um arquivo
 * `'use server'` vira endpoint público. Quem chama já autorizou.
 */
export async function atividadeDasPessoas(
  tenantId: string,
  contatoIds: string[],
): Promise<Map<string, AtividadeDaPessoa>> {
  const porPessoa = new Map<string, AtividadeDaPessoa>()
  const ids = [...new Set(contatoIds.filter(Boolean))]
  if (ids.length === 0) return porPessoa

  const threads = await ler(
    createAdminClient()
      .from('conversations')
      .select('contato_id, last_message_at, awaiting_since')
      .eq('tenant_id', tenantId)
      .in('contato_id', ids),
    'carregar a atividade dos contatos',
  )

  for (const t of (threads ?? []) as {
    contato_id: string; last_message_at: string | null; awaiting_since: string | null
  }[]) {
    const atual = porPessoa.get(t.contato_id) ?? { last_interaction_at: null, awaiting_since: null }
    // Por Date.parse, não por texto: o Postgres corta zeros das frações de
    // segundo, e aí `…02.4312+00` e `…02.431208+00` não ordenam como texto.
    const ms = (v: string | null) => (v ? Date.parse(v) : NaN)
    if (t.last_message_at && !(ms(atual.last_interaction_at) >= ms(t.last_message_at))) {
      atual.last_interaction_at = t.last_message_at
    }
    if (t.awaiting_since && !(ms(atual.awaiting_since) <= ms(t.awaiting_since))) {
      atual.awaiting_since = t.awaiting_since
    }
    porPessoa.set(t.contato_id, atual)
  }
  return porPessoa
}
