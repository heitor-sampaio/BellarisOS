import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { loteDaUrl } from '@/lib/estoque/lote-da-url'
import { AdminStockView } from '@/components/admin/admin-stock-view'
import { StockProductModal } from '@/components/branch/stock-product-modal'
import { Package, AlertTriangle, ShoppingCart, CalendarClock } from 'lucide-react'
import { startOfMonthTZ, endOfMonthTZ, addDaysTZ } from '@/lib/datetime'
import { getGiroDeEstoque } from '@/lib/metrics/demografia'
import { getValorEmEstoque, getValorEmEstoquePorProduto } from '@/lib/metrics/unidade'
import { termoDaUrl } from '@/lib/texto'
import { fusoDoRecorte } from '@/lib/unidades/fuso-da-unidade'
import { umaUnidadeSo } from '@/lib/unidades/uma-so'
import { unidadesParaLer, nomeNaTela } from '@/lib/unidades/da-tela'
import { SeloUnidadeDesativada } from '@/components/shared/selo-unidade-desativada'
import { lotesComSaldo, lotesVencendo, paresComLoteEsgotado, type LoteDoProduto } from '@/lib/estoque/lotes'
import { CartoesDoEstoque, linhasDaValidade, loteNoCartao, type CartaoDoEstoque } from '@/components/shared/cartoes-do-estoque'
import { contarSituacoes, DETALHE_DO_GIRO } from '@/lib/estoque/situacao'
import { produtosDoEstoque, listasDoEstoque, marcasEFornecedoresDosProdutos, type ProdutoDoEstoque } from '@/lib/estoque/produtos-da-tela'
import { catalogoDaRede } from '@/lib/estoque/catalogo'
import { CadastroDoEstoque } from '@/components/admin/cadastro-do-estoque'
import { CatalogoDeProdutosLinha } from '@/components/admin/catalogo-de-produtos'

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function AdminEstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ unidade?: string; q?: string | string[]; lote?: string | string[] }>
}) {
  const { unidade: unidadeParam, q } = await searchParams
  // `?q=` abre a lista filtrada (a busca universal entra por aqui).
  const busca = termoDaUrl(q)
  const ctx = await getTenantContext()
  assertPermission(ctx, 'stock', 'VIEW')
  const canEdit = ctx.permissions.stock === 'MANAGE'

  const admin = createAdminClient()

  // Primeira rodada: produtos com estoque, filiais e categorias.
  //
  // O erro do embed aninhado (`products → branch_product_stock → branches`) era
  // descartado: qualquer recusa do PostgREST deixava o estoque da rede inteiro
  // em branco, sem mensagem nenhuma.
  // C26: os produtos em páginas; D1: o desativado com saldo continua (lib/estoque/produtos-da-tela).
  // F72 (D1 da 14ª; H6): as unidades de LEITURA — a desativada com saldo (ou
  // com o que ficou nela) entra no total, nas linhas e no `?unidade=`, com o
  // selo. Fechada a Pampulha, o total caía R$ 894,80 sem nada ter saído.
  const [raw, listas, marcasEFornecedores, catalogo, unidadesDeLeitura] = await Promise.all([
    produtosDoEstoque(ctx.tenantId!),
    // E1/E15: as três listas da rede (categorias, marcas, fornecedores) e, de cada produto, as das entradas.
    listasDoEstoque(ctx.tenantId!),
    marcasEFornecedoresDosProdutos(ctx.tenantId!),
    catalogoDaRede(admin, ctx.tenantId!),
    unidadesParaLer(ctx.tenantId!),
  ])

  const daLeitura = new Map(unidadesDeLeitura.map(u => [u.id, u]))
  // Normaliza produtos
  const products = (raw as ProdutoDoEstoque[]).map(p => {
    const bps = p.branch_product_stock ?? []

    // As linhas são as das unidades de LEITURA (F72): a desativada só com o que ficou nela, com o selo.
    const branchStocks = bps
      .flatMap(b => (b.branches && daLeitura.has(b.branches.id) ? [{ ...b, branches: b.branches }] : []))
      .map(b => ({
        branchId:          b.branches.id,
        branchName:        nomeNaTela(daLeitura.get(b.branches.id)!),
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
      id:               p.id,
      name:             p.name,
      sku:              p.sku,
      barcode:          p.barcode,
      category:         p.category,
      categoryId:       p.category_id,
      unit:             p.unit,
      // E15: as marcas e os fornecedores das entradas do produto (o filtro).
      marcaIds:         marcasEFornecedores[p.id]?.marcaIds ?? [],
      fornecedorIds:    marcasEFornecedores[p.id]?.fornecedorIds ?? [],
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

  const branches   = unidadesDeLeitura.map(b => ({ id: b.id, name: nomeNaTela(b), slug: b.slug, ativa: b.ativa }))
  // Para CRIAR (o produto novo com estoque inicial, a entrada): só as ativas.
  const ativas     = branches.filter(b => b.ativa)
  const desativadas = new Set(branches.filter(b => !b.ativa).map(b => b.id))
  const productIds = products.map(p => p.id)

  // `?unidade=` (id ou slug) recorta a tela para uma filial. Os KPIs seguem o
  // recorte: com a tabela filtrada em Centro e o topo somando a rede, os dois
  // blocos diriam números diferentes sobre a mesma tela.
  const unidade   = branches.find(b => b.id === unidadeParam || b.slug === unidadeParam) ?? null
  const unidadeId = unidade?.id ?? ''

  // Segunda rodada: movimentos e lotes (dependem dos product IDs)
  const now       = new Date()

  // Por `ler`: sem checar o erro, uma falha virava giro zero e nenhum lote
  // vencendo — os dois alertas quietos exatamente quando não deviam.
  // O recorte: a unidade escolhida, ou todas as unidades da rede.
  // C22 + F72: as unidades de LEITURA — as das linhas da tabela: a ativa e a
  // desativada que ainda tem saldo (H6; princípio 3: o total fecha com as linhas).
  const todasAsUnidades = branches.map(b => b.id)
  const unidadesDoRecorte = unidadeId ? [unidadeId] : todasAsUnidades
  // O mês do giro e o "em 30 dias" no fuso do recorte (F62b), como o dashboard.
  const fuso       = await fusoDoRecorte(ctx.tenantId, unidadeId ? [unidadeId] : null)
  const in30Days   = addDaysTZ(now, 30, fuso)
  const monthStart = startOfMonthTZ(now, fuso)

  // Valor em estoque e giro do mês somados no banco — a mesma conta da tela da
  // filial e do dashboard. Giro = consumo em procedimentos no mês (não qualquer
  // saída: transferência entre unidades não é consumo). Somar as linhas aqui
  // cortava em 1000 (§13.1). Fim do MÊS, não "agora" (relógio do Postgres).
  const [valorEstoque, valorGiro, lotes, valores] = productIds.length > 0
    ? await Promise.all([
        getValorEmEstoque(unidadesDoRecorte),
        getGiroDeEstoque({ branchIds: unidadesDoRecorte, from: monthStart, to: endOfMonthTZ(now, fuso) }),

        // Os lotes com saldo das unidades do recorte (J-45): a linha aberta
        // mostra número, validade e custo, e o cartão diz quais vencem.
        lotesComSaldo(admin, unidadesDoRecorte, products.map(p => ({ id: p.id, fator: p.consumptionUnit && p.unitsPerPackage ? p.unitsPerPackage : 1 }))),
        // O valor de cada linha: a consolidada soma as unidades da rede inteira.
        getValorEmEstoquePorProduto(todasAsUnidades),
      ])
    : [0, 0, [] as LoteDoProduto[], new Map<string, number>()]

  // -- KPIs ------------------------------------------------------------

  // Com uma unidade recortada, só o saldo dela conta — um produto zerado no
  // Centro e cheio no Jardins é problema de quem opera o Centro.
  const saldosVisiveis = (p: (typeof products)[number]) =>
    unidadeId ? p.branches.filter(b => b.branchId === unidadeId) : p.branches

  // No mínimo OU abaixo (o alerta de sempre), no rendimento — J-43. Sem
  // estoque é não ter saldo POSITIVO no recorte: o negativo e o produto sem
  // nenhuma linha de saldo contam (D10, lib/estoque/situacao.ts).
  const { baixo: abaixoMinimo, semEstoque } = contarSituacoes(products.map(p => ({
    saldos:  saldosVisiveis(p).map(b => ({ embalagens: b.currentStock, rendimento: b.currentRendimento, minimo: b.minStock })),
    medidas: { unit: p.unit, consumption_unit: p.consumptionUnit, units_per_package: p.unitsPerPackage },
  })))

  // Conta lotes, não produtos distintos — e diz QUAIS produtos (J-45).
  const vencendo        = lotesVencendo(lotes, in30Days, fuso)
  const validadeProxima = vencendo.length
  const nomeDoProduto   = new Map(products.map(p => [p.id, p.name]))
  // A40 da 10ª: o cartão diz o lote e a data, não só o produto.
  const quaisVencem     = vencendo.map(l => loteNoCartao(nomeDoProduto.get(l.produtoId) ?? '', l))
  // A36 da 10ª: o "Ver lotes esgotados" só onde há algum.
  const comLoteEsgotado = productIds.length > 0 ? await paresComLoteEsgotado(admin, unidadesDoRecorte) : []


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
              ? <>{daLeitura.get(unidade.id)?.name ?? unidade.name}{desativadas.has(unidade.id) && <> <SeloUnidadeDesativada /></>}</>
              // A clínica de uma unidade não fala "rede" (F8).
              : umaUnidadeSo(branches.length) ? 'Estoque da clínica'
              : `Visão consolidada da rede · ${branches.length} unidades`}
          </p>
          {/* C63 (H8): quem cadastra e edita os produtos — decisão da rede. */}
          {canEdit && <CatalogoDeProdutosLinha regra={catalogo} />}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* E1/E4/E5 (o Heitor, 13/11): Categorias, Marcas e Fornecedores — cadastros
              de texto livre, para quem tem o Estoque em Gerenciar (ser da rede deixou de contar). */}
          {canEdit && <CadastroDoEstoque lista="categorias" itens={listas.categorias} />}
          {canEdit && <CadastroDoEstoque lista="marcas" itens={listas.marcas} />}
          {canEdit && <CadastroDoEstoque lista="fornecedores" itens={listas.fornecedores} />}
          {/* Sem produto, o "Novo produto" é o do vazio (A2): dois primários iguais na tela, não. */}
          {canEdit && products.length > 0 && (
            <StockProductModal
              categories={listas.categorias}
              marcas={listas.marcas}
              fornecedores={listas.fornecedores}
              branches={ativas}
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
      <CartoesDoEstoque cartoes={[
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
            id:      'giro',
            detalhe: DETALHE_DO_GIRO as string | undefined,
            label:   'GIRO MENSAL',
            value:   fmtBRL(valorGiro),
            icon:    <ShoppingCart size={18} style={{ color: 'var(--brand)' }} />,
            iconBg:  'var(--brand-soft)',
            color:   'var(--text)',
            labelColor: 'var(--text-muted)',
            brand:   false,
          },
          {
            id:      'baixo',
            label:   'ESTOQUE BAIXO',
            detalhe: 'no mínimo ou abaixo' as string | undefined,
            value:   String(abaixoMinimo),
            icon:    <AlertTriangle size={18} style={{ color: abaixoMinimo > 0 ? 'var(--warning)' : 'var(--text-faint)' }} />,
            iconBg:  abaixoMinimo > 0 ? 'var(--warning-soft)' : 'var(--bg-app)',
            color:   abaixoMinimo > 0 ? 'var(--warning)' : 'var(--text)',
            labelColor: 'var(--text-muted)',
            brand:   false,
          },
          {
            label:   'SEM ESTOQUE',
            // D19 da 8ª: a tela diz o que conta — os PRODUTOS sem saldo positivo no recorte.
            detalhe: (unidadeId ? 'produtos sem saldo nesta unidade'
              : umaUnidadeSo(branches.length) ? 'produtos sem saldo'
              : 'produtos sem saldo em nenhuma unidade') as string | undefined,
            value:   String(semEstoque),
            icon:    <Package size={18} style={{ color: semEstoque > 0 ? 'var(--danger)' : 'var(--text-faint)' }} />,
            iconBg:  semEstoque > 0 ? 'var(--danger-soft)' : 'var(--bg-app)',
            color:   semEstoque > 0 ? 'var(--danger)' : 'var(--text)',
            labelColor: 'var(--text-muted)',
            brand:   false,
          },
          {
            id:      'validade',
            label:   'VALIDADE EM 30 DIAS',
            detalhe: linhasDaValidade(quaisVencem),
            value:   String(validadeProxima),
            icon:    <CalendarClock size={18} style={{ color: validadeProxima > 0 ? 'var(--warning)' : 'var(--text-faint)' }} />,
            iconBg:  validadeProxima > 0 ? 'var(--warning-soft)' : 'var(--bg-app)',
            color:   validadeProxima > 0 ? 'var(--warning)' : 'var(--text)',
            labelColor: 'var(--text-muted)',
            brand:   false,
          },
        ] as CartaoDoEstoque[]} />

      <AdminStockView
        products={products.map(p => ({
          ...p,
          // O valor de cada linha vem do banco (saldo em consumo × custo de
          // consumo), não da tela — A39, 2026-10-27.
          valor:    valores.get(p.id) ?? 0,
          branches: p.branches.map(b => ({ ...b, valor: valores.get(`${p.id}:${b.branchId}`) ?? 0 })),
          lotes:    lotes.filter(l => l.produtoId === p.id),
        }))}
        branches={branches}
        productCategories={listas.categorias}
        marcas={listas.marcas}
        fornecedores={listas.fornecedores}
        unidadeInicial={unidadeId}
        readOnly={!canEdit}
        podeVerAplicacoes={can(ctx, 'clients', 'VIEW')}
        comLoteEsgotado={comLoteEsgotado}
        loteInicial={await loteDaUrl(ctx.tenantId!, (await searchParams).lote)}
        buscaInicial={busca}
      />
    </div>
  )
}
