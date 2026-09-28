import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

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

/** O dinheiro de UM cliente (migration `20260927000013`). */
export interface DoCliente {
  /** O que o cliente pagou, desde sempre — pago, sem estorno (= LTV do dashboard). */
  ltv: number
  /** Atendimentos concluídos, desde sempre. */
  atendimentos: number
  /** Ticket canônico recortado no cliente: serviço dos concluídos ÷ concluídos. */
  ticketMedio: number
}

export async function getDoCliente(tenantId: string, clientId: string): Promise<DoCliente> {
  const data = await ler(createAdminClient().rpc('metrics_do_cliente', {
    p_tenant: tenantId, p_client: clientId,
  }), 'calcular o investido do cliente')
  const d = (data ?? {}) as { ltv?: number; atendimentos?: number; receita_servico?: number }
  const atendimentos = Number(d.atendimentos ?? 0)
  return {
    ltv: Number(d.ltv ?? 0),
    atendimentos,
    ticketMedio: atendimentos > 0 ? Number(d.receita_servico ?? 0) / atendimentos : 0,
  }
}

/** Custo × saldo das unidades dadas (o "valor em estoque"). */
export async function getValorEmEstoque(branchIds: string[]): Promise<number> {
  const data = await ler(createAdminClient().rpc('metrics_valor_em_estoque', {
    p_branch_ids: branchIds,
  }), 'calcular o valor em estoque')
  return Number(data ?? 0)
}

export interface ClientesParaReativar {
  /** Quantos clientes da unidade estão sem visita desde `desde`. */
  total: number
  /** Os há mais tempo sem vir; quem nunca veio fica no fim. */
  lista: { id: string; name: string; phone: string | null; ultimaVisita: string | null }[]
}

export async function getClientesParaReativar(args: {
  tenantId: string; branchId: string; tag: string; desde: Date; limite?: number
}): Promise<ClientesParaReativar> {
  const data = await ler(createAdminClient().rpc('metrics_clientes_para_reativar', {
    p_tenant: args.tenantId, p_branch_id: args.branchId, p_tag: args.tag,
    p_desde: args.desde.toISOString(), p_limite: args.limite ?? 3,
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
