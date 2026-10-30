/**
 * O nome e a cor de cada situação do plano de tratamento — UM lugar só (J-37,
 * 2026-10-30). O PROPOSED tinha dois nomes: "Aguardando aceite" em
 * Planejamentos e na tela do plano, "Aguardando checkout" no editor, no
 * dashboard e na tela do atendimento. Ficou "Aguardando checkout": o aceite
 * da cliente É o checkout (o app diz "O aceite é feito na clínica"), e é o
 * gesto que a recepção tem de fazer. O fechado no checkout é "Fechado" (era
 * "Aceito", "Fechado", "Em execução" e "Em andamento", conforme a tela).
 */
export interface SituacaoDoPlano { label: string; cor: string; fundo: string }

export const SITUACAO_DO_PLANO: Record<string, SituacaoDoPlano> = {
  DRAFT:     { label: 'Rascunho',            cor: 'var(--text-muted)', fundo: 'var(--bg-app)' },
  PROPOSED:  { label: 'Aguardando checkout', cor: 'var(--warning)',    fundo: 'var(--warning-soft)' },
  ACCEPTED:  { label: 'Fechado',             cor: 'var(--success)',    fundo: 'var(--success-bg)' },
  COMPLETED: { label: 'Concluído',           cor: 'var(--success)',    fundo: 'var(--success-bg)' },
  CANCELLED: { label: 'Cancelado',           cor: 'var(--danger)',     fundo: 'var(--danger-soft)' },
  // O status antigo de plano recusado (só no arquivo do tratamento).
  REJECTED:  { label: 'Cancelado',           cor: 'var(--danger)',     fundo: 'var(--danger-soft)' },
}

export function situacaoDoPlano(status: string): SituacaoDoPlano {
  return SITUACAO_DO_PLANO[status] ?? { label: status, cor: 'var(--text-muted)', fundo: 'var(--bg-app)' }
}
