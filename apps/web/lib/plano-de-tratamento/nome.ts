/**
 * O nome de uma sessão (ou de um plano) pelos procedimentos dela (A36 da 6ª
 * simulação, 2026-11-04): a sessão Botox + Preenchimento aparecia só "Botox"
 * (o procedimento do agendamento é um só) e o plano se chamava "Botox + 1
 * mais". Na ordem, sem repetir; até três nomes, depois "+ N mais".
 *
 * Puro: o servidor e o navegador dizem o mesmo.
 */
export function nomeDosProcedimentos(nomes: (string | null | undefined)[], ate = 3): string | null {
  const unicos = [...new Set(nomes.map(n => (n ?? '').trim()).filter(Boolean))]
  if (!unicos.length) return null
  if (unicos.length <= ate) return unicos.join(' + ')
  return `${unicos.slice(0, ate).join(' + ')} + ${unicos.length - ate} mais`
}

type ProcDaSessao = { sort_order?: number | null; procedures: { name: string | null } | null }

/** Os procedimentos de UMA sessão do plano, na ordem dela. */
export function nomeDaSessao(procs: ProcDaSessao[] | null | undefined): string | null {
  return nomeDosProcedimentos([...(procs ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(p => p.procedures?.name))
}
