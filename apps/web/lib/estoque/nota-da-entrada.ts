/**
 * A54 da 11ª simulação (2026-11-10): a nota com 3 produtos exigia 3 entradas e
 * repetia a nota 3 vezes. A entrada lembra a nota e o fornecedor da anterior
 * (nesta aba, por 2 horas). Só a aba (sessionStorage): nada se guarda para a
 * rede, e sem storage nada acontece.
 *
 * R34 (o Heitor, 27/11: "Começa vazia, com o botão "Usar a nota NF-…" (a
 * proposta)"): a próxima entrada começa VAZIA, e o botão "Usar a nota NF-1002"
 * traz a nota e o fornecedor da anterior. Era a entrada já preenchida, com o
 * aviso para apagar se fosse outra nota (decisão do Claude, 10/11).
 */
const CHAVE = 'bellaris:nota-da-entrada'
const VALIDADE_MS = 2 * 60 * 60 * 1000

export interface NotaDaEntrada { nota: string; fornecedor: string | null }

export function guardarNotaDaEntrada(nota: string, fornecedor: string): void {
  try {
    if (!nota.trim()) { sessionStorage.removeItem(CHAVE); return }
    sessionStorage.setItem(CHAVE, JSON.stringify({ nota: nota.trim(), fornecedor: fornecedor.trim() || null, em: Date.now() }))
  } catch { /* sem storage: nada a lembrar */ }
}

export function lerNotaDaEntradaAnterior(): NotaDaEntrada | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const bruto = sessionStorage.getItem(CHAVE)
    if (!bruto) return null
    const v = JSON.parse(bruto) as { nota?: string; fornecedor?: string | null; em?: number }
    if (!v.nota || !v.em || Date.now() - v.em > VALIDADE_MS) return null
    return { nota: v.nota, fornecedor: v.fornecedor ?? null }
  } catch { return null }
}

/** O botão da Entrada: "Usar a nota NF-1002" (a nota como foi digitada). */
export function rotuloDeUsarANota(anterior: NotaDaEntrada): string {
  return `Usar a nota ${anterior.nota}`
}

/** O botão só aparece com uma nota anterior e enquanto ela não está no campo. */
export function ofereceUsarANota(anterior: NotaDaEntrada | null, notaNoCampo: string): boolean {
  return !!anterior && notaNoCampo.trim() !== anterior.nota
}
