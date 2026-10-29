import { ocupacaoEmPct, type Horario, type BlocoOcupado } from '@/lib/agenda/horario'
import { startOfDayTZ, endOfDayTZ } from '@/lib/datetime'

/**
 * A ocupação de UM dia de uma agenda já carregada na tela (a "Minha agenda"
 * da profissional) — a MESMA conta da agenda da unidade e do dashboard
 * (§13.1, `ocupacaoEmPct`): os minutos agendados no dia de Brasília, sem
 * cancelados nem faltas (os concluídos contam), ÷ a capacidade do horário —
 * unidade ∩ profissional, menos o que ela tem agendado em outra unidade.
 *
 * A "Minha agenda" dividia por um dia FIXO de 8 h, na tela: a Camila, que
 * atende das 18:00 às 23:30, via 32% em vez de 47% (D11 da simulação de
 * 2026-10-29). Puro, sem servidor: roda no navegador.
 */
export function ocupacaoDoDia(
  eventos: { start: string; durationMin: number; status: string }[],
  horarios: { unidade: Horario | null; profissional: Horario | null; ocupadoFora?: BlocoOcupado[] },
  dia: Date,
): number | null {
  const de = startOfDayTZ(dia), ate = endOfDayTZ(dia)
  const minutos = eventos
    .filter(e => !['CANCELLED', 'NO_SHOW'].includes(e.status))
    .filter(e => { const t = new Date(e.start).getTime(); return t >= de.getTime() && t <= ate.getTime() })
    .reduce((s, e) => s + e.durationMin, 0)
  return ocupacaoEmPct(minutos, horarios.unidade, [horarios.profissional], de, ate, [horarios.ocupadoFora ?? []])
}
