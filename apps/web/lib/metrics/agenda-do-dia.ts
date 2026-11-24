import { dayKeyTZ, endOfDayTZ, instanteNoFuso } from '@/lib/datetime'
import { fusoValido } from '@/lib/unidades/fuso'

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
