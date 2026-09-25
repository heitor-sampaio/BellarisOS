import type { NumeroDeWhatsApp } from './types'

/**
 * Por qual caixa da rede esta mensagem sai.
 *
 * Função PURA, e de propósito: é a regra mais fácil de "consertar" errado no
 * futuro, e é a única parte desta frente que dá para trancar sem banco.
 *
 * A precedência é a decisão do Heitor em 2026-09-25, reafirmada depois de eu
 * explicar o custo:
 *
 * 1. **O número do usuário, sempre que ele tiver um** — inclusive respondendo
 *    uma conversa que chegou por outra caixa.
 * 2. A caixa da própria conversa.
 * 3. O padrão da rede — é por ele que sai tudo que o SISTEMA inicia.
 *
 * O custo do item 1 é real: o cliente recebe de um número que não conhece, abre
 * uma thread nova no celular dele, a resposta volta como conversa nova, e a
 * janela de 24h daquela conversa não vale para a caixa nova. Nada disso é
 * escondido — `avisoDeCaixaDiferente` põe na tela antes de digitar, e a janela é
 * conferida contra a caixa que VAI ENVIAR. O que não pode é falhar calado.
 *
 * **Não existe fallback para "a primeira ativa".** Rede com caixas ativas e
 * nenhum padrão devolve `null`, e quem chama avisa. O índice único garante NO
 * MÁXIMO um padrão, não PELO MENOS um — resolver a falta com um chute seria
 * ressuscitar o `data[0]` de `getWhatsAppConfig`, que é o defeito que esta
 * frente inteira existe para matar.
 */
export function escolherNumeroDeSaida(
  numeros: NumeroDeWhatsApp[],
  userId: string | null,
  numeroDaConversa: string | null,
): NumeroDeWhatsApp | null {
  const ativos = numeros.filter(n => n.isActive)

  if (userId) {
    const doUsuario = ativos.find(n => n.userId === userId)
    if (doUsuario) return doUsuario
  }

  if (numeroDaConversa) {
    const daConversa = ativos.find(n => n.id === numeroDaConversa)
    if (daConversa) return daConversa
  }

  return ativos.find(n => n.isDefault) ?? null
}

/**
 * O que o cliente vai estranhar, dito antes de a mensagem sair.
 *
 * Devolve `null` quando não há nada a avisar — a caixa que vai enviar é a mesma
 * por onde a conversa acontece, que é o caso comum.
 *
 * Existe porque a alternativa é pior: sem aviso, quem atende descobre que
 * respondeu de outro número quando o cliente pergunta "quem é você?". E no
 * provedor oficial nem chega lá — o texto livre simplesmente falha, com um 400
 * genérico que não explica nada.
 */
export function avisoDeCaixaDiferente(
  vaiEnviar: { id: string; label: string },
  daConversa: { id: string; label: string } | null,
): string | null {
  if (!daConversa || daConversa.id === vaiEnviar.id) return null

  return `Você responde pelo seu número (${vaiEnviar.label}). `
    + `O cliente conhece este atendimento por ${daConversa.label} — `
    + `ele vai receber de outro número, numa conversa nova.`
}
