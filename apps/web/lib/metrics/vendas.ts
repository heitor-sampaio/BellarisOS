import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import {
  ehTipoDeVenda, POR_PAGINA, type TipoDeVenda, type Venda, type ResumoDeVendas,
} from '@/lib/metrics/vendas-comum'
import { paramDeTags } from '@/lib/metrics/tags-do-relatorio'

export * from '@/lib/metrics/vendas-comum'

/**
 * O relatório de vendas (2026-10-14): cada venda do período, uma linha —
 * atendimento avulso, pacote, procedimento pré-pago, plano, produto e (RL1,
 * 2026-11-14) o crédito na clínica —, com o número da comanda do PDV.
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
   * vendeu o pacote, o pré-pago, o produto e o plano — sem "Quem vendeu", a
   * dona do plano (D14 da 8ª) — (a coluna "Profissional").
   */
  professionalId?: string | null
  /**
   * As tags marcadas no filtro (E, sem distinguir a caixa): só as vendas cuja
   * cliente tem todas; a venda sem cliente sai. Vazio ou nulo, todas.
   */
  tags?: string[] | null
}

type Linha = {
  id: string; tipo: string; data: string; descricao: string; quantidade: number | null
  cliente_id: string | null; cliente: string | null; profissional: string | null
  branch_id: string; valor: number | string; comanda: number | null
}

const daLinha = (l: Linha): Venda => ({
  id: l.id, tipo: l.tipo as TipoDeVenda, data: l.data, descricao: l.descricao,
  quantidade: Number(l.quantidade ?? 1), clienteId: l.cliente_id, cliente: l.cliente,
  profissional: l.profissional, branchId: l.branch_id, valor: Number(l.valor ?? 0),
  comanda: l.comanda == null ? null : Number(l.comanda),
})

export async function getVendas(r: Recorte & { tipo?: TipoDeVenda | null; limite?: number; offset?: number }): Promise<Venda[]> {
  const linhas = await ler(createAdminClient().rpc('metrics_vendas_pagina', {
    p_tenant: r.tenantId, p_branch_ids: r.branchIds,
    p_from: r.from.toISOString(), p_to: r.to.toISOString(),
    p_tipo: r.tipo ?? null, p_limite: r.limite ?? POR_PAGINA, p_offset: r.offset ?? 0,
    p_professional_id: r.professionalId ?? null,
    ...paramDeTags(r.tags),
  }), 'carregar as vendas do período') as Linha[] | null
  return marcarAsCanceladas(r.tenantId, (linhas ?? []).map(daLinha))
}

/**
 * A10 da 28ª (princípio 3): o plano e o pacote cancelados ficam na lista pelo
 * que a rede ficou, e a linha diz que foram cancelados. Só os da página.
 */
async function marcarAsCanceladas(tenantId: string, vendas: Venda[]): Promise<Venda[]> {
  const planos = vendas.filter(v => v.tipo === 'PLANO').map(v => v.id)
  const pacotes = vendas.filter(v => v.tipo === 'PACOTE').map(v => v.id)
  if (!planos.length && !pacotes.length) return vendas
  const admin = createAdminClient()
  const [pl, pc] = await Promise.all([
    planos.length
      ? ler(admin.from('treatment_plans').select('id, branches!inner(tenant_id)').in('id', planos)
          .eq('status', 'CANCELLED').eq('branches.tenant_id', tenantId), 'ver os planos cancelados das vendas')
      : Promise.resolve([]),
    pacotes.length
      ? ler(admin.from('client_packages').select('id, branches!inner(tenant_id)').in('id', pacotes)
          .not('cancelado_em', 'is', null).eq('branches.tenant_id', tenantId), 'ver os pacotes cancelados das vendas')
      : Promise.resolve([]),
  ])
  const canceladas = new Set([...((pl ?? []) as { id: string }[]), ...((pc ?? []) as { id: string }[])].map(x => x.id))
  return canceladas.size ? vendas.map(v => canceladas.has(v.id) ? { ...v, cancelada: true } : v) : vendas
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
    ...paramDeTags(r.tags),
  }), 'resumir as vendas do período') as { tipo: string | null; quantidade: number | string; total: number | string; linhas: number | string }[] | null

  const vazio = { quantidade: 0, total: 0 }
  const resumo: ResumoDeVendas = {
    geral: vazio,
    porTipo: { PROCEDIMENTO: vazio, PACOTE: vazio, PRE_PAGO: vazio, PLANO: vazio, PRODUTO: vazio, CREDITO: vazio },
    linhas: 0,
  }
  for (const l of linhas ?? []) {
    const valor = { quantidade: Number(l.quantidade), total: Number(l.total) }
    // O geral (tipo nulo) já vem SEM o crédito: o "Total vendido" (RL1).
    if (l.tipo === null) { resumo.geral = valor; resumo.linhas = Number(l.linhas ?? 0) }
    else if (ehTipoDeVenda(l.tipo)) resumo.porTipo[l.tipo] = valor
  }
  return resumo
}
