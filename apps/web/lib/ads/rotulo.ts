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

/** A primeira linha não vazia do texto do criativo. */
function primeiraLinha(body?: string | null): string | null {
  return (body ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? null
}

export function nomeDoAnuncio(a: RotulavelComoAnuncio): string | null {
  if (a.adName)       return a.adName
  if (a.creativeName) return a.creativeName

  // Sem a integração Meta Ads, a primeira linha do criativo é o melhor nome
  // disponível: é o que a pessoa leu antes de clicar, e é o que a recepção
  // reconhece ao ver a conversa.
  const linha = primeiraLinha(a.body)
  if (!linha) return null

  return linha.length > MAX ? `${linha.slice(0, MAX)}…` : linha
}

/**
 * A legenda do criativo — o texto inteiro do anúncio.
 *
 * Quanto mais se sabe sobre o anúncio que trouxe a pessoa, melhor a resposta:
 * a legenda diz o que foi prometido (o desconto, a data, a condição), e é isso
 * que o cliente vai cobrar na primeira frase.
 *
 * **Não repete o que já virou nome.** Sem a integração Meta Ads o nome É a
 * primeira linha da legenda; mostrá-la de novo logo abaixo faria o selo dizer
 * a mesma coisa duas vezes. Com `adName` vindo da Meta, a legenda aparece
 * inteira, porque aí nada foi repetido.
 */
export function legendaDoAnuncio(a: RotulavelComoAnuncio): string | null {
  const texto = (a.body ?? '').trim()
  if (!texto) return null

  // O nome veio de fora da legenda: ela pode ser mostrada por inteiro.
  if (a.adName || a.creativeName) return texto

  // O nome saiu da primeira linha — a legenda começa da segunda.
  const linhas = texto.split('\n')
  const iPrimeira = linhas.findIndex(l => l.trim())
  const resto = linhas.slice(iPrimeira + 1).join('\n').trim()
  return resto || null
}
