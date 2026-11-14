/**
 * O aceite de quem assina (DC3, Bloco Documentos leva 2): uma assinatura vale
 * para todos os documentos abertos do momento, e o aceite diz o TÍTULO de cada
 * um — é o que fica gravado na evidência de cada documento.
 *
 * Puro: a tela mostra a frase e o servidor monta a mesma, a partir dos títulos
 * do banco (a que se grava é a do servidor).
 */

/** "A", "A e B", "A, B e C". */
export function listaDeTitulos(titulos: readonly string[]): string {
  if (titulos.length <= 1) return titulos[0] ?? ''
  return `${titulos.slice(0, -1).join(', ')} e ${titulos[titulos.length - 1]}`
}

export function textoDoAceite(assinante: string, titulos: readonly string[]): string {
  return titulos.length <= 1
    ? `Eu, ${assinante}, li e concordo com este documento.`
    : `Eu, ${assinante}, li e concordo com os documentos: ${listaDeTitulos(titulos)}.`
}
