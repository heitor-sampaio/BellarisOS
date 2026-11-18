/**
 * O nome de cada situação do agendamento — um só no sistema (A39 da 24ª,
 * princípio 3): a agenda dizia "Aguardando" e o detalhe e o app, "Agendado",
 * para a mesma situação.
 */
export const ROTULO_DO_STATUS = {
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  ARRIVED:     'Chegou',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED:   'Concluído',
  CANCELLED:   'Cancelado',
  NO_SHOW:     'Não compareceu',
} as const
