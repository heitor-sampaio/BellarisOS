/**
 * A ordem das Transações da ficha (D7 da 10ª simulação, 2026-11-10;
 * princípio 3): pela data que a LINHA MOSTRA, da mais nova para a mais
 * antiga — o vencimento da parcela em aberto ("Vence 10/12"), o dia do
 * atendimento, senão o lançamento. Era o pagamento (ou o lançamento), e as
 * parcelas gravadas no mesmo instante saíam embaralhadas (3/3, 1/3, 2/3).
 * No empate, a parcela maior primeiro, e o id.
 */
export interface LinhaParaOrdenar {
  id: string
  isPaid: boolean
  dueDate: string | null
  scheduledAt: string | null
  createdAt: string
  parcela?: number | null
}

/** O instante da data que a linha mostra (a mesma escolha da tela). */
export function dataDaLinha(l: LinhaParaOrdenar): number {
  const iso = !l.isPaid && l.dueDate ? l.dueDate : (l.scheduledAt ?? l.createdAt)
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

export function ordenarTransacoesDaFicha<T extends LinhaParaOrdenar>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) =>
    dataDaLinha(b) - dataDaLinha(a)
    || (b.parcela ?? 0) - (a.parcela ?? 0)
    || a.id.localeCompare(b.id))
}
