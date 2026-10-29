import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import {
  ehTipoDeVenda, POR_PAGINA, type TipoDeVenda, type Venda, type ResumoDeVendas,
} from '@/lib/metrics/vendas-comum'

export * from '@/lib/metrics/vendas-comum'

/**
 * O relatório de vendas (2026-10-14): cada venda do período, uma linha —
 * procedimento avulso, pacote, procedimento pré-pago e plano.
 *
 * A regra do que é venda, da data e do valor de cada tipo mora no Postgres
 * (`metrics_vendas`, migration `20261014000001`); aqui só se pede a página e
 * o resumo. A tela não soma: o total, por tipo e geral, vem de
 * `metrics_vendas_resumo`.
 */

interface Recorte {
  tenantId:  string
  branchIds: string[] | null
  from:      Date
  to:        Date
  /**
   * "Só os meus" (2026-10-28): as vendas DELA — quem atendeu o avulso, quem
   * vendeu o pacote e o pré-pago, a dona do plano (a coluna "Profissional").
   */
  professionalId?: string | null
}

type Linha = {
  id: string; tipo: string; data: string; descricao: string; quantidade: number | null
  cliente_id: string | null; cliente: string | null; profissional: string | null
  branch_id: string; valor: number | string
}

const daLinha = (l: Linha): Venda => ({
  id: l.id, tipo: l.tipo as TipoDeVenda, data: l.data, descricao: l.descricao,
  quantidade: Number(l.quantidade ?? 1), clienteId: l.cliente_id, cliente: l.cliente,
  profissional: l.profissional, branchId: l.branch_id, valor: Number(l.valor ?? 0),
})

export async function getVendas(r: Recorte & { tipo?: TipoDeVenda | null; limite?: number; offset?: number }): Promise<Venda[]> {
  const linhas = await ler(createAdminClient().rpc('metrics_vendas_pagina', {
    p_tenant: r.tenantId, p_branch_ids: r.branchIds,
    p_from: r.from.toISOString(), p_to: r.to.toISOString(),
    p_tipo: r.tipo ?? null, p_limite: r.limite ?? POR_PAGINA, p_offset: r.offset ?? 0,
    p_professional_id: r.professionalId ?? null,
  }), 'carregar as vendas do período') as Linha[] | null
  return (linhas ?? []).map(daLinha)
}

/** Todas as vendas do recorte, de mil em mil (o teto do PostgREST) — a exportação. */
export async function getTodasAsVendas(r: Recorte & { tipo?: TipoDeVenda | null }): Promise<Venda[]> {
  const todas: Venda[] = []
  for (let offset = 0; ; offset += 1000) {
    const pagina = await getVendas({ ...r, limite: 1000, offset })
    todas.push(...pagina)
    if (pagina.length < 1000) return todas
  }
}

export async function getResumoDeVendas(r: Recorte): Promise<ResumoDeVendas> {
  const linhas = await ler(createAdminClient().rpc('metrics_vendas_resumo', {
    p_tenant: r.tenantId, p_branch_ids: r.branchIds,
    p_from: r.from.toISOString(), p_to: r.to.toISOString(),
    p_professional_id: r.professionalId ?? null,
  }), 'resumir as vendas do período') as { tipo: string | null; quantidade: number | string; total: number | string }[] | null

  const vazio = { quantidade: 0, total: 0 }
  const resumo: ResumoDeVendas = {
    geral: vazio,
    porTipo: { PROCEDIMENTO: vazio, PACOTE: vazio, PRE_PAGO: vazio, PLANO: vazio },
  }
  for (const l of linhas ?? []) {
    const valor = { quantidade: Number(l.quantidade), total: Number(l.total) }
    if (l.tipo === null) resumo.geral = valor
    else if (ehTipoDeVenda(l.tipo)) resumo.porTipo[l.tipo] = valor
  }
  return resumo
}
