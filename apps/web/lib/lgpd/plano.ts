import { formatBRL, formatDateTime } from '@estetica-os/utils'

/**
 * O plano de tratamento e as comunicações no pacote LGPD (A21 da 6ª
 * simulação, 2026-11-04): o plano saía só com a data e a situação — sem os
 * procedimentos de cada sessão nem o valor —, e as comunicações, no PDF, só com
 * o dia. O plano é dado comercial (o que ela comprou), não clínico: a anotação
 * da profissional NÃO entra.
 *
 * Puro: o JSON e o PDF saem daqui.
 */

export interface PlanoLido {
  created_at: string
  status: string
  branch_id: string | null
  /** O "Cancelar plano" (D4 da 9ª): quando, e o valor das sessões que sobraram. */
  cancelado_em?: string | null
  valor_cancelado?: number | string | null
  treatment_plan_sessions?: {
    sort_order: number | null
    treatment_plan_session_procedures?: { price: number | string | null; procedures: { name: string | null } | null }[] | null
  }[] | null
}

export interface PlanoParaOTitular {
  data: string
  situacao: string
  unidade: string | null
  total: number
  sessoes: { numero: number; procedimentos: { procedimento: string; valor: number }[] }[]
  /**
   * O plano cancelado (sobra da F41, 9ª simulação): o dia, o que ele passou a
   * valer (as sessões feitas — o total menos o que sobrou) e o que saiu dele.
   * Como o pacote cancelado, que já dizia "cancelado em …".
   */
  cancelamento: { em: string; valorUsado: number; valorQueCaiu: number } | null
}

const centavos = (v: number) => Math.round(v * 100) / 100

export function planoParaOTitular(p: PlanoLido, situacao: string, unidade: string | null): PlanoParaOTitular {
  const sessoes = [...(p.treatment_plan_sessions ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s, i) => ({
      numero: i + 1,
      procedimentos: (s.treatment_plan_session_procedures ?? []).map(x => ({
        procedimento: x.procedures?.name ?? 'Procedimento',
        valor: centavos(Number(x.price ?? 0)),
      })),
    }))
  const total = centavos(sessoes.reduce((t, s) => t + s.procedimentos.reduce((u, x) => u + x.valor, 0), 0))
  const caiu = p.cancelado_em ? centavos(Number(p.valor_cancelado ?? 0)) : 0
  const cancelamento = p.cancelado_em
    ? { em: p.cancelado_em, valorUsado: centavos(Math.max(total - caiu, 0)), valorQueCaiu: caiu }
    : null
  return { data: p.created_at, situacao, unidade, total, sessoes, cancelamento }
}

/** "03/11/2026 — Aceito — Moinhos — R$ 2.000,00 — sessão 1: Botox R$ 800,00 + Preenchimento R$ 1.200,00". */
export function linhaDoPlano(p: PlanoParaOTitular, fmtDia: (v: string) => string): string {
  const sessoes = p.sessoes.map(s => `sessão ${s.numero}: ${s.procedimentos.map(x => `${x.procedimento} ${formatBRL(x.valor)}`).join(' + ') || '—'}`)
  const cancelado = p.cancelamento
    ? `cancelado em ${fmtDia(p.cancelamento.em)}: valeu ${formatBRL(p.cancelamento.valorUsado)} (as sessões feitas); as que sobraram (${formatBRL(p.cancelamento.valorQueCaiu)}) saíram do plano`
    : null
  return [fmtDia(p.data), p.situacao, p.unidade, formatBRL(p.total), ...sessoes, cancelado].filter(Boolean).join(' — ')
}

/** A comunicação no PDF com o dia E a hora (no fuso do negócio). */
export function linhaDaComunicacao(n: { created_at: string; title: string | null }, fuso?: string): string {
  return `${formatDateTime(n.created_at, fuso)} — ${String(n.title ?? '')}`
}
