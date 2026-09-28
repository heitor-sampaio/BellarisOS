import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * Demografia e giro de estoque do dashboard da rede — agregados no Postgres
 * (`metrics_demografia`, `metrics_giro_estoque`, migration `20260927000009`).
 *
 * Antes o dashboard trazia a base inteira de clientes e todos os movimentos do
 * período e contava em JS: passando de 1000 linhas, o PostgREST cortava e os
 * números subcontavam em silêncio (§13.1).
 *
 * Com `ler`, e não `logRpcError`: RPC que falha para a tela em vez de virar
 * uma pizza vazia.
 */

export interface Demografia {
  /** Faixas com pelo menos um cliente. */
  idades:  { faixa: string; n: number }[]
  /** As 5 cidades com mais clientes, da maior para a menor. */
  cidades: { cidade: string; n: number }[]
  /** Por CEP (8 dígitos): clientes e LTV somado — o mapa de calor. */
  ceps:    { cep: string; n: number; ltv: number }[]
}

export async function getDemografia(args: {
  tenantId: string; branchIds: string[] | null; to: Date
}): Promise<Demografia> {
  const data = await ler(createAdminClient().rpc('metrics_demografia', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds, p_to: args.to.toISOString(),
  }), 'calcular a demografia dos clientes')
  const d = (data ?? {}) as Partial<Demografia>
  return {
    idades:  (d.idades ?? []).map(i => ({ faixa: i.faixa, n: Number(i.n) })),
    cidades: (d.cidades ?? []).map(c => ({ cidade: c.cidade, n: Number(c.n) })),
    ceps:    (d.ceps ?? []).map(c => ({ cep: c.cep, n: Number(c.n), ltv: Number(c.ltv) })),
  }
}

/** Consumo em procedimentos no período, ao custo do movimento. */
export async function getGiroDeEstoque(args: {
  branchIds: string[]; from: Date; to: Date
}): Promise<number> {
  const data = await ler(createAdminClient().rpc('metrics_giro_estoque', {
    p_branch_ids: args.branchIds, p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  }), 'calcular o giro de estoque')
  return Number(data ?? 0)
}
