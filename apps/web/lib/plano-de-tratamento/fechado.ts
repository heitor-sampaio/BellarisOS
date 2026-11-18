/**
 * O plano FECHADO não se edita nem volta a rascunho: o aceito (vendido), o
 * concluído, e o cancelado e o recusado, que são retrato só de leitura
 * (vendas-financeiro.md, "O plano cancelado é um retrato"; o editor os trava em
 * `isPlanLocked`). O PROPOSTO (no checkout) não: ele se desfaz em "Cancelar
 * checkout". A20d da 25ª: o rascunho da avaliação o reabria sem conferir.
 *
 * A mesma lista mora em `plano_gravar_sessoes` (migration 20261124950001).
 */
export const STATUS_DO_PLANO_FECHADO = ['ACCEPTED', 'COMPLETED', 'CANCELLED', 'REJECTED'] as const

export const RECUSA_DO_PLANO_FECHADO = 'Este plano já foi fechado e não pode mais ser alterado.'

export function planoFechado(status: string | null | undefined): boolean {
  return !!status && (STATUS_DO_PLANO_FECHADO as readonly string[]).includes(status)
}
