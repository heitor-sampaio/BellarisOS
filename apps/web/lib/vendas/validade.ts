import { LIMITE_DE_DIAS, acimaDeCemAnos, avisoAcimaDoComum } from '@/lib/acima-do-comum'

/**
 * A validade em dias do que se vende antes de usar: o pré-pago e o pacote.
 *
 * Era de 1 a 3.650 dias, recusado acima. O Heitor, 25/11: "Se não for
 * impossível, ainda que improvável, pode ser feito." Acima de 3.650 (o antigo
 * teto, agora o "comum"), a tela avisa e o servidor grava. O impossível
 * (decisão do Claude, 25/11): zero, fracionário e acima de 100 anos — a
 * validade vira DATA, e a conta da data estoura no banco.
 */
export const VALIDADE_COMUM_EM_DIAS = 3650

/** Nulo = sem validade, ou uma validade que se grava. */
export function recusaDaValidadeEmDias(dias: number | null): string | null {
  if (dias == null) return null
  if (!Number.isInteger(dias) || dias < 1) return 'Validade inválida.'
  if (dias > LIMITE_DE_DIAS) return acimaDeCemAnos(LIMITE_DE_DIAS, 'dias')
  return null
}

/** "Acima do comum (mais de 3.650 dias)…" — ou nulo. */
export function avisoDaValidadeEmDias(dias: number): string | null {
  return avisoAcimaDoComum(dias, VALIDADE_COMUM_EM_DIAS, 'dias')
}
