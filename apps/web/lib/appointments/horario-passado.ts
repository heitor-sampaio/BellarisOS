import { formatDate, formatTime } from '@estetica-os/utils'

/**
 * O horário que já passou não se agenda nem se remarca.
 *
 * O Heitor, 25/11, sobre o Agendar: "recusa, não dá pra agendar no passado"; e
 * sobre o remarcar: "remarcar para o passado é possível desde que não tenha
 * passado do horario já, o que tornaria impossível desse atendimento
 * acontecer" — confirmado na mesma data: remarcar para mais cedo que o marcado
 * pode; para um horário que já passou, recusa. (Era um aviso desde a A24 da
 * 11ª simulação, 2026-11-10.)
 *
 * O minuto de agora vale: a cliente que chegou sem horário se agenda para
 * agora (decisão do Claude, 25/11). A mensagem diz a partir de quando se pode,
 * no relógio da unidade, como o "Escolha a partir de…" do navegador.
 *
 * O núcleo do agendamento (`createAppointmentCore`) e o do remarcar
 * (`remarcarCore`) conferem; a tela só antecipa.
 */
export function recusaDoHorarioPassado(scheduledAt: string, agora: Date = new Date(), fuso?: string): string | null {
  const quando = new Date(scheduledAt)
  if (Number.isNaN(quando.getTime())) return null
  const minutoDeAgora = Math.floor(agora.getTime() / 60_000) * 60_000
  if (quando.getTime() >= minutoDeAgora) return null
  const de = new Date(minutoDeAgora).toISOString()
  return `Esse horário (${formatDate(quando.toISOString(), fuso)} às ${formatTime(quando.toISOString(), fuso)}) já passou. `
    + `Escolha a partir de ${formatDate(de, fuso)} às ${formatTime(de, fuso)}.`
}
