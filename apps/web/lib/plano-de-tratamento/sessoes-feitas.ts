/**
 * A sessão FEITA do plano — a mesma régua de `metrics_financeiro_do_plano`
 * (`sessoes_feitas`, migration `20261123900004`): o agendamento ligado a ela
 * concluído, ou iniciado e desistido no meio (AT-21: a sessão gasta pela
 * desistência não volta). `tests/plano-de-tratamento-entre-unidades.test.ts`
 * confere que a função do banco diz o mesmo.
 *
 * Puro: quem lê o banco é `getSessoesDosPlanos` (`lib/metrics/plano.ts`), para
 * a lista de Tratamentos saber o plano com todas as sessões feitas (PL-20,
 * "Concluído"; D4 da 42ª).
 */
export interface AgendamentoDaSessaoFeita { status: string; started_at: string | null }

export function sessaoFeitaDoPlano(a: AgendamentoDaSessaoFeita | null | undefined): boolean {
  if (!a) return false
  return a.status === 'COMPLETED' || (a.status === 'CANCELLED' && a.started_at != null)
}

export interface SessoesDoPlano { total: number; feitas: number }

/** As sessões de cada plano pedido (todo plano pedido aparece, com zero se não tiver sessão). */
export function contarSessoesDosPlanos(
  planIds: string[],
  linhas: { plan_id: string; appointments: AgendamentoDaSessaoFeita | null }[],
): Map<string, SessoesDoPlano> {
  const mapa = new Map<string, SessoesDoPlano>(planIds.map(id => [id, { total: 0, feitas: 0 }]))
  for (const l of linhas) {
    const s = mapa.get(l.plan_id)
    if (!s) continue
    s.total += 1
    if (sessaoFeitaDoPlano(l.appointments)) s.feitas += 1
  }
  return mapa
}
