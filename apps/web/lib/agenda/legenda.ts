import { ROTULO_DO_STATUS } from '@/lib/agenda/rotulo-do-status'

/**
 * A legenda da agenda — uma só, nas duas grades (a da unidade e a Minha
 * agenda). A6 da 29ª (princípio 7): a agenda mostra o Concluído desde a
 * `cc570dd3`, e a legenda não o dizia. O Agendado (o cartão tracejado) e o
 * Concluído (borda cheia, cinza) têm a mesma cor: o marcador do Agendado é
 * tracejado, como o cartão.
 */
export const LEGENDA_DA_AGENDA: { rotulo: string; cor: string; tracejado?: boolean }[] = [
  { rotulo: ROTULO_DO_STATUS.CONFIRMED,   cor: 'var(--success)' },
  { rotulo: ROTULO_DO_STATUS.IN_PROGRESS, cor: 'var(--brand)' },
  { rotulo: ROTULO_DO_STATUS.SCHEDULED,   cor: 'var(--text-faint)', tracejado: true },
  { rotulo: ROTULO_DO_STATUS.COMPLETED,   cor: 'var(--text-faint)' },
]
