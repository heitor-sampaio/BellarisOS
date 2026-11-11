import { formatBRL } from '@estetica-os/utils'

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

/**
 * O título do plano no app da cliente (A55 da 12ª simulação, 2026-11-11;
 * princípio 3): o cartão do Início e o Financeiro diziam só "Plano de
 * tratamento", e a Marina não reconhecia o "Manchas — laser" que a clínica
 * combinou com ela. O nome que a clínica deu; sem ele, o de sempre.
 */
export function nomeDoPlanoNoApp(nome: string | null | undefined): string {
  return (nome ?? '').trim() || 'Plano de tratamento'
}

/** "Com desconto de R$ 70,00" — só quando o plano teve desconto. */
export function descontoDoPlanoNoApp(desconto: number | string | null | undefined): string | null {
  const v = Number(desconto ?? 0)
  if (!(v > 0)) return null
  return `Com desconto de ${formatBRL(v)}`
}
