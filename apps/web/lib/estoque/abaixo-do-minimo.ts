import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import {
  situacaoDoEstoque, estoqueBaixo, saldoParaMostrar, minimoParaMostrar, formatarQuantidadeComUnidade, ROTULO_DA_SITUACAO,
  minimoEhDoCadastro, rotuloDoMinimo,
} from './situacao'

/**
 * Os produtos no mínimo ou abaixo dele (A39 da 10ª simulação, 2026-11-10: o
 * "abaixo do mínimo" só aparecia no Estoque e no relatório — o dashboard da
 * UNIDADE não tinha o quadro que o da rede tem). A régua é a da tela de
 * estoque (`situacaoDoEstoque`, J-43: no rendimento, com "No mínimo" separado
 * de "Abaixo do mínimo"), só nos saldos com mínimo configurado. É uma lista
 * (até 20), não um número: o quadro diz quais.
 */
export interface ItemAbaixoDoMinimo {
  productName: string
  branchName:  string
  branchSlug:  string
  /** "268 UI", na unidade de consumo. */
  saldo:       string
  minimo:      string
  /** "Abaixo do mínimo", "No mínimo" ou "Sem estoque". */
  situacao:    string
}

type Num = number | string
type Linha = {
  product_id: string; current_stock: Num; min_stock: Num; current_rendimento: Num | null; branch_id: string
  products: { name: string; is_active: boolean; unit: string; consumption_unit: string | null; units_per_package: Num | null; min_stock: Num | null } | null
  branches: { name: string; slug: string } | null
}

export async function itensAbaixoDoMinimo(branchIds: string[], limite = 20): Promise<ItemAbaixoDoMinimo[]> {
  if (!branchIds.length) return []
  const admin = createAdminClient()
  const linhas = await lerTodas<Linha>((de, ate) => admin.from('branch_product_stock')
    .select('product_id, current_stock, min_stock, current_rendimento, branch_id, products!inner(name, is_active, unit, consumption_unit, units_per_package, min_stock), branches(name, slug)')
    .in('branch_id', branchIds)
    .gt('min_stock', 0)
    .eq('products.is_active', true)
    .order('current_stock', { ascending: true }).order('product_id').order('branch_id')
    .range(de, ate) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>,
  'carregar os saldos abaixo do mínimo')
  return linhas
    .map(b => {
      const saldo = { embalagens: Number(b.current_stock), rendimento: b.current_rendimento != null ? Number(b.current_rendimento) : null, minimo: Number(b.min_stock) }
      const medidas = { unit: b.products?.unit ?? '', consumption_unit: b.products?.consumption_unit ?? null, units_per_package: b.products?.units_per_package ?? null }
      return { b, saldo, medidas, situacao: situacaoDoEstoque(saldo, medidas) }
    })
    .filter(s => s.situacao === 'SEM_ESTOQUE' || estoqueBaixo(s.situacao))
    .slice(0, limite)
    .map(s => ({
      productName: s.b.products?.name ?? '—',
      branchName:  s.b.branches?.name ?? '—',
      branchSlug:  s.b.branches?.slug ?? '',
      saldo:       formatarQuantidadeComUnidade(saldoParaMostrar(s.saldo, s.medidas)),
      // A15 da 14ª: o mínimo herdado do cadastro diz "(do cadastro)", como no Estoque.
      minimo:      rotuloDoMinimo(minimoParaMostrar(s.saldo, s.medidas), minimoEhDoCadastro(s.saldo.minimo, s.b.products?.min_stock != null ? Number(s.b.products.min_stock) : null)),
      situacao:    ROTULO_DA_SITUACAO[s.situacao],
    }))
}
