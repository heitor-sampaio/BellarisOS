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
  // PT1a (2026-11-14): o aceite deixou de ser um checkout — o plano proposto é
  // "Proposto", o nome da lista de Tratamentos (PT1f).
  PROPOSED:  { label: 'Proposto',            cor: 'var(--warning)',    fundo: 'var(--warning-soft)' },
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

/** Quem monta o plano: desde o PT2 (2026-11-14), quem ATENDE — `lib/plano-de-tratamento/quem-monta.ts`. */
export { TEXTO_QUEM_MONTA } from './quem-monta'

/**
 * A situação do plano na lista de Tratamentos e no topo da página dele (PT1f,
 * Bloco Plano de tratamento — a revisão do Heitor de 2026-11-13: "Proposto,
 * Aceito (falta assinar), Falta pagar, Em andamento, Concluído, Cancelado").
 * Segue a ordem do Heitor: aceitar → assinar → pagar → agendar.
 *
 * - Aceito (falta assinar): aceito, sem dinheiro, com documento do plano
 *   aberto ou o contrato de plano da rede ainda sem assinatura (nem dispensa).
 * - Falta pagar: aceito, tudo assinado, sem dinheiro.
 * - Em andamento: o plano já foi recebido (um lançamento vivo dele) — o
 *   dinheiro que entrou vence o documento que ficou aberto.
 * - Rascunho fica à parte: o plano salvo que ainda não foi à cliente.
 *
 * Pura: quem lê o banco é `listarPlanejamentos` / `getPassosDoPlano`.
 */
export const SITUACOES_COMERCIAIS = ['RASCUNHO', 'PROPOSTO', 'FALTA_ASSINAR', 'FALTA_PAGAR', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'] as const
export type SituacaoComercial = typeof SITUACOES_COMERCIAIS[number]

const COMERCIAL: Record<SituacaoComercial, SituacaoDoPlano> = {
  RASCUNHO:      { label: 'Rascunho',               cor: 'var(--text-muted)', fundo: 'var(--bg-app)' },
  PROPOSTO:      { label: 'Proposto',               cor: 'var(--warning)',    fundo: 'var(--warning-soft)' },
  FALTA_ASSINAR: { label: 'Aceito (falta assinar)', cor: 'var(--warning)',    fundo: 'var(--warning-soft)' },
  FALTA_PAGAR:   { label: 'Falta pagar',            cor: 'var(--warning)',    fundo: 'var(--warning-soft)' },
  EM_ANDAMENTO:  { label: 'Em andamento',           cor: 'var(--brand)',      fundo: 'var(--brand-soft)' },
  CONCLUIDO:     { label: 'Concluído',              cor: 'var(--success)',    fundo: 'var(--success-bg)' },
  CANCELADO:     { label: 'Cancelado',              cor: 'var(--danger)',     fundo: 'var(--danger-soft)' },
}

export function situacaoComercialDoPlano(p: {
  status: string
  /** Há lançamento de receita vivo do plano (o plano foi recebido). */
  recebido: boolean
  /** Documentos do plano ainda por assinar (prontos, a gerar ou com dados faltando). */
  documentosAbertos: number
  /** A rede tem contrato de plano ativo e este plano não tem um assinado nem dispensado. */
  contratoFalta: boolean
}): SituacaoComercial {
  switch (p.status) {
    case 'DRAFT':     return 'RASCUNHO'
    case 'PROPOSED':  return 'PROPOSTO'
    case 'COMPLETED': return 'CONCLUIDO'
    case 'CANCELLED':
    case 'REJECTED':  return 'CANCELADO'
  }
  if (p.recebido) return 'EM_ANDAMENTO'
  if (p.documentosAbertos > 0 || p.contratoFalta) return 'FALTA_ASSINAR'
  return 'FALTA_PAGAR'
}

export function rotuloDaSituacaoComercial(s: SituacaoComercial): string {
  return COMERCIAL[s].label
}

export function corDaSituacaoComercial(s: SituacaoComercial): SituacaoDoPlano {
  return COMERCIAL[s]
}
