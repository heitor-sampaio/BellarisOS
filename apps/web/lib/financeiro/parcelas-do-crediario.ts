/**
 * Até quantas parcelas a clínica divide o CREDIÁRIO ("entrada + parcelas")
 * — C38 da F67, a D10 mudada pelo Heitor: "Decisão da rede". Padrão 12, igual
 * em todo caminho que vende no crediário (o Vender, o checkout e o check-in
 * do plano). A despesa não muda (até 48, 60 na recorrente).
 *
 * Puro: a tela e o servidor leem a mesma conta.
 */
import { LIMITE_DO_INTEIRO_CURTO, acimaDoRegistro, avisoAcimaDoComum } from '@/lib/acima-do-comum'

export const CREDIARIO_PADRAO = 12
/**
 * Princípio 2 (o Heitor, 04/11: "no máximo, avisar"): a rede divide em quantas
 * parcelas quiser. Acima de 48 (o antigo teto, que recusava) a configuração
 * avisa; só o registro limita (`tenants.crediario_max_parcelas`, smallint).
 */
export const CREDIARIO_COMUM = 48
export const TETO_DO_CREDIARIO = LIMITE_DO_INTEIRO_CURTO

/** A recusa do limite que a rede escolhe, ou `null`: só o impossível (zero, fração, acima do registro). */
export function recusaDoMaximoDeParcelas(n: number): string | null {
  if (!Number.isInteger(n) || n < 1) return 'Diga em até quantas parcelas: um número inteiro, de 1 para cima.'
  return n > TETO_DO_CREDIARIO ? acimaDoRegistro(TETO_DO_CREDIARIO, 'parcelas') : null
}

/** O limite acima do comum: avisa, e vale como está. */
export function avisoDoMaximoDeParcelas(n: number): string | null {
  return avisoAcimaDoComum(n, CREDIARIO_COMUM, 'parcelas')
}

/** De 1x ao limite da rede. */
export function opcoesDeParcelas(maximo: number): number[] {
  const n = Math.max(1, Math.min(TETO_DO_CREDIARIO, Math.trunc(maximo) || CREDIARIO_PADRAO))
  return Array.from({ length: n }, (_, i) => i + 1)
}

/** A recusa para `parcelas` acima do limite da rede, ou `null`. */
export function recusaDasParcelas(parcelas: number, maximo: number): string | null {
  return parcelas > maximo ? `A rede divide o crediário em até ${maximo}x. Escolha até ${maximo} parcelas.` : null
}

/**
 * Os NOMES do crediário, um só em toda tela que vende nele (A23 da 14ª
 * simulação, F75; princípio 7): a configuração dizia "Crediário da clínica" e o
 * Vender, "Entrada + parcelas" — a Wanda e a Débora não ligavam um ao outro.
 * PDV8 (o Heitor, 13/11: "o crediario é uma forma de pagamento"): é o nome do
 * bloco, ao lado de Pix, Dinheiro, Débito e Crédito — "Crediário", só.
 */
export const ROTULO_DO_CREDIARIO = 'Crediário'

/** "até 6x, o limite da rede" — a lista parava em 6x sem dizer por quê (A23). */
export function limiteDoCrediarioEmTexto(maximo: number): string {
  return `até ${maximo}x, o limite da rede`
}

/**
 * A opção do seletor de parcelas (A1 da 20ª simulação; princípios 3 e 7): no
 * crediário com entrada, "3x" eram a entrada mais 3 parcelas — 4 pagamentos —,
 * e quem queria "3 vezes, a primeira hoje" escolhia errado. Com entrada, a
 * opção diz quantos pagamentos dá.
 */
export function rotuloDaOpcaoDeParcelas(n: number, comEntrada: boolean): string {
  return comEntrada ? `${n}x + entrada (${n + 1} pagamentos)` : `${n}x`
}
