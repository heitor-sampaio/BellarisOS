import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminStockView } from '@/components/admin/admin-stock-view'
import { ProductCategoryModal } from '@/components/admin/product-category-modal'
import { StockProductModal } from '@/components/branch/stock-product-modal'
import { Package, AlertTriangle, ShoppingCart, CalendarClock } from 'lucide-react'
import { startOfMonthTZ, addDaysTZ } from '@/lib/datetime'

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function AdminEstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ unidade?: string }>
}) {
  const { unidade: unidadeParam } = await searchParams
  const ctx = await getTenantContext()
  assertPermission(ctx, 'stock', 'VIEW')
  const canEdit = ctx.permissions.stock === 'MANAGE'

  const admin = createAdminClient()

  // Primeira rodada: produtos com estoque, filiais e categorias.
  //
  // O erro do embed aninhado (`products → branch_product_stock → branches`) era
  // descartado: qualquer recusa do PostgREST deixava o estoque da rede inteiro
  // em branco, sem mensagem nenhuma.
  const [{ data: raw, error: produtosErr }, { data: branchesRaw, error: filiaisErr }, { data: categoriesRaw }] = await Promise.all([
    admin
      .from('products')
      .select(`
        id, name, sku, barcode, category, category_id, unit, supplier,
        cost_price, sale_price, consumption_unit, units_per_package, is_active,
        branch_product_stock(
          current_stock, min_stock, current_rendimento,
          branches(id, name, slug)
        )
      `)
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'),

    admin
      .from('branches')
      .select('id, name, slug')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'),

    admin
      .from('product_categories')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId!)
      .order('name'),
  ])

  if (produtosErr) throw new Error(`Não foi possível carregar o estoque: ${produtosErr.message}`)
  if (filiaisErr)  throw new Error(`Não foi possível carregar as unidades: ${filiaisErr.message}`)

  // Normaliza produtos
  const products = (raw ?? []).map((p: any) => {
    const bps: { current_stock: number; min_stock: number; current_rendimento: number | null; branches: { id: string; name: string; slug: string } }[] =
      p.branch_product_stock ?? []

    const branchStocks = bps
      .filter(b => b.branches)
      .map(b => ({
        branchId:          b.branches.id,
        branchName:        b.branches.name,
        branchSlug:        b.branches.slug,
        currentStock:      Number(b.current_stock),
        minStock:          Number(b.min_stock),
        currentRendimento: b.current_rendimento != null ? Number(b.current_rendimento) : null,
      }))

    const upp = p.units_per_package ? Number(p.units_per_package) : null
    const totalStock = branchStocks.reduce((s, b) => s + b.currentStock, 0)
    const totalRendimento = upp
      ? branchStocks.reduce((s, b) =>
          s + (b.currentRendimento != null ? b.currentRendimento : b.currentStock * upp), 0)
      : null

    return {
      id:               p.id as string,
      name:             p.name as string,
      sku:              p.sku as string | null,
      barcode:          p.barcode as string | null,
      category:         p.category as string | null,
      categoryId:       p.category_id as string | null,
      unit:             p.unit as string,
      supplier:         p.supplier as string | null,
      costPrice:        Number(p.cost_price ?? 0),
      salePrice:        p.sale_price != null ? Number(p.sale_price) : null,
      consumptionUnit:  p.consumption_unit as string | null,
      unitsPerPackage:  upp,
      totalStock,
      totalRendimento,
      branches:         branchStocks,
    }
  })

  const branches   = (branchesRaw ?? []) as { id: string; name: string; slug: string }[]
  const categories = categoriesRaw ?? []
  const productIds = products.map(p => p.id)

  // `?unidade=` (id ou slug) recorta a tela para uma filial. Os KPIs seguem o
  // recorte: com a tabela filtrada em Centro e o topo somando a rede, os dois
  // blocos diriam números diferentes sobre a mesma tela.
  const unidade   = branches.find(b => b.id === unidadeParam || b.slug === unidadeParam) ?? null
  const unidadeId = unidade?.id ?? ''

  /** Saldo do produto na unidade recortada — ou na rede, quando não há. */
  const saldoDe = (p: { totalStock: number; branches: { branchId: string; currentStock: number }[] }) =>
    unidadeId
      ? p.branches.filter(b => b.branchId === unidadeId).reduce((s, b) => s + b.currentStock, 0)
      : p.totalStock

  // Segunda rodada: movimentos e lotes (dependem dos product IDs)
  const now       = new Date()
  const in30Days  = addDaysTZ(now, 30)
  const monthStart = startOfMonthTZ(now)

  const [{ data: movementsRaw }, { data: batchesRaw }] = productIds.length > 0
    ? await Promise.all([
        // Giro = consumo em procedimentos no mês, a mesma definição usada na
        // tela da filial. Antes a rede somava QUALQUER saída dos últimos 30
        // dias — incluindo transferência entre unidades da própria rede, que
        // não é consumo — e por isso a soma das filiais nunca fechava com ela.
        (unidadeId
          ? admin
              .from('stock_movements')
              .select('product_id, quantity, unit_cost')
              .in('product_id', productIds)
              .eq('type', 'PROCEDURE_USAGE')
              .eq('branch_id', unidadeId)
              .gte('created_at', monthStart.toISOString())
          : admin
              .from('stock_movements')
              .select('product_id, quantity, unit_cost')
              .in('product_id', productIds)
              .eq('type', 'PROCEDURE_USAGE')
              .gte('created_at', monthStart.toISOString())),

        // Lotes com saldo vencendo em até 30 dias (inclui os já vencidos)
        admin
          .from('product_batches')
          .select('product_id, expires_at')
          .in('product_id', productIds)
          .gt('quantity', 0)
          .lte('expires_at', in30Days.toISOString()),
      ])
    : [{ data: [] as any }, { data: [] as any }]

  // -- KPIs ------------------------------------------------------------
  const valorEstoque = products.reduce(
    (sum, p) => sum + p.costPrice * saldoDe(p),
    0,
  )

  const costMap = Object.fromEntries(products.map(p => [p.id, p.costPrice]))
  const valorGiro = (movementsRaw ?? []).reduce(
    (sum: number, m: any) =>
      sum + Math.abs(Number(m.quantity)) * Number(m.unit_cost ?? costMap[m.product_id] ?? 0),
    0,
  )

  // Com uma unidade recortada, só o saldo dela conta — um produto zerado no
  // Centro e cheio no Jardins é problema de quem opera o Centro.
  const saldosVisiveis = (p: (typeof products)[number]) =>
    unidadeId ? p.branches.filter(b => b.branchId === unidadeId) : p.branches

  const abaixoMinimo = products.filter(p =>
    saldosVisiveis(p).some(b => b.minStock > 0 && b.currentStock <= b.minStock),
  ).length

  const semEstoque = products.filter(p => {
    const saldos = saldosVisiveis(p)
    return saldos.length > 0 && saldos.every(b => b.currentStock === 0)
  }).length

  // Conta lotes, não produtos distintos.
  const validadeProxima = (batchesRaw ?? []).length

  const suppliers      = [...new Set(products.map(p => p.supplier).filter(Boolean) as string[])].sort()
  const stockCategories = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      {/* Sem `flexWrap`, os botões espremiam o título: no celular o subtítulo
          do estoque virava uma coluna de quatro linhas com uma palavra em cada. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Estoque
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {unidade
              ? unidade.name
              : `Visão consolidada da rede · ${branches.length} filial${branches.length !== 1 ? 'is' : ''}`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && <ProductCategoryModal categories={categories} />}
          {canEdit && (
            <StockProductModal
              suppliers={suppliers}
              categories={categories}
              branches={branches}
              trigger={
                <button type="button" className="btn-primary">
                  <Package size={15} />
                  Novo produto
                </button>
              }
            />
          )}
        </div>
      </div>

      {/* KPIs — 5 cards (auto-colapsa no mobile) */}
      <div className="kpi-grid-auto">
        {[
          {
            label:   'VALOR EM ESTOQUE',
            value:   fmtBRL(valorEstoque),
            icon:    <ShoppingCart size={18} style={{ color: 'var(--on-brand)' }} />,
            iconBg:  'rgba(255,255,255,0.2)',
            color:   'var(--on-brand)',
            labelColor: 'rgba(255,255,255,0.75)',
            brand:   true,
          },
          {
            label:   'GIRO MENSAL',
            value:   fmtBRL(valorGiro),
            icon:    <ShoppingCart size={18} style={{ color: 'var(--brand)' }} />,
            iconBg:  'var(--brand-soft)',
            color:   'var(--text)',
            labelColor: 'var(--text-muted)',
            brand:   false,
          },
          {
            label:   'ABAIXO DO MÍNIMO',
            value:   String(abaixoMinimo),
            icon:    <AlertTriangle size={18} style={{ color: abaixoMinimo > 0 ? '#d97706' : 'var(--text-faint)' }} />,
            iconBg:  abaixoMinimo > 0 ? '#fffbeb' : 'var(--bg-app)',
            color:   abaixoMinimo > 0 ? '#d97706' : 'var(--text)',
            labelColor: 'var(--text-muted)',
            brand:   false,
          },
          {
            label:   'SEM ESTOQUE',
            value:   String(semEstoque),
            icon:    <Package size={18} style={{ color: semEstoque > 0 ? '#dc2626' : 'var(--text-faint)' }} />,
            iconBg:  semEstoque > 0 ? '#fef2f2' : 'var(--bg-app)',
            color:   semEstoque > 0 ? '#dc2626' : 'var(--text)',
            labelColor: 'var(--text-muted)',
            brand:   false,
          },
          {
            label:   'VALIDADE EM 30 DIAS',
            value:   String(validadeProxima),
            icon:    <CalendarClock size={18} style={{ color: validadeProxima > 0 ? '#d97706' : 'var(--text-faint)' }} />,
            iconBg:  validadeProxima > 0 ? '#fffbeb' : 'var(--bg-app)',
            color:   validadeProxima > 0 ? '#d97706' : 'var(--text)',
            labelColor: 'var(--text-muted)',
            brand:   false,
          },
        ].map(k => (
          <div
            key={k.label}
            className={k.brand ? 'card-brand' : 'card'}
            style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <div className="kpi-icone" style={{
              width: 40, height: 40, borderRadius: 'var(--radius-field-token)', flexShrink: 0,
              background: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {k.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="kpi-rotulo" style={{ fontSize: 10.5, fontWeight: 700, color: k.labelColor, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                {k.label}
              </p>
              <p style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: k.color, marginTop: 3, whiteSpace: 'nowrap' }}>
                {k.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <AdminStockView
        products={products}
        branches={branches}
        categories={stockCategories}
        productCategories={categories as { id: string; name: string }[]}
        suppliers={suppliers}
        unidadeInicial={unidadeId}
        readOnly={!canEdit}
      />
    </div>
  )
}
