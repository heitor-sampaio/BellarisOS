import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'

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

  // Agregada no banco (`atividade_dos_contatos`, 2026-10-22): a mais recente e
  // a espera mais antiga de cada pessoa. Lia as conversas de todos os contatos
  // do quadro numa consulta só — mais de 1000 linhas cortadas, e a lista de
  // ids inteira na URL.
  const admin = createAdminClient()
  const linhas = await lerTodas<{ contato_id: string; last_interaction_at: string | null; awaiting_since: string | null }>(
    (de, ate) => admin.rpc('atividade_dos_contatos', { p_tenant: tenantId, p_contatos: ids }).order('contato_id').range(de, ate),
    'carregar a atividade dos contatos',
  )
  for (const l of linhas) {
    porPessoa.set(l.contato_id, { last_interaction_at: l.last_interaction_at, awaiting_since: l.awaiting_since })
  }
  return porPessoa
}
