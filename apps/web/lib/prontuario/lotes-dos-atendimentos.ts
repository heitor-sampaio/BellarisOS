import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ler } from '@/lib/db'
import { formatarDose } from '@/lib/injetaveis/dose'
import { validadeNaTela } from '@/lib/estoque/validade'

/**
 * O LOTE que cada atendimento usou, para o prontuário da paciente (A33 da 11ª
 * simulação, 2026-11-10: o caminho lote → pacientes existia no Estoque, o
 * "Aplicado em", mas quem parte da paciente — o caso da reação adversa — não
 * chegava ao lote). A ligação é a da baixa (`stock_movement_batches` do
 * `PROCEDURE_USAGE` do atendimento, o gatilho do lote), a mesma do "Saiu do
 * lote" da tela do atendimento; a quantidade é a daquele lote, na unidade de
 * consumo. Só o servidor lê; quem chama já decidiu que o clínico vai à tela.
 */
export interface LoteDoAtendimento {
  loteId:     string
  produto:    string
  numero:     string | null
  validade:   string | null
  quantidade: string
}

export async function lotesDosAtendimentos(
  admin: SupabaseClient, tenantId: string, appointmentIds: string[],
): Promise<Record<string, LoteDoAtendimento[]>> {
  const ids = [...new Set(appointmentIds.filter(Boolean))]
  const saida: Record<string, LoteDoAtendimento[]> = {}
  type Lig = {
    quantity: number | string
    product_batches: { id: string; batch_number: string | null; expires_at: string | null } | null
    stock_movements: { appointment_id: string; products: { name: string; unit: string | null; consumption_unit: string | null; units_per_package: number | string | null; tenant_id: string } } | null
  }
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100)
    const ligs = (await ler(admin.from('stock_movement_batches')
      .select('quantity, product_batches(id, batch_number, expires_at), stock_movements!inner(appointment_id, type, products!inner(name, unit, consumption_unit, units_per_package, tenant_id))')
      .in('stock_movements.appointment_id', lote)
      .eq('stock_movements.type', 'PROCEDURE_USAGE')
      .eq('stock_movements.products.tenant_id', tenantId), 'ler os lotes dos atendimentos') ?? []) as unknown as Lig[]
    for (const l of ligs) {
      if (!l.product_batches || !l.stock_movements) continue
      const p = l.stock_movements.products
      const fator = p.consumption_unit && Number(p.units_per_package) > 0 ? Number(p.units_per_package) : 1
      const unidade = p.consumption_unit && Number(p.units_per_package) > 0 ? p.consumption_unit : (p.unit ?? 'un')
      const q = Math.round(Number(l.quantity) * fator * 1000) / 1000
      ;(saida[l.stock_movements.appointment_id] ??= []).push({
        loteId: l.product_batches.id, produto: p.name, numero: l.product_batches.batch_number,
        validade: validadeNaTela(l.product_batches.expires_at), quantidade: `${formatarDose(q)} ${unidade}`,
      })
    }
  }
  return saida
}
