import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { ticketMedio } from './resultado'

/**
 * Contagens das telas da UNIDADE, agregadas no Postgres (migration
 * `20260927000010`). As duas eram feitas em JS sobre selects sem limite e
 * cortavam em 1000 linhas (§13.1).
 */

/** Sessões concluídas por procedimento nas unidades dadas, desde sempre. */
export async function getSessoesPorProcedimento(branchIds: string[]): Promise<Map<string, number>> {
  const data = await ler(createAdminClient().rpc('metrics_sessoes_por_procedimento', {
    p_branch_ids: branchIds,
  }), 'contar as sessões por procedimento')
  return new Map(((data ?? []) as { procedure_id: string; sessoes: number | string }[])
    .map(r => [r.procedure_id, Number(r.sessoes)]))
}

/**
 * O dinheiro de UM cliente — a MESMA conta do "Gasto médio" de Relatórios →
 * Clientes (`metrics_gasto_por_cliente`, A26 da simulação de 2026-10-27): a
 * ficha dizia "ticket R$ 0,00" ao lado de "LTV R$ 600", e os relatórios, "gasto
 * médio R$ 390", cada um de uma conta. Aqui a função é chamada com a cliente e
 * a janela inteira; lá, com o período.
 */
export interface DoCliente {
  /** O que o cliente pagou, desde sempre — pago, sem estorno (= LTV do dashboard). */
  ltv: number
  /** Atendimentos concluídos, desde sempre. */
  atendimentos: number
  /** Ticket canônico recortado no cliente (lib/metrics/resultado). Nulo sem atendimento cobrado. */
  ticketMedio: number | null
}

export async function getDoCliente(tenantId: string, clientId: string): Promise<DoCliente> {
  const data = await ler(createAdminClient().rpc('metrics_gasto_por_cliente', {
    p_tenant: tenantId, p_branch_ids: null, p_from: '2000-01-01T00:00:00Z', p_to: 'infinity', p_cliente: clientId,
  }), 'calcular o investido do cliente')
  const d = ((data ?? []) as { pago: number | string | null; receita_servico: number | string; atendimentos: number | string; atendimentos_cobrados: number | string }[])[0]
  return {
    ltv: Number(d?.pago ?? 0),
    atendimentos: Number(d?.atendimentos ?? 0),
    ticketMedio: ticketMedio({ serviceRevenue: Number(d?.receita_servico ?? 0), appointmentsCharged: Number(d?.atendimentos_cobrados ?? 0) }),
  }
}

/** Custo × saldo das unidades dadas (o "valor em estoque"). */
export async function getValorEmEstoque(branchIds: string[]): Promise<number> {
  const data = await ler(createAdminClient().rpc('metrics_valor_em_estoque', {
    p_branch_ids: branchIds,
  }), 'calcular o valor em estoque')
  return Number(data ?? 0)
}

/**
 * O valor de cada produto em estoque (a coluna "Valor" da tela de estoque): o
 * saldo em CONSUMO × o custo de consumo, a conta de metrics_valor_em_estoque
 * (A39, 2026-10-27 — a tela multiplicava as embalagens pelo preço da
 * embalagem, e 495 ml valiam R$ 450). Chave `produto` = nas unidades dadas;
 * `produto:unidade` = numa unidade.
 */
export async function getValorEmEstoquePorProduto(branchIds: string[]): Promise<Map<string, number>> {
  const linhas = await lerTodas<{ product_id: string; branch_id: string | null; valor: number | string | null }>(
    (de, ate) => createAdminClient().rpc('metrics_valor_em_estoque_por_produto', { p_branch_ids: branchIds })
      .order('product_id').order('branch_id', { nullsFirst: true }).range(de, ate),
    'calcular o valor de cada produto em estoque',
  )
  return new Map(linhas.map(l => [l.branch_id ? `${l.product_id}:${l.branch_id}` : l.product_id, Number(l.valor ?? 0)]))
}

export interface ClientesParaReativar {
  /** Quantos clientes da unidade estão sem visita desde `desde`. */
  total: number
  /** Os há mais tempo sem vir; quem nunca veio fica no fim. */
  lista: { id: string; name: string; phone: string | null; ultimaVisita: string | null }[]
}

export async function getClientesParaReativar(args: {
  tenantId: string; branchId: string; tag: string; desde: Date; limite?: number
  /** "Só os meus": só as clientes que ela atendeu (agendamento não cancelado na unidade). */
  professionalId?: string | null
}): Promise<ClientesParaReativar> {
  const data = await ler(createAdminClient().rpc('metrics_clientes_para_reativar', {
    p_tenant: args.tenantId, p_branch_id: args.branchId, p_tag: args.tag,
    p_desde: args.desde.toISOString(), p_limite: args.limite ?? 3,
    p_professional_id: args.professionalId ?? null,
  }), 'buscar os clientes para reativar')
  const d = (data ?? {}) as {
    total?: number
    lista?: { id: string; name: string; phone: string | null; ultima_visita: string | null }[]
  }
  return {
    total: Number(d.total ?? 0),
    lista: (d.lista ?? []).map(c => ({ id: c.id, name: c.name, phone: c.phone, ultimaVisita: c.ultima_visita })),
  }
}
