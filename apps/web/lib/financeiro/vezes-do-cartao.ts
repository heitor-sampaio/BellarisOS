/**
 * Até quantas vezes a clínica parcela no cartão de crédito (D-15, decisão do
 * Heitor em 2026-10-29: "A clínica configura 'parcela até Nx'. O padrão é o
 * maior número de parcelas com taxa cadastrada.").
 *
 * É o "Vezes no cartão" do à vista no crédito — pago na hora, a maquininha
 * paga a clínica (§9.6). Sem valor gravado (`tenants.cartao_max_vezes`), vale a
 * maior parcela do crédito com taxa em `payment_fees`; sem nenhuma taxa do
 * crédito, o de antes: 12x. Sempre entre 1 e 12 (o banco confere `cartao_vezes`
 * de 1 a 12).
 *
 * Puro: a tela monta o seletor por aqui, e o servidor recusa por aqui
 * (`lib/financeiro/vezes-da-rede.ts`).
 */

export const TETO_DE_VEZES = 12

const entre = (n: number) => Math.max(1, Math.min(TETO_DE_VEZES, Math.trunc(n)))

export function maximoDeVezes(configurado: number | null | undefined, parcelasComTaxa: number[]): number {
  if (configurado != null && Number.isFinite(configurado) && configurado >= 1) return entre(configurado)
  const comTaxa = parcelasComTaxa.filter(n => Number.isFinite(n) && n >= 1)
  return comTaxa.length ? entre(Math.max(...comTaxa)) : TETO_DE_VEZES
}

/** As opções do seletor: de à vista (1) ao máximo. */
export function opcoesDeVezes(maximo: number): number[] {
  return Array.from({ length: entre(maximo) }, (_, i) => i + 1)
}

/** A recusa do servidor, ou `null` quando as vezes cabem no limite. */
export function recusaDasVezes(vezes: number, maximo: number): string | null {
  if (!(vezes > maximo)) return null
  return maximo <= 1
    ? 'A clínica não parcela no cartão de crédito: só à vista.'
    : `A clínica parcela no cartão de crédito em até ${maximo}x.`
}
