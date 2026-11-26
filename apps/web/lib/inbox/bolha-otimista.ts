/**
 * A bolha otimista (`opt-…`) dá lugar à mensagem GRAVADA (A3 da 32ª
 * simulação; princípio 3: a falha aparecia duas vezes até recarregar).
 *
 * Na falha, a action devolve a mensagem gravada ("Não enviada", com o
 * motivo). Marcar só a otimista como falhada deixava a gravada de fora, e a
 * releitura pelo sinal da conversa a acrescentava ao lado — a mescla do inbox
 * só consome a otimista que ainda está "enviando". Aqui a otimista sai e a
 * gravada fica, uma vez só (com o id real, que a releitura reconhece).
 *
 * Puro: o inbox chama; o teste também.
 */
export function trocarOtimista<M extends { id: string }>(lista: M[], idOtimista: string, gravada: M): M[] {
  const jaTem = lista.some(m => m.id === gravada.id)
  if (jaTem) {
    return lista
      .filter(m => m.id !== idOtimista)
      .map(m => (m.id === gravada.id ? { ...m, ...gravada } : m))
  }
  if (lista.some(m => m.id === idOtimista)) {
    return lista.map(m => (m.id === idOtimista ? gravada : m))
  }
  return [...lista, gravada]
}
