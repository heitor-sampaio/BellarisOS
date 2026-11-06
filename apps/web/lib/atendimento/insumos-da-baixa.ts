import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { saldoDepoisDaSaida } from '@/lib/estoque/baixa'

type Admin = ReturnType<typeof createAdminClient>

/** Um insumo como `concluir_atendimento` e `desistir_do_atendimento` o gravam. */
export interface InsumoDaBaixa {
  produto: string; quantidade: number; saldo_apos: number
  embalagens: number; rendimento: number | null; minimo: number
  /** O saldo LIDO para a conta: o banco confere que ainda é este (PT409 se não). */
  antes_embalagens: number; antes_rendimento: number | null
}

/**
 * Os insumos da tela (`products_used`), somados por produto: o mesmo produto
 * duas vezes na lista soma — a baixa é calculada sobre o saldo lido UMA vez.
 */
export function insumosPorProduto(json: string | null): Map<string, number> {
  let lista: { productId: string; quantity: number }[] = []
  try { lista = JSON.parse(json ?? '[]') } catch { /* JSON inválido → sem insumos */ }
  const porProduto = new Map<string, number>()
  for (const item of Array.isArray(lista) ? lista : []) {
    if (!item?.productId || !item.quantity || item.quantity <= 0) continue
    porProduto.set(item.productId, (porProduto.get(item.productId) ?? 0) + item.quantity)
  }
  return porProduto
}

/**
 * Lê o saldo e calcula a baixa de cada insumo na unidade — a conta da conclusão
 * do atendimento (§10), que a desistência no meio (A27 da 8ª simulação) também
 * usa. Chamada de novo a cada tentativa (`comNovaTentativa`): se outra saída
 * mudar o saldo no meio, o banco recusa e a conta é refeita sobre o saldo
 * novo. Insumo faltando não impede: o saldo fica negativo e volta um aviso.
 */
export async function montarInsumosDaBaixa(
  admin: Admin, tenantId: string, branchId: string, porProduto: Map<string, number>,
): Promise<{ insumos: InsumoDaBaixa[]; avisos: string[] }> {
  const avisos: string[] = []
  const insumos: InsumoDaBaixa[] = []
  for (const [productId, quantity] of porProduto) {
    // Leitura que falha não pode virar "saldo 0": a baixa seria calculada
    // sobre um número inventado e gravada como verdade no movimento.
    const [bps, prod] = await Promise.all([
      ler(admin.from('branch_product_stock')
        .select('current_stock, min_stock, current_rendimento')
        .eq('product_id', productId)
        .eq('branch_id', branchId)
        .maybeSingle(), 'buscar o saldo do insumo'),
      // Da rede: o id vem do navegador (`products_used`), e um produto de
      // outra rede ganharia saldo e movimento nesta unidade.
      ler(admin.from('products')
        .select('name, unit, units_per_package, consumption_unit')
        .eq('id', productId)
        .eq('tenant_id', tenantId)
        .maybeSingle(), 'buscar o insumo'),
    ])
    if (!prod) continue

    const currentStock = Number(bps?.current_stock ?? 0)
    const upp          = prod?.units_per_package && prod?.consumption_unit ? Number(prod.units_per_package) : null

    // A conta do saldo depois da saída é a mesma da entrega de produto de
    // voucher (lib/estoque/baixa.ts): uma cópia só.
    const { embalagens, rendimento, saldoApos } = saldoDepoisDaSaida({
      embalagens:           currentStock,
      rendimento:           bps?.current_rendimento != null ? Number(bps.current_rendimento) : null,
      unidadesPorEmbalagem: upp,
    }, quantity)

    // O custo não vai daqui: o banco grava o da unidade de CONSUMO
    // (custo_de_consumo — o frasco ÷ o que ele rende).
    insumos.push({
      produto: productId, quantidade: -quantity, saldo_apos: saldoApos,
      embalagens, rendimento,
      minimo:  Number(bps?.min_stock ?? 0),
      antes_embalagens: currentStock,
      antes_rendimento: bps?.current_rendimento != null ? Number(bps.current_rendimento) : null,
    })

    if (saldoApos < 0) {
      const unidade = upp ? (prod.consumption_unit as string) : (prod.unit as string)
      const falta = (-saldoApos).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
      avisos.push(`${prod.name as string}: faltaram ${falta} ${unidade} no estoque da unidade`)
    }
  }
  return { insumos, avisos }
}
