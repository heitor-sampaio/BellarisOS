import { createAdminClient } from '@/lib/supabase/admin'

/**
 * O FLUXO DE CAIXA dos próximos meses (r2-fin-04; o Heitor, 2026-11-03: "crie
 * o gráfico"): mês a mês, a partir do mês atual, o que entra (o a receber da
 * cliente e o que a operadora do cartão ainda deposita) e o que sai (as
 * despesas a pagar), e o saldo. O que já venceu e segue em aberto entra no mês
 * atual. A conta é do banco (`metrics_fluxo_de_caixa`); aqui só se lê.
 */
export interface MesDoFluxo {
  /** "AAAA-MM". */
  mes:         string
  daCliente:   number
  daOperadora: number
  aPagar:      number
  saldo:       number
}

const n = (v: unknown): number => (v == null ? 0 : Number(v))

async function umFluxo(tenantId: string, branchIds: string[] | null, meses: number): Promise<MesDoFluxo[]> {
  const { data, error } = await createAdminClient().rpc('metrics_fluxo_de_caixa', {
    p_tenant: tenantId, p_branch_ids: branchIds, p_meses: meses,
  })
  if (error) {
    console.error(`[metrics] metrics_fluxo_de_caixa falhou: ${error.message}`)
    throw new Error(`Não consegui calcular os indicadores (metrics_fluxo_de_caixa): ${error.message}`)
  }
  return ((data as Record<string, unknown>[] | null) ?? []).map(r => ({
    mes: String(r.mes).slice(0, 7), daCliente: n(r.da_cliente), daOperadora: n(r.da_operadora), aPagar: n(r.a_pagar), saldo: n(r.saldo),
  }))
}

/** O fluxo do recorte (todas as unidades dele) e, se pedido, o de cada unidade. */
export async function getFluxoDeCaixa(args: {
  tenantId: string; branchIds?: string[] | null; meses?: number; porUnidade?: boolean
}): Promise<{ total: MesDoFluxo[]; porUnidade: Record<string, MesDoFluxo[]> }> {
  const meses = args.meses ?? 6
  const ids = args.branchIds ?? null
  const [total, ...cada] = await Promise.all([
    umFluxo(args.tenantId, ids, meses),
    ...(args.porUnidade && ids ? ids.map(id => umFluxo(args.tenantId, [id], meses)) : []),
  ])
  return {
    total: total ?? [],
    porUnidade: args.porUnidade && ids ? Object.fromEntries(ids.map((id, i) => [id, cada[i] ?? []])) : {},
  }
}
