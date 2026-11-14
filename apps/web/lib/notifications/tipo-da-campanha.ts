/**
 * MK1 (a revisão do Heitor, 2026-11-13: "mk1 ok"): a campanha é IMEDIATA ou
 * AGENDADA — numa data e hora, ou todo ano numa data (o Dia das Mães). É um
 * aviso a um público de uma vez.
 *
 * O tipo "Automática" saiu: os gatilhos de cada cliente que ele tinha
 * (aniversário, lembrete do agendamento, pós-visita, vencimento de pacote) e
 * os que a revisão juntou (confirmação, cancelamento, pontos) são MODELOS
 * desligados nas Automações (AU1, `lib/automacoes/modelos.ts`) — nada se
 * perde, muda de lugar. Uma regra só, usada pela action (criar e editar) e
 * conferida pelo banco (`notification_campaigns_tipo`, migration
 * `20261115700001`).
 */

export const TIPOS_DE_CAMPANHA = ['IMMEDIATE', 'SCHEDULED'] as const
export type TipoDeCampanha = (typeof TIPOS_DE_CAMPANHA)[number]

/** O único gatilho que a campanha ainda tem: a data de todo ano (só na Agendada). */
export const DATA_DE_TODO_ANO = 'ANNUAL_DATE' as const

/** Onde cada gatilho da campanha automática que saiu mora agora (a chave do modelo). */
export const GATILHOS_QUE_VIRARAM_MODELO: readonly { rotulo: string; modelo: string }[] = [
  { rotulo: 'Aniversário',             modelo: 'aniversario' },
  { rotulo: 'Lembrete do agendamento', modelo: 'lembrete-antes-do-agendamento' },
  { rotulo: 'Pós-visita',              modelo: 'retorno-depois-do-atendimento' },
  { rotulo: 'Vencimento de pacote',    modelo: 'vencimento-de-pacote' },
  { rotulo: 'Confirmação',             modelo: 'confirmacao-do-agendamento' },
  { rotulo: 'Cancelamento',            modelo: 'cancelamento-do-agendamento' },
  { rotulo: 'Pontos de fidelidade',    modelo: 'pontos-de-fidelidade' },
]

const NAS_AUTOMACOES = 'Aniversário, lembrete do agendamento, pós-visita, vencimento de pacote, confirmação, cancelamento e pontos estão nas Automações, como modelos.'

/** O dia existe naquele mês (29/02 vale: sai no ano bissexto). */
function dataDeTodoAnoValida(cfg: Record<string, unknown> | null | undefined): boolean {
  const mes = Number(cfg?.month)
  const dia = Number(cfg?.day)
  if (!Number.isInteger(mes) || !Number.isInteger(dia) || mes < 1 || mes > 12 || dia < 1) return false
  const diasDoMes = new Date(Date.UTC(2024, mes, 0)).getUTCDate()
  return dia <= diasDoMes
}

/**
 * A recusa (o texto que a tela mostra) ou `null` quando o tipo, a data e o
 * gatilho combinam. A hora em si (`scheduled_at` válido no relógio da rede)
 * a action confere depois.
 */
export function recusaDoTipoDaCampanha(input: {
  type: string
  scheduled_at?: string | null
  trigger_type?: string | null
  trigger_config?: Record<string, unknown> | null
}): string | null {
  if (!(TIPOS_DE_CAMPANHA as readonly string[]).includes(input.type)) {
    return `A campanha é Imediata ou Agendada. ${NAS_AUTOMACOES}`
  }
  const gatilho = input.trigger_type ?? null
  if (input.type === 'IMMEDIATE') {
    return gatilho || input.scheduled_at ? 'A campanha imediata sai ao ativar: não leva data nem gatilho.' : null
  }
  // Agendada.
  if (gatilho && gatilho !== DATA_DE_TODO_ANO) return `A campanha agendada sai numa data. ${NAS_AUTOMACOES}`
  if (gatilho === DATA_DE_TODO_ANO) {
    return dataDeTodoAnoValida(input.trigger_config) ? null : 'Escolha uma data de todo ano que exista (dia e mês).'
  }
  return input.scheduled_at ? null : 'Escolha a data e hora do disparo.'
}
