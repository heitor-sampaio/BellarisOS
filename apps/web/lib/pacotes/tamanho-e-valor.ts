import { z } from 'zod'
import { LIMITE_DO_INTEIRO_CURTO, acimaDoRegistro, avisoAcimaDoComum } from '@/lib/acima-do-comum'

/**
 * Quantas sessões e quanto custa um pacote — o do catálogo e o trazido de fora
 * (a ficha e a importação). Uma regra só, lida pelas telas e pelas actions.
 *
 * Recusava-se mais de 100 sessões (no total e em cada procedimento), mais de
 * 30 procedimentos, o preço acima de R$ 1.000.000 e o valor de referência
 * acima de R$ 10.000.000. O Heitor, 25/11: "Se não for impossível, ainda que
 * improvável, pode ser feito."
 *
 * Decisão do Claude, 25/11: o "comum" é o antigo teto — acima dele a tela
 * avisa e o servidor grava. O impossível:
 * - as sessões: cada uma vira UMA LINHA em `package_sessions` — até 32.767
 *   (`LIMITE_DO_INTEIRO_CURTO`, o mesmo do crediário);
 * - o preço e o valor de referência: gravam em `service_packages.price`
 *   (numeric(10,2); o pacote de fora grava ali o valor de referência) e, na
 *   venda, em `financial_transactions.amount` (numeric(10,2)) — até
 *   R$ 99.999.999,99;
 * - os procedimentos: sem limite próprio (não há motivo técnico); cada linha
 *   tem ao menos uma sessão, e as sessões já têm o delas.
 */

export const SESSOES_COMUNS_NUM_PACOTE = 100
export const LIMITE_DE_SESSOES_NUM_PACOTE = LIMITE_DO_INTEIRO_CURTO
export const PRECO_COMUM_DO_PACOTE = 1_000_000
export const VALOR_DE_REFERENCIA_COMUM = 10_000_000
/** O maior numeric(10,2). */
export const LIMITE_DO_VALOR_DO_PACOTE = 99_999_999.99

export const RECUSA_DAS_SESSOES_DO_PACOTE = acimaDoRegistro(LIMITE_DE_SESSOES_NUM_PACOTE, 'sessões num pacote')
export const RECUSA_DO_VALOR_DO_PACOTE = acimaDoRegistro(LIMITE_DO_VALOR_DO_PACOTE, 'reais')
const SESSAO_INTEIRA = 'O número de sessões é inteiro.'

/** Nulo = o total se grava. */
export function recusaDasSessoesDoPacote(total: number): string | null {
  return total > LIMITE_DE_SESSOES_NUM_PACOTE ? RECUSA_DAS_SESSOES_DO_PACOTE : null
}

/** "Acima do comum (mais de 100 sessões)…" — ou nulo. */
export function avisoDasSessoesDoPacote(total: number): string | null {
  return avisoAcimaDoComum(total, SESSOES_COMUNS_NUM_PACOTE, 'sessões')
}

/** "Acima do comum (mais de 1.000.000 reais)…" — ou nulo. */
export function avisoDoPrecoDoPacote(preco: number): string | null {
  return avisoAcimaDoComum(preco, PRECO_COMUM_DO_PACOTE, 'reais')
}

/** "Acima do comum (mais de 10.000.000 reais)…" — ou nulo. */
export function avisoDoValorDeReferencia(valor: number): string | null {
  return avisoAcimaDoComum(valor, VALOR_DE_REFERENCIA_COMUM, 'reais')
}

/** As sessões de um procedimento do catálogo (o total do pacote se confere à parte). */
export const SessoesDoItemDoPacote = z.number({ message: 'Informe as sessões do procedimento.' })
  .int(SESSAO_INTEIRA).min(1, 'Cada procedimento entra pelo menos uma vez.')

export const PrecoDoPacote = z.number({ message: 'Informe o preço do pacote.' })
  .min(0, 'O preço do pacote não pode ser negativo.').max(LIMITE_DO_VALOR_DO_PACOTE, RECUSA_DO_VALOR_DO_PACOTE)

export const SessoesDoPacoteDeFora = z.number({ message: 'Informe as sessões do pacote.' })
  .int(SESSAO_INTEIRA).min(1, 'O pacote tem pelo menos 1 sessão.').max(LIMITE_DE_SESSOES_NUM_PACOTE, RECUSA_DAS_SESSOES_DO_PACOTE)

export const UsadasDoPacoteDeFora = z.number({ message: 'Informe as sessões já usadas.' })
  .int(SESSAO_INTEIRA).min(0, 'As sessões usadas não podem ser negativas.')

/** O valor de referência do pacote inteiro (opcional — sem ele, R$ 0 de comissão de execução). */
export const ValorDeReferenciaDoPacote = z.number({ message: 'Valor de referência inválido.' })
  .min(0, 'O valor de referência não pode ser negativo.').max(LIMITE_DO_VALOR_DO_PACOTE, RECUSA_DO_VALOR_DO_PACOTE).nullable()
