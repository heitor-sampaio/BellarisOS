import { formatDia } from '@estetica-os/utils'
import { dayKeyTZ } from '@/lib/datetime'

/**
 * A validade do LOTE é um DIA, sem hora (D1 da 7ª simulação, 2026-11-05): o
 * campo de data da entrada manda "AAAA-MM-DD", gravado à meia-noite UTC — 21h
 * da VÉSPERA em Brasília. Com `new Date(validade)` a tela do Estoque dizia
 * "vence 14/11/2026" para o lote de 15/11, enquanto Relatórios → Estoque
 * (`validadeDoLote`) dizia 15/11. A regra é UMA, aqui, pelo dia do calendário
 * como foi gravado (`formatDia`, CLAUDE.md §14) e o HOJE de Brasília:
 * - a tela mostra o dia gravado;
 * - no dia da validade o lote ainda vale; vencido é do dia seguinte em diante;
 * - "vence até" uma data compara os dias.
 * Puro: roda no servidor e no navegador.
 */

/** O dia da validade ("AAAA-MM-DD"), como foi gravado. */
export function diaDaValidade(validade: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(validade ?? '')
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** A validade para a tela: "15/11/2026". */
export function validadeNaTela(validade: string | null | undefined): string | null {
  return formatDia(validade)
}

/** O lote já venceu: o dia de hoje (Brasília) passou do dia da validade. */
export function loteVencido(validade: string | null | undefined, agora: Date = new Date()): boolean {
  const dia = diaDaValidade(validade)
  return dia != null && dia < dayKeyTZ(agora)
}

/** O lote vence até a data (inclusive), pelo dia — os já vencidos entram. */
export function venceAte(validade: string | null | undefined, ate: Date): boolean {
  const dia = diaDaValidade(validade)
  return dia != null && dia <= dayKeyTZ(ate)
}
