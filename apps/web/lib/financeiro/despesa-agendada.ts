/**
 * A despesa parcelada e a recorrente do "Novo lançamento": em quantas vezes.
 *
 * O Heitor, 25/11, à pergunta se o "no máximo, avisar" do princípio 2 vale para
 * os limites da despesa: "Se não for impossível, ainda que improvável, pode ser
 * feito." Acima do comum — o antigo teto, que recusava: 48 parcelas, 60
 * repetições — a tela avisa e o servidor grava.
 *
 * O impossível (decisão do Claude, 25/11): menos de 2 (uma vez só é o
 * lançamento único), fração, e a última data a mais de 100 anos — cada parcela
 * ou repetição é um lançamento com a sua data. A parcela é mensal: 1.200
 * (`LIMITE_DE_MESES`). A repetição depende da frequência: 5.214 semanais, 100
 * anuais (`limiteDasRepeticoes`).
 *
 * Puro: a tela e o servidor leem a mesma conta.
 */
import { LIMITE_DE_DIAS, LIMITE_DE_MESES, avisoAcimaDoComum } from '@/lib/acima-do-comum'
import type { FrequenciaRecorrente } from '@/lib/financeiro/vencimentos'

export const PARCELAS_DA_DESPESA_COMUM = 48
export const REPETICOES_DA_DESPESA_COMUM = 60
export const LIMITE_DA_DESPESA_AGENDADA = LIMITE_DE_MESES

const numero = (n: number) => n.toLocaleString('pt-BR')

/** O número do formulário, sem arredondar: "1.5" fica 1,5 (o `parseInt` o cortava em 1); vazio é NaN. */
export function lerQuantidadeDaDespesa(texto: string | null | undefined): number {
  const t = (texto ?? '').trim()
  return t === '' ? Number.NaN : Number(t)
}

const MESES_DA_FREQUENCIA: Partial<Record<FrequenciaRecorrente, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, yearly: 12 }
const DIAS_DA_FREQUENCIA: Partial<Record<FrequenciaRecorrente, number>> = { weekly: 7, biweekly: 14 }
const NOME_DA_FREQUENCIA: Record<FrequenciaRecorrente, string> = {
  weekly: 'semanais', biweekly: 'quinzenais', monthly: 'mensais', bimonthly: 'bimestrais', quarterly: 'trimestrais', yearly: 'anuais',
}

/** Quantas repetições cabem em 100 anos na frequência (a última data, o limite das datas). */
export function limiteDasRepeticoes(freq: FrequenciaRecorrente): number {
  const dias = DIAS_DA_FREQUENCIA[freq]
  return dias ? Math.floor(LIMITE_DE_DIAS / dias) : Math.floor(LIMITE_DE_MESES / (MESES_DA_FREQUENCIA[freq] ?? 1))
}

function recusa(n: number, limite: number, unidade: string, primeiro: string): string | null {
  if (!Number.isInteger(n) || n < 2) return `${primeiro}: um número inteiro, de 2 para cima.`
  return n > limite ? `No máximo ${numero(limite)} ${unidade} (100 anos, o limite das datas).` : null
}

/** A recusa do número de parcelas (mensais) da despesa, ou `null`: só o impossível. */
export function recusaDasParcelasDaDespesa(n: number): string | null {
  return recusa(n, LIMITE_DA_DESPESA_AGENDADA, 'parcelas mensais', 'Diga em quantas parcelas')
}

/** Acima de 48 parcelas: avisa, e vale como está. */
export function avisoDasParcelasDaDespesa(n: number): string | null {
  return avisoAcimaDoComum(n, PARCELAS_DA_DESPESA_COMUM, 'parcelas')
}

/** A recusa do número de repetições da despesa recorrente, ou `null`: só o impossível, na frequência dela. */
export function recusaDasRepeticoesDaDespesa(n: number, freq: FrequenciaRecorrente = 'monthly'): string | null {
  return recusa(n, limiteDasRepeticoes(freq), `repetições ${NOME_DA_FREQUENCIA[freq]}`, 'Diga quantas repetições')
}

/** Acima de 60 repetições: avisa, e vale como está. */
export function avisoDasRepeticoesDaDespesa(n: number): string | null {
  return avisoAcimaDoComum(n, REPETICOES_DA_DESPESA_COMUM, 'repetições')
}
