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

/**
 * A situação da EXECUÇÃO, na ficha de tratamento (A22 da 6ª simulação): o
 * plano fechado no checkout (ACCEPTED) aparecia "FECHADO" com 0 de 2 sessões
 * feitas — lido como "terminado". Ali o que importa é o andamento: "A começar",
 * "Em andamento" ou "Concluído", com quantas foram feitas. Os outros estados
 * são os do plano. "Fechado" continua sendo o nome do estado comercial (J-37)
 * nas listas de planos.
 */
export function situacaoDaExecucao(status: string, feitas: number, total: number): SituacaoDoPlano {
  if (status !== 'ACCEPTED' && status !== 'COMPLETED') return situacaoDoPlano(status)
  const sessoes = `${feitas} de ${total} ${total === 1 ? 'sessão' : 'sessões'}`
  if (status === 'COMPLETED' || (total > 0 && feitas >= total)) {
    return { label: `Concluído · ${sessoes}`, cor: 'var(--success)', fundo: 'var(--success-bg)' }
  }
  if (feitas === 0) return { label: `A começar · ${sessoes}`, cor: 'var(--info)', fundo: 'var(--info-soft)' }
  return { label: `Em andamento · ${sessoes}`, cor: 'var(--brand)', fundo: 'var(--brand-soft)' }
}

/** Quem monta o plano (A18 da 6ª simulação): o "Novo plano" pede o Prontuário em Gerenciar, e a tela sem o botão diz isso. */
export const TEXTO_QUEM_MONTA = 'Quem monta o plano é quem tem o Prontuário em Gerenciar (a profissional, na avaliação ou aqui).'
