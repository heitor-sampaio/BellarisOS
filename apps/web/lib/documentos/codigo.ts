import { randomInt } from 'node:crypto'

/**
 * O código de verificação de um documento: 12 caracteres em base32 de
 * Crockford (sem I, L, O e U — nada que se confunda lendo do papel), em grupos
 * de quatro: `7K3Q-M9XD-2HVA`. São 60 bits: não dá para adivinhar um código
 * que exista.
 *
 * Nasce no primeiro render do documento, antes da assinatura, para já sair no
 * papel impresso.
 */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function gerarCodigoDeVerificacao(): string {
  let s = ''
  for (let i = 0; i < 12; i++) s += ALFABETO[randomInt(ALFABETO.length)]
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`
}

/** O que a pessoa digitou → o formato gravado (ou null, se não pode ser um código). */
export function normalizarCodigo(entrada: string): string | null {
  const limpo = entrada.toUpperCase()
    .replace(/[IL]/g, '1').replace(/O/g, '0')
    .replace(/[^0-9A-Z]/g, '')
  if (limpo.length !== 12 || [...limpo].some(c => !ALFABETO.includes(c))) return null
  return `${limpo.slice(0, 4)}-${limpo.slice(4, 8)}-${limpo.slice(8)}`
}
