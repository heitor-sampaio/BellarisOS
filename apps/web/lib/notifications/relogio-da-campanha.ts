import { partsInTZ, startOfDayTZ, addDaysTZ, dayKeyTZ } from '@/lib/datetime'

/**
 * O relógio de uma campanha automática no cron: o dia (aniversário, data
 * anual), a hora (as 09:00 do `jaEhHoraDeDisparar`), o começo do dia (um
 * disparo por dia) e os "N dias" do gatilho — no fuso da CLÍNICA (F62: a
 * campanha é da rede, e o fuso é o comum das unidades; sem fuso, o de
 * Brasília).
 *
 * Puro: o cron e o "Quem receberia hoje" fazem a mesma conta.
 */
export function relogioDaCampanha(agora: Date, fuso?: string) {
  const p = partsInTZ(agora, fuso)
  return {
    hoje:        { month: p.month, day: p.day },
    hora:        p.hour,
    inicioDoDia: startOfDayTZ(agora, fuso),
    daquiA:      (dias: number) => addDaysTZ(agora, dias, fuso),
    mesmoDia:    (a: Date, b: Date) => dayKeyTZ(a, fuso) === dayKeyTZ(b, fuso),
  }
}
