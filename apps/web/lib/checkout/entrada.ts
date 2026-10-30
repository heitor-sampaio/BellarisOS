import { parseDinheiro, DINHEIRO_INVALIDO } from '@estetica-os/utils'

/**
 * A ENTRADA digitada no "entrada + parcelas" (contrato do procedimento, venda
 * de pacote e checkout do plano) — frente de cadastro, 2026-10-29. Era
 * `parseDinheiro(...) || 0`: o ilegível ("1,400.50", "0.012") virava R$ 0
 * calado e a venda saía sem entrada. Agora é a regra de todo campo de dinheiro
 * (`parseDinheiro`), com a MESMA recusa (`DINHEIRO_INVALIDO`). Vazio continua
 * sendo "sem entrada" (o campo é opcional).
 */
export function lerEntrada(texto: string): { valor: number } | { erro: string } {
  if (!texto.trim()) return { valor: 0 }
  const n = parseDinheiro(texto)
  if (!Number.isFinite(n)) return { erro: DINHEIRO_INVALIDO }
  if (n < 0) return { erro: 'A entrada não pode ser negativa.' }
  return { valor: n }
}

/** A frase da recusa da entrada, ou nulo quando ela se lê. */
export function erroDaEntrada(texto: string): string | null {
  const r = lerEntrada(texto)
  return 'erro' in r ? r.erro : null
}
