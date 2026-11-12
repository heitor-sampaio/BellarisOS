import type { Locator } from '@playwright/test'
import { banco } from './banco'

/**
 * As taxas moram nas MAQUININHAS da rede desde a C75 da F67 (2026-11-12). Os
 * specs que configuravam a rede pelas tabelas antigas (`payment_fees`,
 * `tenants.cartao_*`) seguem configurando assim — o banco espelha na primeira
 * maquininha enquanto elas existirem —, mas o que a tela GRAVA vai à
 * maquininha. Estes leem o que vale.
 */

export interface PrimeiraMaquininha {
  id: string
  taxas: Record<string, number>
  max_vezes: number | null
  prazo_dias: number
  cobra_por_bandeira: boolean
  por_bandeira: Record<string, { prazo?: number; taxas: Record<string, number> }>
}

/** A primeira maquininha da rede (a que nasce com ela, "Maquininha"). */
export async function primeiraMaquininha(tenantId: string): Promise<PrimeiraMaquininha> {
  const { data, error } = await banco().from('maquininhas')
    .select('id, taxas, max_vezes, prazo_dias, cobra_por_bandeira, por_bandeira')
    .eq('tenant_id', tenantId).order('created_at').order('id').limit(1).single<PrimeiraMaquininha>()
  if (error || !data) throw new Error(`a primeira maquininha: ${error?.message}`)
  return data
}

/** As taxas da primeira maquininha como as linhas de `payment_fees`: [metodo, parcelas, taxa], em ordem. */
export async function taxasDaPrimeira(tenantId: string): Promise<[string, number, number][]> {
  const m = await primeiraMaquininha(tenantId)
  return Object.entries(m.taxas)
    .map(([k, v]) => { const [metodo, n] = k.split(':'); return [metodo!, Number(n), Number(v)] as [string, number, number] })
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1])
}

/** A taxa do Pix da rede (fora das maquininhas). */
export async function taxaDoPix(tenantId: string): Promise<number> {
  const { data } = await banco().from('tenants').select('pix_taxa_pct').eq('id', tenantId).single<{ pix_taxa_pct: number | string }>()
  return Number(data?.pix_taxa_pct ?? 0)
}

/**
 * Na tela de Taxas, a bandeira fica guardada até a clínica precisar: marca
 * "Esta maquininha cobra diferente em alguma bandeira?" e devolve o seletor.
 */
export async function seletorDaBandeira(card: Locator): Promise<Locator> {
  await card.getByLabel('Esta maquininha cobra diferente em alguma bandeira?').check()
  return card.getByLabel('Bandeira', { exact: true })
}
