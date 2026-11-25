/**
 * O dia do mês do gatilho "Todo mês" (princípios 2 e 3; decisão do Claude,
 * 25/11). Ia só até 28 (escolha do Claude na fase 4, 23/09: "29, 30 e 31 não
 * existem em todo mês"), sem regra de negócio por trás. O motor
 * (`estaNaHora`, `lib/automacoes/tempo.ts`) aceita qualquer dia e dispara só
 * no dia certo: no mês que não tem aquele dia, não dispara. A tela oferece de 1
 * a 31 e diz isso; só o dia que não existe em mês nenhum se recusa.
 */

/** A recusa do dia que não existe em mês nenhum — ou `null`. */
export function recusaDoDiaDoMes(dia: unknown): string | null {
  const n = Number(dia)
  return Number.isInteger(n) && n >= 1 && n <= 31 ? null : 'O dia do mês vai de 1 a 31.'
}

/** O que acontece no mês sem aquele dia — ou `null` (até o dia 28, todo mês tem). */
export function dicaDoDiaDoMes(dia: number): string | null {
  if (dia === 29) return 'Em fevereiro, só no ano bissexto: nos outros anos a automação não dispara em fevereiro.'
  if (dia === 30) return 'Fevereiro não tem o dia 30: em fevereiro a automação não dispara.'
  if (dia === 31) return 'Fevereiro, abril, junho, setembro e novembro não têm o dia 31: nesses meses a automação não dispara.'
  return null
}
