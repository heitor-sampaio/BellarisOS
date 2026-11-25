/**
 * Até quantas vezes a clínica parcela no cartão de crédito (D-15, decisão do
 * Heitor em 2026-10-29: "A clínica configura 'parcela até Nx'. O padrão é o
 * maior número de parcelas com taxa cadastrada.").
 *
 * É o "Vezes no cartão" do à vista no crédito — pago na hora, a maquininha
 * paga a clínica (§9.6). Sem valor gravado (`maquininhas.max_vezes`), vale a
 * maior parcela do crédito com taxa; sem nenhuma taxa do crédito, o de antes:
 * 12x.
 *
 * Acima de 12 vezes (o Heitor, 25/11: "Se não for impossível, ainda que
 * improvável, pode ser feito."): a tela AVISA e o servidor grava. Só o
 * impossível se recusa — zero, negativo, fracionário e acima de 1.200 vezes
 * (decisão do Claude, 25/11: cada parcela é um recebível com data mensal, e
 * 1.200 meses são 100 anos, o limite das datas; o banco confere o mesmo).
 *
 * Puro: a tela monta o seletor por aqui, e o servidor recusa por aqui
 * (`lib/financeiro/vezes-da-rede.ts`).
 */

import { LIMITE_DO_INTEIRO_CURTO, LIMITE_DE_VEZES_NO_CARTAO, acimaDoRegistro, acimaDeCemAnos, avisoAcimaDoComum } from '@/lib/acima-do-comum'

/** O comum (o teto de antes): acima dele, a tela avisa. */
export const VEZES_COMUNS_NO_CARTAO = 12
/** Sem nenhuma taxa do crédito e sem "Parcelar até", o de sempre (D-15). */
export const VEZES_SEM_TAXA = 12

export const RECUSA_DAS_VEZES_ZERO = 'As vezes no cartão são um número inteiro, de pelo menos 1.'
export const RECUSA_DAS_VEZES_ACIMA_DO_LIMITE = acimaDeCemAnos(LIMITE_DE_VEZES_NO_CARTAO, 'vezes')

/** A recusa do impossível (zero, negativo, fracionário, acima de 1.200), ou `null`. */
export function recusaDasVezesNoCartao(n: number): string | null {
  if (!Number.isInteger(n) || n < 1) return RECUSA_DAS_VEZES_ZERO
  return n > LIMITE_DE_VEZES_NO_CARTAO ? RECUSA_DAS_VEZES_ACIMA_DO_LIMITE : null
}

/** Acima de 12 vezes: avisa, e vale como está. */
export function avisoDasVezesNoCartao(n: number): string | null {
  return avisoAcimaDoComum(n, VEZES_COMUNS_NO_CARTAO, 'vezes')
}

/**
 * A taxa da maquininha não tem teto de negócio (F16-3, o Heitor: "não é pra
 * recusar nada, juros podem passar facilmente de 100% no acumulado") — só não
 * é negativa. O único limite é o do REGISTRO: a parcela da operadora guarda a
 * taxa com três dígitos inteiros (`recebiveis_do_cartao.taxa_pct`,
 * numeric(6,3)); acima de 999,99% a venda não gravaria.
 */
export const TAXA_MAXIMA_DO_REGISTRO = 999.99
/** A recusa da taxa digitada (em %), ou `null`. */
export function recusaDaTaxaDaMaquininha(n: number): string | null {
  if (!Number.isFinite(n)) return 'Use um número na taxa (ex.: 3,49).'
  if (n < 0) return 'A taxa não pode ser negativa.'
  if (n > TAXA_MAXIMA_DO_REGISTRO) return 'A taxa vai até 999,99% (o limite do registro).'
  return null
}

/**
 * O prazo da OPERADORA (r2-fin-01; o Heitor, 2026-11-03: "como a operadora
 * paga de verdade e configurável o prazo"): a parcela k do cartão em N vezes
 * vence k × N dias corridos depois da venda. A clínica muda em Configurações →
 * Comissões (`tenants.cartao_prazo_dias`); o banco confere o intervalo.
 */
export const PRAZO_PADRAO_DA_OPERADORA = 30
/**
 * Princípio 2 (o Heitor, 04/11: "no máximo, avisar"): o prazo é o que a
 * operadora paga de verdade. Acima de 120 dias (o antigo teto, que recusava)
 * a tela avisa; só o registro limita (`smallint`).
 */
export const PRAZO_COMUM_DA_OPERADORA = 120
export const PRAZO_MAXIMO_DA_OPERADORA = LIMITE_DO_INTEIRO_CURTO
export const RECUSA_DO_PRAZO_ZERO = 'O prazo da operadora é de pelo menos 1 dia.'
export const RECUSA_DO_PRAZO_ACIMA_DO_REGISTRO = acimaDoRegistro(PRAZO_MAXIMO_DA_OPERADORA, 'dias')
/** A recusa do prazo digitado, ou `null`. */
export function recusaDoPrazoDaOperadora(n: number): string | null {
  if (!Number.isInteger(n) || n < 1) return RECUSA_DO_PRAZO_ZERO
  return n > PRAZO_MAXIMO_DA_OPERADORA ? RECUSA_DO_PRAZO_ACIMA_DO_REGISTRO : null
}
/** O prazo acima do comum: avisa, e vale como está. */
export function avisoDoPrazoDaOperadora(n: number): string | null {
  return avisoAcimaDoComum(n, PRAZO_COMUM_DA_OPERADORA, 'dias')
}

const entre = (n: number) => Math.max(1, Math.min(LIMITE_DE_VEZES_NO_CARTAO, Math.trunc(n)))

export function maximoDeVezes(configurado: number | null | undefined, parcelasComTaxa: number[]): number {
  if (configurado != null && Number.isFinite(configurado) && configurado >= 1) return entre(configurado)
  const comTaxa = parcelasComTaxa.filter(n => Number.isFinite(n) && n >= 1)
  return comTaxa.length ? entre(Math.max(...comTaxa)) : VEZES_SEM_TAXA
}

/** As opções do seletor: de à vista (1) ao máximo. */
export function opcoesDeVezes(maximo: number): number[] {
  return Array.from({ length: entre(maximo) }, (_, i) => i + 1)
}

/** A recusa do servidor, ou `null` quando as vezes cabem no limite. */
export function recusaDasVezes(vezes: number, maximo: number): string | null {
  if (!(vezes > maximo)) return null
  return maximo <= 1
    ? 'A rede não parcela no cartão de crédito: só à vista.'
    : `A rede parcela no cartão de crédito em até ${maximo}x.`
}
