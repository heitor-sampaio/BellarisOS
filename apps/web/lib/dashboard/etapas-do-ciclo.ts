/**
 * As etapas do quadro "Clientes no mês/período" que o cargo VÊ (A32 da 24ª
 * simulação; princípio 3). Sem a Agenda, o núcleo não conta os agendamentos
 * dela — e o quadro mostrava "Agendamentos 0", "Concluídos 0" e
 * "Cancelados/faltas 0" num dia de 4 agendamentos. Sem a Agenda, o quadro não
 * mostra as etapas da agenda.
 */
export const ETAPAS_DA_AGENDA: readonly string[] = ['Agendamentos', 'Concluídos', 'Cancelados/faltas']

export function etapasDoQueOCargoVe<T extends { label: string }>(etapas: T[], veAAgenda: boolean): T[] {
  return veAAgenda ? etapas : etapas.filter(e => !ETAPAS_DA_AGENDA.includes(e.label))
}
