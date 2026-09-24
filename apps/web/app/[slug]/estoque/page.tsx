import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminStockView } from '@/components/admin/admin-stock-view'
import { ProductCategoryModal } from '@/components/admin/product-category-modal'
import { StockProductModal } from '@/components/branch/stock-product-modal'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { filiaisAtivas } from '@/lib/branches'
import { Package, AlertTriangle, ShoppingCart, CalendarClock } from 'lucide-react'
import { startOfMonthTZ, addDaysTZ } from '@/lib/datetime'
import { ler } from '@/lib/db'

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function BranchStockPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx      = await getTenantContext()
  assertPermission(ctx, 'stock', 'VIEW')
  const readOnly = ctx.permissions.stock !== 'MANAGE'

  const admin = createAdminClient()

  const branch = await ler(admin
    .from('branches')
    .select('id, name, slug, tenant_id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()

  const branchId = branch.id

  // Produtos e categorias em paralelo
  const [{ data: raw }, { data: categoriesRaw }] = await Promise.all([
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
      .from('product_categories')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId!)
      .order('name'),
  ])

  // Normaliza — filtra estoque apenas desta filial
  const products = (raw ?? []).map((p: any) => {
    const bps: { current_stock: number; min_stock: number; branches: { id: string; name: string; slug: string } }[] =
      p.branch_product_stock ?? []

    const branchStocks = bps
      .filter(b => b.branches && b.branches.id === branchId)
      .map(b => ({
        branchId:          b.branches.id,
        branchName:        b.branches.name,
        branchSlug:        b.branches.slug,
        currentStock:      Number(b.current_stock),
        minStock:          Number(b.min_stock),
        currentRendimento: (b as any).current_rendimento != null ? Number((b as any).current_rendimento) : null,
      }))

    const totalStock = branchStocks.reduce((s, b) => s + b.currentStock, 0)

    const upp = p.units_per_package ? Number(p.units_per_package) : null
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

  const branchData   = [{ id: branch.id, name: branch.name, slug: branch.slug }]
  // As outras unidades entram só como DESTINO de transferência: a lista visível
  // continua sendo a desta filial. Sem isto, a aba Transferência sumia — a
  // unidade não tinha para onde mandar produto.
  const unidadesDaRede = await filiaisAtivas(ctx.tenantId!)
  const categories   = categoriesRaw ?? []
  const productIds   = products.map(p => p.id)

  const now          = new Date()
  const startOfMonth = startOfMonthTZ(now).toISOString()
  const in30Days     = addDaysTZ(now, 30)

  const [{ data: movementsRaw }, { data: batchesRaw }] = productIds.length > 0
    ? await Promise.all([
        // Giro ao custo do movimento (unit_cost), que preserva o custo da
        // época; o custo atual do produto é só o fallback.
        admin
          .from('stock_movements')
          .select('product_id, quantity, unit_cost')
          .in('product_id', productIds)
          .eq('branch_id', branchId)
          .eq('type', 'PROCEDURE_USAGE')
          .gte('created_at', startOfMonth),

        // `product_batches` não tem branch_id — o filtro por filial que existia
        // aqui fazia o PostgREST devolver erro e o alerta ficava sempre vazio.
        // O lote é do produto; o recorte da filial vem de productIds.
        admin
          .from('product_batches')
          .select('product_id, expires_at')
          .in('product_id', productIds)
          .gt('quantity', 0)
          .lte('expires_at', in30Days.toISOString()),
      ])
    : [{ data: [] as any }, { data: [] as any }]

  // KPIs da filial
  const valorEstoque = products.reduce(
    (sum, p) => sum + p.costPrice * p.totalStock,
    0,
  )

  const costMap  = Object.fromEntries(products.map(p => [p.id, p.costPrice]))
  const valorGiro = (movementsRaw ?? []).reduce(
    (sum: number, m: any) =>
      sum + Math.abs(Number(m.quantity)) * Number(m.unit_cost ?? costMap[m.product_id] ?? 0),
    0,
  )

  const abaixoMinimo = products.filter(p =>
    p.branches.some(b => b.minStock > 0 && b.currentStock <= b.minStock),
  ).length

  // `every` sobre lista vazia é true: sem a guarda de comprimento, todo produto
  // do catálogo da rede que nunca teve estoque nesta filial entrava na conta.
  const semEstoque = products.filter(p =>
    p.branches.length > 0 && p.branches.every(b => b.currentStock === 0),
  ).length

  // Conta LOTES, não produtos — cinco lotes do mesmo produto vencendo são cinco
  // avisos. Lotes já vencidos entram no alerta em vez de sumirem dele.
  const validadeProxima = (batchesRaw ?? []).length

  const suppliers       = [...new Set(products.map(p => p.supplier).filter(Boolean) as string[])].sort()
  const stockCategories = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RealtimeRefresher tables={['products', 'branch_product_stock', 'stock_movements']} />

      {/* Header */}
      {/* Sem `flexWrap`, os botões espremiam o título: no celular o subtítulo
          do estoque virava uma coluna de quatro linhas com uma palavra em cada. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Estoque
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {branch.name}
          </p>
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', gap: 8 }}>
            <ProductCategoryModal categories={categories} />
            <StockProductModal
              suppliers={suppliers}
              categories={categories}
              trigger={
                <button type="button" className="btn-primary">
                  <Package size={15} />
                  Novo produto
                </button>
              }
            />
          </div>
        )}
      </div>

      {/* KPIs */}
      {(() => {
        const allKpis = [
          ...(!readOnly ? [
            {
              label: 'VALOR EM ESTOQUE',
              value: fmtBRL(valorEstoque),
              icon:  <ShoppingCart size={18} style={{ color: 'var(--on-brand)' }} />,
              iconBg: 'rgba(255,255,255,0.2)', color: 'var(--on-brand)',
              labelColor: 'rgba(255,255,255,0.75)', brand: true,
            },
            {
              label: `GIRO — ${now.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase()}`,
              value: fmtBRL(valorGiro),
              icon:  <ShoppingCart size={18} style={{ color: 'var(--brand)' }} />,
              iconBg: 'var(--brand-soft)', color: 'var(--text)',
              labelColor: 'var(--text-muted)', brand: false,
            },
          ] : []),
          {
            label: 'ABAIXO DO MÍNIMO',
            value: String(abaixoMinimo),
            icon:  <AlertTriangle size={18} style={{ color: abaixoMinimo > 0 ? '#d97706' : 'var(--text-faint)' }} />,
            iconBg: abaixoMinimo > 0 ? '#fffbeb' : 'var(--bg-app)',
            color: abaixoMinimo > 0 ? '#d97706' : 'var(--text)',
            labelColor: 'var(--text-muted)', brand: false,
          },
          {
            label: 'SEM ESTOQUE',
            value: String(semEstoque),
            icon:  <Package size={18} style={{ color: semEstoque > 0 ? '#dc2626' : 'var(--text-faint)' }} />,
            iconBg: semEstoque > 0 ? '#fef2f2' : 'var(--bg-app)',
            color: semEstoque > 0 ? '#dc2626' : 'var(--text)',
            labelColor: 'var(--text-muted)', brand: false,
          },
          {
            label: 'VALIDADE EM 30 DIAS',
            value: String(validadeProxima),
            icon:  <CalendarClock size={18} style={{ color: validadeProxima > 0 ? '#d97706' : 'var(--text-faint)' }} />,
            iconBg: validadeProxima > 0 ? '#fffbeb' : 'var(--bg-app)',
            color: validadeProxima > 0 ? '#d97706' : 'var(--text)',
            labelColor: 'var(--text-muted)', brand: false,
          },
        ]
        return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${allKpis.length}, 1fr)`, gap: 12 }}>
        {allKpis.map(k => (
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
        )
      })()}

      <AdminStockView
        products={products}
        branches={branchData}
        unidadesDaRede={unidadesDaRede}
        categories={stockCategories}
        productCategories={categories as { id: string; name: string }[]}
        suppliers={suppliers}
        defaultBranchId={branchId}
        readOnly={readOnly}
      />
    </div>
  )
}
