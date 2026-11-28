import type { CreditoParaAgendar } from '@/lib/creditos/credito'

/**
 * O "Incluído" da janela de agendar (o pacote, o pré-pago e a sessão do plano)
 * oferece só o que a unidade do AGENDAMENTO faz (A3 da 42ª; princípio 7, a tela
 * não oferece o que vai recusar): a sessão do plano de Arapongas com o Micro,
 * que só Arapongas faz, aparecia no agendar de Apucarana, e a recusa
 * (`recusaDoProcedimentoNaUnidade`, no núcleo) só vinha ao salvar. A régua é a
 * do núcleo: o procedimento principal do crédito, entre os que a unidade
 * oferece (`getCachedBranchProcedures` / `dadosParaAgendar`).
 *
 * `procedimentosDaUnidade` nulo: a unidade ainda não foi escolhida (a agenda da
 * rede) — não há o que cortar.
 */
export function creditosOferecidosNaUnidade<C extends Pick<CreditoParaAgendar, 'procedureId'>>(
  creditos: C[], procedimentosDaUnidade: { id: string }[] | null,
): C[] {
  if (!procedimentosDaUnidade) return creditos
  const faz = new Set(procedimentosDaUnidade.map(p => p.id))
  return creditos.filter(c => faz.has(c.procedureId))
}
