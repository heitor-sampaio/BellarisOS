import { intervalosDoDia, diaDaSemana, slotsDoDia, type Horario } from '@/lib/agenda/horario'
import { dayKeyTZ, partsInTZ } from '@/lib/datetime'

export interface HorarioDaGrade { hora: string; doProfissional: boolean }

/**
 * A grade de horários do passo de agendamento do checkout do plano (D8 da
 * simulação de 2026-10-29).
 *
 * Era FIXA, das 08:00 às 20:00, para qualquer unidade e profissional: oferecia
 * 12:00 e 12:30 na pausa da unidade e cortava a noite inteira de quem abre até
 * 23:30. Agora cobre a janela da UNIDADE naquele dia (`intervalosDoDia`, de 30
 * em 30 min, cada período sem atravessar a pausa) e marca os horários em que a
 * PROFISSIONAL atende (unidade ∩ dela). O resto da janela continua oferecido:
 * o seletor do checkout é livre (o encaixe, §9.1) — e o que fica fora da
 * própria unidade (madrugada, dia fechado) é o "Outro horário" da tela.
 *
 * Puro: roda no navegador, com os horários que a action devolve.
 */
export function gradeDoCheckout(
  unidade: Horario | null, profissional: Horario | null, data: string, aPartirDe: string | null = null,
): HorarioDaGrade[] {
  const dia = diaDaSemana(data)
  const daUnidade = slotsDoDia(intervalosDoDia(unidade, null, dia), 30)
  const dela = new Set(slotsDoDia(intervalosDoDia(unidade, profissional, dia), 30))
  return daUnidade
    .filter(hora => !aPartirDe || hora >= aPartirDe)
    .map(hora => ({ hora, doProfissional: dela.has(hora) }))
}

/**
 * Hoje (no fuso da unidade — F62; sem ele, o de Brasília), o horário de AGORA ("14:05"): a grade não oferece
 * o que já passou (A24 da 6ª simulação: de madrugada, numa unidade 24 h, a
 * sessão do pacote oferecia 00:00–04:00). Noutro dia, nulo.
 */
export function aPartirDeAgora(data: string, agora: Date, fuso?: string): string | null {
  if (dayKeyTZ(agora, fuso) !== data) return null
  const p = partsInTZ(agora, fuso)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}
