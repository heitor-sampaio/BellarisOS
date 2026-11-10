/**
 * A54 da 11ª simulação (2026-11-10): a nota com 3 produtos exigia 3 entradas e
 * repetia a nota 3 vezes. A entrada lembra a nota e o fornecedor da anterior
 * (nesta aba, por 2 horas), e a próxima — outro produto da mesma nota — já vem
 * com eles; a tela diz que veio da anterior e que dá para apagar. Só a aba
 * (sessionStorage): nada se guarda para a clínica, e sem storage nada acontece.
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
