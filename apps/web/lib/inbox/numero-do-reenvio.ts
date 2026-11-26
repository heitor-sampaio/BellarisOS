import type { NumeroDeWhatsApp } from '@/lib/whatsapp/types'

/**
 * Por qual número a mensagem "Não enviada" sai de novo (R11 — o Heitor, 26/11,
 * na página de perguntas: "Está no escopo: o botão 'Tentar de novo' na bolha
 * que não saiu").
 *
 * Pura de propósito, como `escolherNumeroDeSaida`:
 *
 * 1. pelo MESMO número por onde tentou sair, se ele segue no ar e a pessoa que
 *    tenta de novo pode falar por ele — é o da conversa, o DELA
 *    (`whatsapp_number_users`) ou, na conversa sem número, o padrão da rede
 *    (as mesmas caixas que o envio normal usaria);
 * 2. se aquele número saiu (removido, fora do ar), pelo da conversa — ou, na
 *    conversa sem número, pelo padrão;
 * 3. o número de OUTRA pessoa não serve: quem tenta de novo escreve de novo, e
 *    a mensagem sai pelo dela.
 *
 * `numeros` são os da rede SEM os removidos (`getNumerosDaRede`).
 */
export function numeroDoReenvio(
  numeros: NumeroDeWhatsApp[],
  pedido: { daMensagem: string | null; daConversa: string | null; userId: string | null },
): { numero: NumeroDeWhatsApp } | { erro: string } {
  const ativos = numeros.filter(n => n.isActive && !n.removido)
  const padrao = ativos.find(n => n.isDefault) ?? null
  const daConversa = pedido.daConversa ? ativos.find(n => n.id === pedido.daConversa) ?? null : null

  const podeFalarPor = (n: NumeroDeWhatsApp) =>
    n.id === pedido.daConversa
    || (!!pedido.userId && n.userIds.includes(pedido.userId))
    || (!pedido.daConversa && n.isDefault)

  const mesmo = pedido.daMensagem ? ativos.find(n => n.id === pedido.daMensagem) ?? null : null
  if (mesmo) {
    if (podeFalarPor(mesmo)) return { numero: mesmo }
    return {
      erro: `Esta mensagem tentou sair pelo número ${mesmo.label}, que não é o seu nem o da conversa: `
        + 'escreva de novo, e ela sai pelo seu.',
    }
  }

  if (pedido.daConversa) {
    if (daConversa) return { numero: daConversa }
    return { erro: 'O número desta conversa está fora do ar: a mensagem não tem por onde sair. Reconecte-o em Configurações → Integrações.' }
  }

  if (padrao) return { numero: padrao }
  return { erro: 'Esta conversa não tem número, e a rede não tem um número padrão de WhatsApp: a mensagem não tem por onde sair.' }
}
