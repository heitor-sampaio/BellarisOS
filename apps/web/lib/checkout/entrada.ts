import { parseDinheiro, DINHEIRO_INVALIDO, formatBRL } from '@estetica-os/utils'

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

/**
 * A entrada MAIOR que o total é recusada, não cortada (ven-02 da revisão,
 * 2026-11-02: "o plano custa R$ 900 e a Bruna digita entrada de R$ 1.000;
 * grava R$ 900 sem dizer nada"). A tela mostra a frase junto do campo e não
 * deixa seguir; o servidor recusa com a mesma frase (backend sempre). Igual ao
 * total passa: é o pagamento inteiro na entrada.
 *
 * `doQue` completa a frase: "do plano", "da venda", "do que está em aberto".
 */
export function recusaDaEntradaAcimaDoTotal(entrada: number, total: number, doQue = 'do plano'): string | null {
  if (!Number.isFinite(entrada) || !Number.isFinite(total)) return null
  if (Math.round(entrada * 100) <= Math.round(total * 100)) return null
  return `A entrada (${formatBRL(entrada)}) passa do total ${doQue} (${formatBRL(total)}). Corrija a entrada.`
}
