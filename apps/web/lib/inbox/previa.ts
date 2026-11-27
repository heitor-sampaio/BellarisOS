/**
 * A prévia da conversa na lista (o texto e a hora da última mensagem) conta só
 * o que SAIU — aceito pelo provedor — ou CHEGOU (A6 e A7 da 38ª; IN-18: "a
 * resposta que não saiu não é resposta"; princípio 3). A "Não enviada" e a que
 * ainda está saindo não mexem nela, nem na "Última interação".
 *
 * É a régua do banco (`on_new_message` e `on_mensagem_aceita`, migration
 * 20261217100001): a tela a aplica ao que o servidor devolve, sem prévia
 * otimista antes da resposta.
 */

const ACEITAS = new Set(['sent', 'delivered', 'read'])

export interface MensagemDaPrevia {
  conversation_id: string
  content:         string
  created_at:      string
  direction:       string
  status:          string | null
}

/** A mensagem que conta: a que chegou, ou a que o provedor aceitou. */
export function contaNaPrevia(msg: Pick<MensagemDaPrevia, 'direction' | 'status'>): boolean {
  return msg.direction === 'inbound' || ACEITAS.has(msg.status ?? '')
}

/** A conversa com a prévia da mensagem — ou a mesma, se a mensagem não conta. */
export function comPreviaDaMensagem<C extends { id: string; last_message: string | null; last_message_at: string | null }>(
  conversa: C,
  msg: MensagemDaPrevia,
): C {
  if (conversa.id !== msg.conversation_id || !contaNaPrevia(msg)) return conversa
  return { ...conversa, last_message: msg.content, last_message_at: msg.created_at }
}
