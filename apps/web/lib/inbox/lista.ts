/**
 * O que a lista do inbox faz com um evento de conversa vindo do Realtime.
 *
 * A sutileza que motivou este módulo: **a conversa não nasce pronta para a
 * lista**. `resolveConversation` cria o contato primeiro e a mensagem depois,
 * e `getConversations` descarta quem não tem `last_message_at` — contato sem
 * mensagem nenhuma não é conversa, é só um cadastro. Então, quando alguém novo
 * escreve pela primeira vez, chegam DOIS eventos:
 *
 *   1. INSERT da conversa, ainda muda — não pertence à lista;
 *   2. UPDATE da conversa, feito pelo trigger `on_new_message`, que é o
 *      instante em que ela passa a pertencer.
 *
 * Tratar o UPDATE só como "mescla o que já está na lista" fazia o inbox nunca
 * mostrar conversa nova sem recarregar a página — que foi o defeito relatado.
 *
 * Mora aqui, fora do componente, porque é regra pura e é o tipo de decisão que
 * se quebra em silêncio: ninguém percebe um evento que deixou de chegar.
 */

export interface ConversaDoRealtime {
  id:              string
  last_message_at: string | null
}

export type DestinoDoEvento = 'atualizar' | 'recarregar' | 'ignorar'

/**
 * @param conversa    a linha como veio do Realtime
 * @param estaNaLista se ela já está entre as conversas exibidas
 * @param semResposta ids que o servidor JÁ se recusou a devolver — conversa de
 *                    outro dono, por exemplo. Sem esta marca, cada mensagem
 *                    trocada nelas mandaria uma consulta que não traz nada.
 */
export function destinoDoEvento(
  conversa:    ConversaDoRealtime,
  estaNaLista: boolean,
  semResposta: ReadonlySet<string> = new Set(),
): DestinoDoEvento {
  if (estaNaLista) return 'atualizar'

  // Ainda muda: o servidor não a devolveria, e um card sem última mensagem
  // apareceria por um instante só para sumir no recarregamento seguinte.
  if (!conversa.last_message_at) return 'ignorar'

  if (semResposta.has(conversa.id)) return 'ignorar'

  // Ela acabou de virar conversa. Só o servidor monta o card inteiro — tags,
  // dono, etapa e funil vêm de outras tabelas e não estão na linha do Realtime.
  return 'recarregar'
}
