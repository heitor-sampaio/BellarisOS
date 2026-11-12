import { partsInTZ, dayKeyTZ, instanteNoFuso, addDaysTZ } from '@/lib/datetime'

/**
 * O lembrete do agendamento que cairia de madrugada (C74 — D17 do
 * levantamento das regras, F69).
 *
 * "N horas antes" do agendamento das 09:00 com 6 horas sai às 03:00: o
 * celular da cliente toca no meio da noite. A tela AVISA quais agendamentos
 * caem assim, e a clínica pode ligar "Se cair de madrugada, mandar na véspera
 * às 20:00" — desligada por padrão (princípio 6: nada muda sozinho; o padrão
 * é a regra de sempre, "N horas antes").
 *
 * Madrugada = das 21:00 às 08:00, a mesma faixa do silêncio das automações.
 */

export const MADRUGADA_DE = 21
export const MADRUGADA_ATE = 8
const HORA_DA_VESPERA = '20:00'

/** O instante cai na madrugada (21:00–07:59), no relógio da clínica? */
export function deMadrugada(instante: Date, fuso?: string): boolean {
  const h = partsInTZ(instante, fuso).hour
  return h >= MADRUGADA_DE || h < MADRUGADA_ATE
}

/**
 * Quando o lembrete deste agendamento sai. Sem a opção, `horas` antes. Com
 * ela, o que cairia de madrugada sai às 20:00 do dia anterior à manhã — a
 * noite das 21:00 às 23:59 vai às 20:00 do mesmo dia; a da 00:00 às 07:59, às
 * 20:00 da véspera.
 */
export function envioDoLembrete(agendadoPara: Date, horas: number, fuso: string | undefined, vespera: boolean): Date {
  const natural = new Date(agendadoPara.getTime() - horas * 3_600_000)
  if (!vespera || !deMadrugada(natural, fuso)) return natural
  const h = partsInTZ(natural, fuso).hour
  const dia = h >= MADRUGADA_DE ? natural : addDaysTZ(natural, -1, fuso)
  return instanteNoFuso(dayKeyTZ(dia, fuso), HORA_DA_VESPERA, fuso)
}

const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`

/**
 * O aviso da tela: com `horas` de antecedência, os agendamentos de que horário
 * têm o lembrete de madrugada. "Com 2 horas, o lembrete dos agendamentos entre
 * 23:00 e 10:00 sai de madrugada (entre 21:00 e 08:00)."
 */
export function avisoDeMadrugada(horas: number): string {
  const de = hh(MADRUGADA_DE + horas)
  const ate = hh(MADRUGADA_ATE + horas)
  return `Com ${horas} ${horas === 1 ? 'hora' : 'horas'} de antecedência, o lembrete dos agendamentos entre ${de} e ${ate} sai de madrugada (entre ${hh(MADRUGADA_DE)} e ${hh(MADRUGADA_ATE)}).`
}
