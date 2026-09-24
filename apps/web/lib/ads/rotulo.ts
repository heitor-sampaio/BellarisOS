/**
 * Como chamar um anúncio, em ordem de utilidade para quem atende.
 *
 * ⚠️ O `headline` do aviso do WhatsApp **não é o nome do anúncio**: é o texto
 * do BOTÃO, e vem "Fale conosco" em 109 de 109 mensagens reais. Ele identifica
 * coisa nenhuma — dois criativos diferentes da mesma campanha têm o mesmo
 * botão —, então não entra nesta escolha e fica no rodapé do selo, como
 * contexto.
 *
 * Mora aqui, e não no componente do inbox, porque é regra pura: importá-la de
 * lá arrastava a árvore inteira do servidor para dentro do teste.
 */

export interface RotulavelComoAnuncio {
  /** Nome que o gestor deu ao anúncio, da Graph API. */
  adName?:       string | null
  /** Nome do criativo na Meta — a peça, que pode ser reusada. */
  creativeName?: string | null
  /** Texto do criativo, que chega no próprio aviso do WhatsApp. */
  body?:         string | null
}

/** Uma linha só: o selo não comporta um parágrafo. */
const MAX = 60

export function nomeDoAnuncio(a: RotulavelComoAnuncio): string | null {
  if (a.adName)       return a.adName
  if (a.creativeName) return a.creativeName

  // Sem a integração Meta Ads, a primeira linha do criativo é o melhor nome
  // disponível: é o que a pessoa leu antes de clicar, e é o que a recepção
  // reconhece ao ver a conversa.
  const primeiraLinha = (a.body ?? '').split('\n').map(l => l.trim()).find(Boolean)
  if (!primeiraLinha) return null

  return primeiraLinha.length > MAX ? `${primeiraLinha.slice(0, MAX)}…` : primeiraLinha
}
