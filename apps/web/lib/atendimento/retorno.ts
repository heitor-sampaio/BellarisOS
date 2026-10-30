/**
 * O "Retorno em N dias" do atendimento (D-12, decisão do Heitor em
 * 2026-10-29: "Fazer o campo 'Retorno em N dias' no atendimento. Ele vira
 * lembrete à recepção e gatilho de automação.").
 *
 * A profissional diz, ao finalizar, quando a cliente deve voltar (revisão da
 * toxina em 15 dias). `concluir_atendimento` grava os dias e o DIA do retorno
 * (a conclusão + N, em Brasília) na mesma transação; a recepção vê os que
 * vencem (`lib/agenda/retornos.ts`) e, no dia, o cron emite
 * `agendamento.retorno_vencendo` para as automações. Nada é mandado à cliente
 * por conta própria.
 *
 * Puro: a tela e o servidor leem o campo por aqui.
 */

/** Dois anos: retorno mais longe que isso é outro tratamento, não um retorno. */
export const RETORNO_MAXIMO_DIAS = 730

export function lerRetornoEmDias(valor: unknown): { dias: number | null } | { erro: string } {
  const texto = valor == null ? '' : String(valor).trim()
  if (!texto) return { dias: null }
  if (!/^\d+$/.test(texto)) return { erro: 'O retorno é um número inteiro de dias (ex.: 15).' }
  const dias = Number(texto)
  if (dias < 1 || dias > RETORNO_MAXIMO_DIAS) return { erro: `O retorno vai de 1 a ${RETORNO_MAXIMO_DIAS} dias.` }
  return { dias }
}
