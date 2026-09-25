/**
 * Iniciais de um nome, para avatar.
 *
 * Existe porque o jeito óbvio está ERRADO: `nome[0]` e `nome.charAt(0)` pegam
 * a primeira unidade UTF-16, não o primeiro caractere. Num nome que começa por
 * emoji — e no inbox eles chegam, porque o contato do WhatsApp escolhe o
 * próprio nome — isso devolve **metade de um par substituto**, que não é UTF-8
 * válido.
 *
 * O estrago não fica no avatar torto: o servidor serializa esse meio caractere
 * como U+FFFD e o cliente calcula o substituto solto, os dois textos não batem
 * e o React **descarta a árvore inteira e redesenha no cliente**. Foi o que
 * derrubava a hidratação do inbox (2026-09-25).
 *
 * `Array.from` itera por CODE POINT e é puro UTF-16 — dá o mesmo resultado no
 * Node e no navegador, que é o que a hidratação exige. Agrupar grafemas
 * (`Intl.Segmenter`) daria "👁️‍🗨️" inteiro em vez de "👁", mas depende do ICU de
 * cada lado, e ICU diferente é a mesma falha de novo por outro caminho.
 */
export function iniciaisDoNome(nome: string | null | undefined, quantas: 1 | 2 = 2): string {
  const limpo = (nome ?? '').trim()
  if (!limpo) return '?'

  const partes = limpo.split(/\s+/).filter(Boolean)
  const primeiroDe = (p: string) => Array.from(p)[0] ?? ''

  if (quantas === 1) return primeiroDe(partes[0]!).toUpperCase()

  // Primeiro e ÚLTIMO nome: "Ana Maria Prado" é "AP", não "AM" — o sobrenome é
  // o que distingue duas Anas na lista.
  if (partes.length >= 2) {
    return (primeiroDe(partes[0]!) + primeiroDe(partes[partes.length - 1]!)).toUpperCase()
  }

  // Nome único: as duas primeiras letras, por code point.
  return Array.from(partes[0]!).slice(0, 2).join('').toUpperCase()
}
