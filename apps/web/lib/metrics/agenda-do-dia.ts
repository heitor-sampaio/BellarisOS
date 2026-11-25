import { dayKeyTZ, endOfDayTZ, instanteNoFuso } from '@/lib/datetime'
import { fusoValido } from '@/lib/unidades/fuso'
import { fimDaOcupacao } from '@/lib/appointments/ocupacao'

/**
 * Os agendamentos de hoje que AINDA vêm (A12 da 16ª simulação; princípio 3).
 * "Agendamentos 0" no "Clientes no mês" é a regra ("contados até agora",
 * `indicadores.md`) — e quem tinha 2 horários mais tarde lia que não tinha
 * nenhum. A etapa diz também "2 ainda hoje", sem mudar a conta dela.
 *
 * Pura: conta a lista do dia que a página já leu (a agenda de hoje, no
 * recorte da pessoa), fora os cancelados e as faltas — e fora o que já foi
 * atendido ou está em atendimento (D6 da 18ª: o concluído adiantado, marcado
 * para mais tarde, contava como "ainda hoje").
 */
const JA_NAO_VEM = ['CANCELLED', 'NO_SHOW', 'COMPLETED', 'IN_PROGRESS']

export function aindaHojeNaAgenda(
  agendamentos: readonly { scheduled_at: string; status: string }[], agora: Date,
): number {
  const t = agora.getTime()
  return agendamentos.filter(a => !JA_NAO_VEM.includes(a.status) && new Date(a.scheduled_at).getTime() > t).length
}

/** Um agendamento como o banco o devolve, com o que decide até quando ele ocupa. */
export interface LinhaDaAgenda { scheduled_at: string; duration_min: number | null; status: string; completed_at?: string | null }

/**
 * O agendamento acontece no período [de, ate] (`ate` é o último instante)?
 * Começa nele (qualquer situação, como a lista sempre mostrou), ou começou
 * antes e ainda OCUPA o início dele — o procedimento não tem duração máxima
 * (25/11), e o que atravessa a meia-noite ocupa o dia seguinte. É a regra do
 * desenho das agendas (`trechoDoAgendamentoNoDia`): o cancelado e a falta não
 * continuam; o concluído continua só até a conclusão (`fimDaOcupacao`).
 */
export function ocupaOPeriodo(a: LinhaDaAgenda, de: Date, ate: Date): boolean {
  const ini = new Date(a.scheduled_at).getTime()
  if (Number.isNaN(ini)) return false
  if (ini >= de.getTime() && ini <= ate.getTime()) return true
  if (ini >= de.getTime() || a.status === 'CANCELLED' || a.status === 'NO_SHOW') return false
  return fimDaOcupacao({ scheduled_at: a.scheduled_at, duration_min: a.duration_min, status: a.status, completed_at: a.completed_at ?? null }) > de.getTime()
}

/**
 * A agenda do período (princípio 3): o que acontece nele, na ordem do início —
 * o que continua de antes vem primeiro, com o início REAL e marcado
 * (`comecouAntes`), para a tela dizer de quando ele vem. A "Agenda de hoje"
 * do dashboard e as leituras de agenda do Copilot listavam pelo início: o
 * atendimento que continua de ontem sumia, e a pessoa parecia livre.
 */
export function agendaDoPeriodo<L extends LinhaDaAgenda>(linhas: readonly L[], de: Date, ate: Date): (L & { comecouAntes: boolean })[] {
  return linhas
    .filter(l => ocupaOPeriodo(l, de, ate))
    .map(l => ({ ...l, comecouAntes: new Date(l.scheduled_at).getTime() < de.getTime() }))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
}

/**
 * O "Hoje" da rede no dia de CADA unidade (D5 da 26ª; F62: "O dia é o da
 * unidade no consolidado"). O dia é o da rede (o do fuso do recorte); cada
 * unidade o lê no relógio dela — o 18/11 de Cuiabá vai das 00:00 às 23:59 de
 * Cuiabá. Com uma janela só (a de Brasília), a avaliação das 23:30 de Cuiabá
 * (00:30 de 19/11 em Brasília) saía do "Hoje" da rede e ficava no da unidade.
 *
 * Pura: as janelas, uma por fuso, com as unidades de cada uma. Quem lê o
 * banco faz uma consulta por janela (`agendamentosDeHojeNasUnidades`).
 */
export function janelasDoDiaNasUnidades(
  agora: Date, fusoDoRecorte: string, unidades: readonly { id: string; fuso: string | null | undefined }[],
): { fuso: string; de: Date; ate: Date; ids: string[] }[] {
  const dia = dayKeyTZ(agora, fusoValido(fusoDoRecorte))
  const porFuso = new Map<string, string[]>()
  for (const u of unidades) {
    const f = fusoValido(u.fuso)
    porFuso.set(f, [...(porFuso.get(f) ?? []), u.id])
  }
  return [...porFuso].map(([fuso, ids]) => {
    const de = instanteNoFuso(dia, '00:00', fuso)
    return { fuso, de, ate: endOfDayTZ(de, fuso), ids }
  })
}
