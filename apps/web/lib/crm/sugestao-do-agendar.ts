/**
 * O procedimento que o "Agendar" da oportunidade traz escolhido (A1 da 11ª
 * simulação, 2026-11-10: a Tatiane abria o Agendar da Beatriz, interessada em
 * Bioestimulador, e tudo vinha em "Selecione…").
 *
 * - O procedimento de INTERESSE do card (o primeiro que a unidade oferece).
 * - Sem interesse no card, a AVALIAÇÃO da unidade — quando há UMA (pela
 *   categoria "Avaliação" ou pelo nome): é a primeira visita de quem chega
 *   pelo funil. Com duas ou nenhuma, nada vem escolhido (a régua da clínica de
 *   uma opção só, `lib/uma-opcao.ts`: só se escolhe pela pessoa o que não tem
 *   alternativa).
 *
 * É sugestão: a pessoa troca no select, e a tela diz de onde ela veio.
 */

export interface ProcedimentoDoAgendar { id: string; name: string; category?: string | null }

export interface SugestaoDoAgendar { id: string; motivo: 'interesse' | 'avaliacao' }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function ehAvaliacao(p: ProcedimentoDoAgendar): boolean {
  return semAcento(p.category ?? '') === 'avaliacao' || semAcento(p.name).startsWith('avaliacao')
}

export function sugestaoDoAgendar(
  procedimentos: readonly ProcedimentoDoAgendar[], interesse: readonly string[],
): SugestaoDoAgendar | null {
  for (const id of interesse) {
    if (procedimentos.some(p => p.id === id)) return { id, motivo: 'interesse' }
  }
  if (interesse.length) return null
  const avaliacoes = procedimentos.filter(ehAvaliacao)
  return avaliacoes.length === 1 ? { id: avaliacoes[0]!.id, motivo: 'avaliacao' } : null
}

export const TEXTO_DA_SUGESTAO: Record<SugestaoDoAgendar['motivo'], string> = {
  interesse: 'Veio do procedimento de interesse da oportunidade.',
  avaliacao: 'Sugestão: a avaliação da unidade (a oportunidade não tem procedimento de interesse).',
}
