import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { loteDaUrl } from '@/lib/estoque/lote-da-url'
import { AdminStockView } from '@/components/admin/admin-stock-view'
import { ProductCategoryModal } from '@/components/admin/product-category-modal'
import { StockProductModal } from '@/components/branch/stock-product-modal'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { filiaisAtivas } from '@/lib/branches'
import { Package, AlertTriangle, ShoppingCart, CalendarClock } from 'lucide-react'
import { startOfMonthTZ, endOfMonthTZ, addDaysTZ } from '@/lib/datetime'
import { getGiroDeEstoque } from '@/lib/metrics/demografia'
import { getValorEmEstoque, getValorEmEstoquePorProduto } from '@/lib/metrics/unidade'
import { termoDaUrl } from '@/lib/texto'
import { ler } from '@/lib/db'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { lotesComSaldo, lotesVencendo, paresComLoteEsgotado, type LoteDoProduto } from '@/lib/estoque/lotes'
import { contarSituacoes, DETALHE_DO_GIRO } from '@/lib/estoque/situacao'
import { CartoesDoEstoque, linhasDaValidade, loteNoCartao, type CartaoDoEstoque } from '@/components/shared/cartoes-do-estoque'
import { produtosDoEstoque, fornecedoresDaRede, type ProdutoDoEstoque } from '@/lib/estoque/produtos-da-tela'
import { catalogoDaRede, recusaDoCatalogo } from '@/lib/estoque/catalogo'
import { mexeNaConfigDaClinica } from '@/lib/configuracao-da-rede'

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function BranchStockPage({
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ q?: string | string[]; lote?: string | string[] }>
}) {
  const { slug } = await params
  // `?q=` abre a lista filtrada (a busca universal entra por aqui).
  const busca    = termoDaUrl((await searchParams).q)
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
  // Por `ler`: consulta que falha PARA, em vez de virar um estoque vazio.
  // C26: os produtos em páginas; D1: o desativado com saldo continua (lib/estoque/produtos-da-tela).
  const [raw, fornecedores, catalogo, categoriesRaw] = await Promise.all([
    produtosDoEstoque(ctx.tenantId!),
    fornecedoresDaRede(ctx.tenantId!),
    catalogoDaRede(admin, ctx.tenantId!),
    ler(admin
      .from('product_categories')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId!)
      .order('name'), 'carregar as categorias'),
  ])

  // Normaliza — filtra estoque apenas desta filial
  // D1: o desativado só aparece onde ainda tem saldo — nesta unidade.
  const comSaldoAqui = (p: ProdutoDoEstoque) => (p.branch_product_stock ?? []).some(b => b.branches?.id === branchId
    && (Number(b.current_stock) > 0 || Number(b.current_rendimento ?? 0) > 0))
  const products = raw.filter(p => p.is_active || comSaldoAqui(p)).map(p => {
    const bps = p.branch_product_stock ?? []

    const branchStocks = bps
      .flatMap(b => (b.branches && b.branches.id === branchId ? [{ ...b, branches: b.branches }] : []))
      .map(b => ({
        branchId:          b.branches.id,
        branchName:        b.branches.name,
        branchSlug:        b.branches.slug,
        currentStock:      Number(b.current_stock),
        minStock:          Number(b.min_stock),
        currentRendimento: b.current_rendimento != null ? Number(b.current_rendimento) : null,
      }))

    const totalStock = branchStocks.reduce((s, b) => s + b.currentStock, 0)

    const upp = p.units_per_package ? Number(p.units_per_package) : null
    const totalRendimento = upp
      ? branchStocks.reduce((s, b) =>
          s + (b.currentRendimento != null ? b.currentRendimento : b.currentStock * upp), 0)
      : null

    return {
      id:               p.id,
      name:             p.name,
      sku:              p.sku,
      barcode:          p.barcode,
      category:         p.category,
      categoryId:       p.category_id,
      unit:             p.unit,
      supplier:         p.supplier,
      fornecedorId:     p.fornecedor_id,
      isActive:         p.is_active,
      costPrice:        Number(p.cost_price ?? 0),
      // D11 da 12ª: sem a linha da unidade, a aba "Estoque mínimo" mostra este.
      minimoDoCadastro: p.min_stock != null ? Number(p.min_stock) : null,
      salePrice:        p.sale_price != null ? Number(p.sale_price) : null,
      uso:              p.uso,
      consumptionUnit:  p.consumption_unit,
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
  // O mês do giro e o "em 30 dias" no fuso da unidade (F62b).
  const fuso         = await fusoDaUnidade(ctx.tenantId, branchId)
  const in30Days     = addDaysTZ(now, 30, fuso)

  // Por `ler`: sem checar o erro, uma falha virava giro zero e nenhum lote
  // vencendo — os dois alertas quietos exatamente quando não deviam.
  // Valor em estoque e giro do mês somados no banco, pela mesma conta do
  // dashboard (custo do movimento; o do cadastro só como reserva). Somar as
  // linhas aqui cortava em 1000 (§13.1). Fim do MÊS, não "agora": o consumo
  // lançado neste segundo nasce com o relógio do Postgres, à frente do app.
  const [valorEstoque, valorGiro, lotes, valores] = productIds.length > 0
    ? await Promise.all([
        getValorEmEstoque([branchId]),
        getGiroDeEstoque({ branchIds: [branchId], from: startOfMonthTZ(now, fuso), to: endOfMonthTZ(now, fuso) }),

        // O lote é DA UNIDADE (desde 2026-09-28): o que vence aqui é o que está
        // nesta prateleira, não o que está em outra unidade. Todos os lotes com
        // saldo: a linha aberta mostra número, validade e custo (J-45).
        lotesComSaldo(admin, [branchId], products.map(p => ({ id: p.id, fator: p.consumptionUnit && p.unitsPerPackage ? p.unitsPerPackage : 1 }))),
        getValorEmEstoquePorProduto([branchId]),
      ])
    : [0, 0, [] as LoteDoProduto[], new Map<string, number>()]

  // No mínimo OU abaixo (o alerta de sempre), no rendimento — J-43. Sem
  // estoque é não ter saldo POSITIVO nesta unidade: o negativo e o produto ativo
  // sem nenhuma linha de saldo aqui contam (D10 — a tabela já os mostra como
  // "Sem estoque registrado"; o cartão dizia 0).
  const { baixo: abaixoMinimo, semEstoque } = contarSituacoes(products.map(p => ({
    saldos:  p.branches.map(b => ({ embalagens: b.currentStock, rendimento: b.currentRendimento, minimo: b.minStock })),
    medidas: { unit: p.unit, consumption_unit: p.consumptionUnit, units_per_package: p.unitsPerPackage },
  })))

  // Conta LOTES, não produtos — cinco lotes do mesmo produto vencendo são cinco
  // avisos. Lotes já vencidos entram no alerta em vez de sumirem dele. E diz
  // QUAIS produtos (J-45): o cartão só dava o número.
  const vencendo        = lotesVencendo(lotes, in30Days, fuso)
  const validadeProxima = vencendo.length
  const nomeDoProduto   = new Map(products.map(p => [p.id, p.name]))
  // A40 da 10ª: o cartão diz o lote e a data, não só o produto.
  const quaisVencem     = vencendo.map(l => loteNoCartao(nomeDoProduto.get(l.produtoId) ?? '', l)).filter(Boolean)
  // A36 da 10ª: o "Ver lotes esgotados" só onde há algum.
  const comLoteEsgotado = productIds.length > 0 ? await paresComLoteEsgotado(admin, [branchId]) : []

  // C63: com "Só a rede", quem tem unidade fixa não cadastra nem edita produto; e
  // C71: as categorias são da rede (a janela delas, só para quem é da rede).
  const recusaDoCadastro = recusaDoCatalogo(ctx, catalogo)
  const podeEditarProduto = !readOnly && !recusaDoCadastro
  const stockCategories = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* C26: todo saldo muda por um movimento — assinar o saldo e o cadastro
          recarregava a tela três vezes a cada entrada. */}
      <RealtimeRefresher tables={['stock_movements']} />

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
          {!readOnly && recusaDoCadastro && (
            <p data-catalogo-da-rede style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 4, maxWidth: 560 }}>
              {recusaDoCadastro}
            </p>
          )}
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', gap: 8 }}>
            {mexeNaConfigDaClinica(ctx) && <ProductCategoryModal categories={categories} />}
            {/* Sem produto, o "Novo produto" é o do vazio (A2): dois primários iguais na tela, não. */}
            {products.length > 0 && podeEditarProduto && (
              <StockProductModal
                fornecedores={fornecedores}
                categories={categories}
                // O estoque inicial entra NESTA unidade (D8 da 9ª: quem é da rede
                // ficava sem seletor e o estoque era recusado).
                branches={[{ id: branch.id as string, name: branch.name as string }]}
                trigger={
                  <button type="button" className="btn-primary">
                    <Package size={15} />
                    Novo produto
                  </button>
                }
              />
            )}
          </div>
        )}
      </div>

      {/* KPIs */}
      {(() => {
        const allKpis = [
          // D2 do levantamento: quem tem o Estoque em Ver vê o Valor e o Giro
          // nos DOIS portais (na rede já via); quem não deve ver custo não
          // recebe o módulo (princípio 1).
          ...([
            {
              label: 'VALOR EM ESTOQUE',
              value: fmtBRL(valorEstoque),
              icon:  <ShoppingCart size={18} style={{ color: 'var(--on-brand)' }} />,
              iconBg: 'rgba(255,255,255,0.2)', color: 'var(--on-brand)',
              labelColor: 'rgba(255,255,255,0.75)', brand: true,
            },
            {
              id:      'giro',
              detalhe: DETALHE_DO_GIRO as string | undefined,
              label: `GIRO — ${now.toLocaleDateString('pt-BR', { timeZone: fuso, month: 'short', year: '2-digit' }).toUpperCase()}`,
              value: fmtBRL(valorGiro),
              icon:  <ShoppingCart size={18} style={{ color: 'var(--brand)' }} />,
              iconBg: 'var(--brand-soft)', color: 'var(--text)',
              labelColor: 'var(--text-muted)', brand: false,
            },
          ]),
          {
            id:    'baixo',
            label: 'ESTOQUE BAIXO',
            detalhe: 'no mínimo ou abaixo',
            value: String(abaixoMinimo),
            icon:  <AlertTriangle size={18} style={{ color: abaixoMinimo > 0 ? 'var(--warning)' : 'var(--text-faint)' }} />,
            iconBg: abaixoMinimo > 0 ? 'var(--warning-soft)' : 'var(--bg-app)',
            color: abaixoMinimo > 0 ? 'var(--warning)' : 'var(--text)',
            labelColor: 'var(--text-muted)', brand: false,
          },
          {
            label: 'SEM ESTOQUE',
            // C23: o cartão diz o que conta, como o da rede (D19 da 8ª).
            detalhe: 'produtos sem saldo nesta unidade',
            value: String(semEstoque),
            icon:  <Package size={18} style={{ color: semEstoque > 0 ? 'var(--danger)' : 'var(--text-faint)' }} />,
            iconBg: semEstoque > 0 ? 'var(--danger-soft)' : 'var(--bg-app)',
            color: semEstoque > 0 ? 'var(--danger)' : 'var(--text)',
            labelColor: 'var(--text-muted)', brand: false,
          },
          {
            id:    'validade',
            label: 'VALIDADE EM 30 DIAS',
            detalhe: linhasDaValidade(quaisVencem),
            value: String(validadeProxima),
            icon:  <CalendarClock size={18} style={{ color: validadeProxima > 0 ? 'var(--warning)' : 'var(--text-faint)' }} />,
            iconBg: validadeProxima > 0 ? 'var(--warning-soft)' : 'var(--bg-app)',
            color: validadeProxima > 0 ? 'var(--warning)' : 'var(--text)',
            labelColor: 'var(--text-muted)', brand: false,
          },
        ]
        return <CartoesDoEstoque cartoes={allKpis as CartaoDoEstoque[]} />
      })()}

      <AdminStockView
        products={products.map(p => ({
          ...p,
          // O valor de cada linha vem do banco (saldo em consumo × custo de
          // consumo), não da tela — A39, 2026-10-27.
          valor:    valores.get(p.id) ?? 0,
          branches: p.branches.map(b => ({ ...b, valor: valores.get(`${p.id}:${b.branchId}`) ?? 0 })),
          lotes:    lotes.filter(l => l.produtoId === p.id),
        }))}
        branches={branchData}
        unidadesDaRede={unidadesDaRede}
        categories={stockCategories}
        productCategories={categories as { id: string; name: string }[]}
        fornecedores={fornecedores}
        defaultBranchId={branchId}
        readOnly={readOnly}
        podeEditarProduto={podeEditarProduto}
        podeVerAplicacoes={can(ctx, 'clients', 'VIEW')}
        comLoteEsgotado={comLoteEsgotado}
        loteInicial={await loteDaUrl(ctx.tenantId!, (await searchParams).lote)}
        buscaInicial={busca}
      />
    </div>
  )
}
