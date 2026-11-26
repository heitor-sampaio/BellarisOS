/**
 * Por qual número a mensagem saiu (A2 da 32ª simulação; WL-06, decisão do
 * Claude: "O histórico mostra por qual número cada mensagem saiu"; a Decisão
 * A da 32ª: a bolha "Não enviada" diz o número por onde TENTOU sair).
 *
 * A caixa fica na MENSAGEM (`messages.whatsapp_number_id`), porque ela pode
 * divergir da conversa — quem tem número próprio responde pelo dele
 * (docs/regras/whatsapp-push.md). Só quando a rede tem mais de um número: com
 * um só, dizer qual é ruído.
 *
 * Puro: `getMessages` lê os números da rede (só o id, o nome e se foi
 * removido — nunca a credencial) e chama.
 */

export interface NumeroDaRede {
  id:           string
  label:        string | null
  removido_em?: string | null
}

/** A rede tem mais de um número? Conta os que não foram removidos. */
export function redeTemVariosNumeros(numeros: NumeroDaRede[]): boolean {
  return numeros.filter(n => !n.removido_em).length > 1
}

/**
 * O nome do número de cada mensagem que SAIU (ou tentou sair), quando a rede
 * tem mais de um; nas outras, `null`. O número removido segue com o nome: o
 * histórico é de quando ele existia.
 */
export function comNumeroDeSaida<M extends { direction: string; whatsapp_number_id?: string | null }>(
  mensagens: M[],
  numeros: NumeroDaRede[],
): (M & { saiu_por: string | null })[] {
  const varios = redeTemVariosNumeros(numeros)
  const porId = new Map(numeros.map(n => [n.id, n.label]))
  return mensagens.map(m => ({
    ...m,
    saiu_por: varios && m.direction === 'outbound' && m.whatsapp_number_id
      ? (porId.get(m.whatsapp_number_id) ?? null)
      : null,
  }))
}

/** O texto da bolha: "pelo número Atendimento". */
export function textoDoNumeroDeSaida(rotulo: string): string {
  return `pelo número ${rotulo}`
}
