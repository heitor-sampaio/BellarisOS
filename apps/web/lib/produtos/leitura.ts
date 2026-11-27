import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import type { LoteParaBaixa } from '@/lib/estoque/fefo'
import type { ProdutoAVenda } from '@/components/shared/vender'
import { configDaRede } from '@/lib/fidelidade/leitura'

/**
 * Os produtos que a ficha oferece para VENDER (D4, decisão do Heitor,
 * 2026-10-29): os de REVENDA ou de uso duplo (D-6), ativos, com preço de
 * venda — e quantas embalagens INTEIRAS há na unidade (a aberta não se vende;
 * `produto_vender` confere de novo, com a linha travada).
 *
 * E se a venda PONTUA (A48 da 5ª simulação): a janela diz, porque a venda de
 * produto nasce sem pontuar (Configurações → Fidelidade) e ninguém sabia.
 */
export async function produtosAVenda(tenantId: string, branchId: string | null): Promise<ProdutoAVenda[]> {
  if (!branchId) return []
  type Linha = {
    id: string; name: string; sale_price: number | string | null; unit: string
    consumption_unit: string | null; units_per_package: number | string | null
    branch_product_stock: { branch_id: string; current_stock: number | string; current_rendimento: number | string | null }[] | null
    comissao_tipo: string | null; comissao_valor: number | string | null
  }
  const linhas = (await ler(createAdminClient().from('products')
    .select('id, name, sale_price, unit, consumption_unit, units_per_package, comissao_tipo, comissao_valor, branch_product_stock(branch_id, current_stock, current_rendimento)')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .in('uso', ['REVENDA', 'AMBOS'])
    .not('sale_price', 'is', null)
    .order('name'), 'carregar os produtos à venda') ?? []) as Linha[]
  if (!linhas.length) return []
  // A fidelidade é da rede: desligada, a janela não fala de pontos.
  const cfg = await configDaRede(tenantId)
  const fidelidade: ProdutoAVenda['fidelidade'] = !cfg.enabled ? null : cfg.pontua_venda_de_produto ? 'PONTUA' : 'NAO_PONTUA'
  // A18 da 12ª: a regra de venda que o banco aplica (`produto_vender_itens`) — a do produto só no "Por produto".
  const comissoes = await ler(createAdminClient().from('commission_configs').select('produto_modo, produto_pct')
    .eq('tenant_id', tenantId).maybeSingle(), 'carregar a comissão de venda de produto') as { produto_modo: string | null; produto_pct: number | string | null } | null
  // D3 da 38ª (ES-24): os lotes com saldo da unidade (os ids iriam na URL: a unidade já recorta)
  // — a venda diz o que sai de lote vencido.
  type Lote = { id: string; product_id: string; batch_number: string | null; expires_at: string | null; received_at: string | null; quantity: number | string }
  const lotes = await lerTodas<Lote>((de, ate) => createAdminClient().from('product_batches')
    .select('id, product_id, batch_number, expires_at, received_at, quantity')
    .eq('branch_id', branchId).gt('quantity', 0)
    .order('expires_at', { ascending: true, nullsFirst: false }).order('id')
    .range(de, ate) as unknown as PromiseLike<{ data: Lote[] | null; error: { message: string } | null }>,
  'carregar os lotes dos produtos à venda')
  const lotesDe = new Map<string, LoteParaBaixa[]>()
  for (const l of lotes) {
    lotesDe.set(l.product_id, [...(lotesDe.get(l.product_id) ?? []),
      { id: l.id, numero: l.batch_number, validade: l.expires_at, recebidoEm: l.received_at, quantidade: Number(l.quantity) }])
  }
  const porProduto = comissoes?.produto_modo === 'POR_PRODUTO'
  const redePct = comissoes?.produto_pct != null ? Number(comissoes.produto_pct) : null
  return linhas.map(p => {
    const saldo = (p.branch_product_stock ?? []).find(s => s.branch_id === branchId)
    const upp = Number(p.units_per_package ?? 0)
    const temConsumo = upp > 0 && !!(p.consumption_unit ?? '').trim()
    const embalagens = Number(saldo?.current_stock ?? 0)
    const rendimento = saldo?.current_rendimento != null ? Number(saldo.current_rendimento) : embalagens * upp
    const disponivel = Math.max(0, Math.floor(temConsumo ? Math.round(rendimento / upp * 1e6) / 1e6 : embalagens))
    const doItem = porProduto && (p.comissao_tipo === 'PERCENTAGE' || p.comissao_tipo === 'FIXED_AMOUNT') && p.comissao_valor != null
      ? { tipo: p.comissao_tipo as 'PERCENTAGE' | 'FIXED_AMOUNT', valor: Number(p.comissao_valor) } : null
    return { id: p.id, name: p.name, price: Number(p.sale_price ?? 0), unidade: p.unit, disponivel, fidelidade, comissaoDoItem: doItem, comissaoDaRedePct: redePct, lotes: lotesDe.get(p.id) ?? [] }
  })
}
