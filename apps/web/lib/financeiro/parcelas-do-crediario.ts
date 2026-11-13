/**
 * Até quantas parcelas a clínica divide o CREDIÁRIO ("entrada + parcelas")
 * — C38 da F67, a D10 mudada pelo Heitor: "Decisão da rede". Padrão 12, igual
 * em todo caminho que vende no crediário (o Vender, o checkout e o check-in
 * do plano). A despesa não muda (até 48, 60 na recorrente).
 *
 * Puro: a tela e o servidor leem a mesma conta.
 */
export const CREDIARIO_PADRAO = 12
/** O teto do registro (o mesmo da despesa parcelada). */
export const TETO_DO_CREDIARIO = 48

/** De 1x ao limite da rede. */
export function opcoesDeParcelas(maximo: number): number[] {
  const n = Math.max(1, Math.min(TETO_DO_CREDIARIO, Math.trunc(maximo) || CREDIARIO_PADRAO))
  return Array.from({ length: n }, (_, i) => i + 1)
}

/** A recusa para `parcelas` acima do limite da rede, ou `null`. */
export function recusaDasParcelas(parcelas: number, maximo: number): string | null {
  return parcelas > maximo ? `A clínica divide o crediário em até ${maximo}x. Escolha até ${maximo} parcelas.` : null
}

/**
 * Os NOMES do crediário, um só em toda tela que vende nele (A23 da 14ª
 * simulação, F75; princípio 7): a configuração dizia "Crediário da clínica" e o
 * Vender, "Entrada + parcelas" — a Wanda e a Débora não ligavam um ao outro.
 */
export const ROTULO_DO_CREDIARIO = 'Crediário (entrada + parcelas)'

/** "até 6x, o limite da clínica" — a lista parava em 6x sem dizer por quê (A23). */
export function limiteDoCrediarioEmTexto(maximo: number): string {
  return `até ${maximo}x, o limite da clínica`
}

/**
 * O rótulo do meio no crediário (A23): ele é o da ENTRADA, e sem entrada não
 * se cobra nada agora — "Meio de pagamento *" fazia parecer que algo saía em
 * Pix hoje. As parcelas nascem sem meio (D6 da 6ª).
 */
export function rotuloDoMeioNoCrediario(temEntrada: boolean): string {
  return temEntrada ? 'Meio de pagamento da entrada *' : 'Meio de pagamento da entrada (sem entrada, não precisa)'
}
