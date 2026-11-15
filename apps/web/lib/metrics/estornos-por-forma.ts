/**
 * O estorno de um pagamento de HOJE, por forma (A3 da 16ª simulação). A regra
 * do Fechamento fica (`indicadores.md`: no mesmo dia, um anula o outro — o
 * pagamento estornado já está fora das entradas); a linha da forma só DIZ
 * quanto saiu assim, para "Entradas R$ 89,00" fechar com os R$ 409,00
 * passados na maquininha.
 *
 * Pura e em centavos: a tela lê o número, não soma.
 */

/** A chave da linha do Fechamento: CASH, PIX, DEBIT_CARD, CREDIT_CARD:3… (a de `metrics_fechamento_do_dia`). */
export function chaveDaFormaDoFechamento(forma: string | null, vezes: number | null): string {
  if (!forma) return 'SEM_FORMA'
  return forma === 'CREDIT_CARD' && (vezes ?? 1) > 1 ? `CREDIT_CARD:${vezes}` : forma
}

export function estornadoNoMesmoDiaPorForma(
  itens: readonly { forma: string | null; vezes: number | null; valor: number; mesmoDia: boolean }[],
): Record<string, number> {
  const centavos: Record<string, number> = {}
  for (const e of itens) {
    if (!e.mesmoDia || !(e.valor > 0)) continue
    const chave = chaveDaFormaDoFechamento(e.forma, e.vezes)
    centavos[chave] = (centavos[chave] ?? 0) + Math.round(e.valor * 100)
  }
  return Object.fromEntries(Object.entries(centavos).map(([k, v]) => [k, v / 100]))
}
