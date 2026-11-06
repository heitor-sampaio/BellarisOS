import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { unidadeDoInsumo } from '@/lib/estoque/unidade-de-consumo'

type Admin = ReturnType<typeof createAdminClient>

/** Um insumo aplicado no atendimento, como vai ao titular. */
export interface InsumoDoAtendimento { produto: string; quantidade: number; unidade: string; lote: string | null }

type Movimento = {
  appointment_id: string; quantity: number | string
  products: { name: string; unit: string; consumption_unit: string | null; units_per_package: number | null } | null
  stock_movement_batches: { product_batches: { batch_number: string | null } | null }[] | null
}

/**
 * Os insumos de cada atendimento, de onde eles MORAM: o movimento de estoque
 * do consumo (`PROCEDURE_USAGE`, com o `appointment_id`) — D18 da 8ª
 * simulação, 2026-11-06. O pacote da LGPD lia
 * `medical_record_entries.products_used`, que nada grava, e dizia
 * `insumos: null` no atendimento que baixou 1 Gel condutor. A quantidade é a
 * do movimento, na unidade de consumo do produto (`unidadeDoInsumo`); o mesmo
 * produto em dois movimentos soma; o lote é o da baixa (FEFO), quando houver.
 * Erro de consulta aborta: no pacote da LGPD, faltar em silêncio é pior.
 */
export async function insumosDosAtendimentos(admin: Admin, atendimentos: string[]): Promise<Map<string, InsumoDoAtendimento[]>> {
  const saida = new Map<string, InsumoDoAtendimento[]>()
  const ids = [...new Set(atendimentos.filter(Boolean))]
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin.from('stock_movements')
      .select('appointment_id, quantity, products(name, unit, consumption_unit, units_per_package), stock_movement_batches(product_batches(batch_number))')
      .eq('type', 'PROCEDURE_USAGE').in('appointment_id', ids.slice(i, i + 100))
      .order('created_at')
    if (error) throw new Error(`Falha ao reunir os insumos dos atendimentos: ${error.message}`)
    for (const m of (data ?? []) as unknown as Movimento[]) {
      const lista = saida.get(m.appointment_id) ?? []
      const produto = m.products?.name ?? 'Produto'
      const unidade = m.products ? unidadeDoInsumo(m.products) : ''
      const lotes = (m.stock_movement_batches ?? []).map(b => b.product_batches?.batch_number).filter((x): x is string => !!x)
      const quantidade = Math.abs(Number(m.quantity))
      const mesmo = lista.find(x => x.produto === produto && x.unidade === unidade)
      if (mesmo) {
        mesmo.quantidade = Math.round((mesmo.quantidade + quantidade) * 1000) / 1000
        if (lotes.length) mesmo.lote = [...new Set([...(mesmo.lote ? mesmo.lote.split(', ') : []), ...lotes])].join(', ')
      } else {
        lista.push({ produto, quantidade, unidade, lote: lotes.length ? [...new Set(lotes)].join(', ') : null })
      }
      saida.set(m.appointment_id, lista)
    }
  }
  return saida
}

/** "Gel condutor 1 un (lote L12)" — a linha do PDF. */
export function insumosEmTexto(insumos: InsumoDoAtendimento[]): string {
  return insumos.map(x => `${x.produto} ${String(x.quantidade).replace('.', ',')} ${x.unidade}${x.lote ? ` (lote ${x.lote})` : ''}`.trim()).join('; ')
}
