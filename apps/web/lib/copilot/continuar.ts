import type { ConversaNaLista } from '@/lib/copilot/tipos'

/**
 * O "Continuar" do painel vazio (A31 da 16ª, A28 da 19ª): a conversa com um
 * cartão esperando o Confirmar vem antes da mais recente — recarregada a
 * página, a pessoa voltava à conversa errada e pedia tudo de novo.
 */
export function conversaParaContinuar(lista: readonly ConversaNaLista[]): ConversaNaLista | null {
  return lista.find(c => c.cartaoPendente) ?? lista[0] ?? null
}

export function rotuloDoContinuar(c: ConversaNaLista): string {
  return c.cartaoPendente
    ? `Continuar a conversa com um cartão a confirmar: ${c.titulo}`
    : `Continuar a conversa anterior: ${c.titulo}`
}

/**
 * A conversa que o painel vazio ABRE sozinho (A25 da 20ª simulação; princípio
 * 3): recarregada a página, o cartão pendente só voltava pela linha
 * "Continuar…", e quem não a viu fez um pedido novo e deixou o cartão para
 * trás. Com um cartão a confirmar (no prazo), o painel abre nela — a não ser
 * que a pessoa tenha pedido "Nova conversa".
 */
export function conversaParaAbrirSozinha(
  lista: readonly ConversaNaLista[],
  opcoes: { novaDeProposito: boolean },
): ConversaNaLista | null {
  if (opcoes.novaDeProposito) return null
  return lista.find(c => c.cartaoPendente) ?? null
}
