/**
 * A ordem das Transações da ficha.
 *
 * Item 17 do escopo de 18/11 (o Heitor: "ok"): o que está EM ABERTO (a
 * parcela, o a receber) vem primeiro, em ordem de vencimento — a vencida, ou a
 * mais próxima, primeiro; sem vencimento, depois das que têm. O resto (o pago,
 * o estornado, o estorno) segue a régua do D7 da 10ª simulação: pela data que
 * a LINHA MOSTRA, da mais nova para a mais antiga — o dia do pagamento (D4 da
 * 28ª), senão o do atendimento, senão o lançamento. No empate, a parcela (a menor primeiro no em aberto, a
 * maior primeiro no resto), e o id.
 */
export interface LinhaParaOrdenar {
  id: string
  isPaid: boolean
  dueDate: string | null
  scheduledAt: string | null
  createdAt: string
  paidAt?: string | null
  parcela?: number | null
  estornada?: boolean
  estorno?: boolean
  saida?: boolean
}

/**
 * A data que a linha MOSTRA (e pela qual se ordena): o em aberto, o
 * vencimento; o pago (e o estorno), o dia em que o dinheiro entrou ou saiu —
 * `paid_at` (D4 da 28ª: RE-01 e o princípio 5; a linha mostrava o dia do
 * atendimento); sem ele, o dia do atendimento, senão o lançamento.
 */
export function isoDaLinha(l: LinhaParaOrdenar): string {
  if (!l.isPaid && l.dueDate) return l.dueDate
  if (l.isPaid && l.paidAt) return l.paidAt
  return l.scheduledAt ?? l.createdAt
}

/** O instante da data que a linha mostra (a mesma escolha da tela). */
export function dataDaLinha(l: LinhaParaOrdenar): number {
  const t = new Date(isoDaLinha(l)).getTime()
  return Number.isNaN(t) ? 0 : t
}

/** A linha ainda a receber (nem paga, nem estornada, nem estorno, nem saída). */
export function emAbertoNaFicha(l: LinhaParaOrdenar): boolean {
  return !l.isPaid && !l.estornada && !l.estorno && !l.saida
}

const vencimento = (l: LinhaParaOrdenar): number => {
  const t = l.dueDate ? new Date(l.dueDate).getTime() : NaN
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

export function ordenarTransacoesDaFicha<T extends LinhaParaOrdenar>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => {
    const abertaA = emAbertoNaFicha(a), abertaB = emAbertoNaFicha(b)
    if (abertaA !== abertaB) return abertaA ? -1 : 1
    if (abertaA) {
      const va = vencimento(a), vb = vencimento(b)
      if (va !== vb) return va < vb ? -1 : 1
      return (a.parcela ?? 0) - (b.parcela ?? 0) || dataDaLinha(a) - dataDaLinha(b) || a.id.localeCompare(b.id)
    }
    return dataDaLinha(b) - dataDaLinha(a)
      || (b.parcela ?? 0) - (a.parcela ?? 0)
      || a.id.localeCompare(b.id)
  })
}

/** "Vencida há 13 dias" (item 17): os dias vêm do servidor, no fuso da unidade (`diasAteOVencimento`). */
export function vencidaHaEmTexto(dias: number): string {
  const n = Math.max(1, Math.round(dias))
  return `Vencida há ${n} ${n === 1 ? 'dia' : 'dias'}`
}
