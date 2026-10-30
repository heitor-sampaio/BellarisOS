'use client'

import { Fragment, useState, useMemo, useRef, useEffect } from 'react'
import { Search, X, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, PackageX, Settings, Barcode, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { AdminStockManageModal } from './admin-stock-manage-modal'
import { BarcodeEntryModal } from './barcode-entry-modal'
import { contemSemAcento } from '@/lib/texto'
import { StockProductModal } from '../branch/stock-product-modal'
import type { StockProduct, ProductCategory, StockProductModalHandle } from '../branch/stock-product-modal'
import { SegSelect } from '@/components/shared/seg-select'
import {
  situacaoDoEstoque, saldoParaMostrar, minimoParaMostrar, emEmbalagens, estoqueBaixo,
  formatarQuantidadeComUnidade, ROTULO_DA_SITUACAO,
  type MedidasDoProduto, type SituacaoDoEstoque,
} from '@/lib/estoque/situacao'

/** Um lote com saldo (J-45): número, validade, o que sobra e o custo da embalagem. */
export type LoteNaTela = {
  id:                string
  unidadeId:         string
  numero:            string | null
  validade:          string | null
  quantidade:        number
  custoPorEmbalagem: number | null
}

type BranchStock = {
  branchId:          string
  branchName:        string
  branchSlug:        string
  currentStock:      number
  minStock:          number
  currentRendimento: number | null
  /** Saldo em consumo × custo de consumo, do banco (metrics_valor_em_estoque_por_produto). */
  valor:             number
}

type ProductStock = {
  id:               string
  name:             string
  sku:              string | null
  barcode:          string | null
  category:         string | null
  categoryId:       string | null
  unit:             string
  supplier:         string | null
  costPrice:        number
  salePrice:        number | null
  /** O uso do produto (D-6): INSUMO, REVENDA ou AMBOS. */
  uso?:             string | null
  consumptionUnit:  string | null
  unitsPerPackage:  number | null
  totalStock:       number
  totalRendimento:  number | null  // soma de current_rendimento das filiais; null se produto sem consumptionUnit
  /** O valor do produto nas unidades da linha, do banco (saldo em consumo × custo de consumo). */
  valor:            number
  branches:         BranchStock[]
  /** Os lotes com saldo do produto nas unidades da tela. */
  lotes?:           LoteNaTela[]
}

type Branch = { id: string; name: string; slug: string }

const medidas = (p: ProductStock): MedidasDoProduto =>
  ({ unit: p.unit, consumption_unit: p.consumptionUnit, units_per_package: p.unitsPerPackage })
const saldoDe = (b: BranchStock) => ({ embalagens: b.currentStock, rendimento: b.currentRendimento, minimo: b.minStock })
const situacaoDe = (p: ProductStock, b: BranchStock) => situacaoDoEstoque(saldoDe(b), medidas(p))
const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const fmtBRLv = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** O uso na linha do produto (D-6): "Insumo", "Revenda" ou "Insumo e revenda". */
const rotuloDoUso = (uso: string | null | undefined) =>
  uso === 'REVENDA' ? 'Revenda' : uso === 'AMBOS' ? 'Insumo e revenda' : 'Insumo'

interface Props {
  products:          ProductStock[]
  branches:          Branch[]
  categories:        string[]
  productCategories?: ProductCategory[]
  suppliers?:        string[]
  defaultBranchId?:  string
  /**
   * Unidade já selecionada ao abrir (`?unidade=` na URL).
   *
   * É o destino do "ver o estoque desta unidade" no dashboard da rede, que
   * antes mandava a pessoa para o portal da filial.
   */
  unidadeInicial?:   string
  /**
   * Todas as unidades da rede — só para as operações que envolvem outra
   * unidade (transferir). `branches` continua sendo o recorte VISÍVEL: a filial
   * não passa a ver o estoque das outras, só ganha para onde transferir.
   */
  unidadesDaRede?:   Branch[]
  /** O `?q=` da URL — a busca universal abre a tela já filtrada. */
  buscaInicial?:     string
  readOnly?:         boolean
}

type ViewMode  = 'consolidado' | 'por-unidade'
type StatusFilter = 'all' | 'ok' | 'baixo' | 'zero'

/** As cores de cada situação: zerado é perigo, no mínimo e abaixo são alerta. */
function coresDa(sit: SituacaoDoEstoque) {
  if (sit === 'SEM_ESTOQUE') return { bg: 'var(--danger-soft)', color: 'var(--danger)' }
  if (estoqueBaixo(sit))     return { bg: 'var(--warning-soft)', color: 'var(--warning)' }
  return { bg: 'var(--success-bg)', color: 'var(--success)' }
}

/** O selo da situação: "Abaixo do mínimo", "No mínimo" (igual não é abaixo — J-43), "OK", "Sem estoque". */
function StockBadge({ situacao }: { situacao: SituacaoDoEstoque }) {
  const { bg, color } = coresDa(situacao)
  const icon  = situacao === 'SEM_ESTOQUE'
    ? <PackageX   size={10} />
    : estoqueBaixo(situacao)
    ? <AlertTriangle size={10} />
    : <CheckCircle2  size={10} />

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 'var(--text-xs-sz)', fontWeight: 800, padding: '3px 8px', borderRadius: 99,
      background: bg, color, whiteSpace: 'nowrap',
    }}>
      {icon}
      {ROTULO_DA_SITUACAO[situacao]}
    </span>
  )
}

/** O saldo na unidade de consumo e, embaixo, a equivalência exata em embalagens (J-43). */
function Saldo({ produto, quantidade, forte = true }: { produto: ProductStock; quantidade: { quantidade: number; unidade: string }; forte?: boolean }) {
  const emb = produto.consumptionUnit && produto.unitsPerPackage ? emEmbalagens(quantidade.quantidade, medidas(produto)) : null
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
      <span style={{ fontSize: forte ? 'var(--text-base-sz)' : 'var(--text-sm-sz)', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
        {formatarQuantidadeComUnidade(quantidade)}
      </span>
      {emb && (
        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 600, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
          {formatarQuantidadeComUnidade(emb)}
        </span>
      )}
    </span>
  )
}

function BranchPills({ branches, produto }: { branches: BranchStock[]; produto: ProductStock }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {branches.map(b => {
        const { bg, color } = coresDa(situacaoDe(produto, b))
        const saldo = formatarQuantidadeComUnidade(saldoParaMostrar(saldoDe(b), medidas(produto)))
        return (
          // O nome INTEIRO da unidade (D15, 2026-10-28): a primeira palavra dava
          // "Íris · 3" para o Centro e para o Kobrasol. Se não couber, o CSS
          // trunca com reticências e o title diz tudo.
          <span key={b.branchId} title={`${b.branchName} · ${saldo}`} style={{
            fontSize: 'var(--text-overline)', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: bg, color, whiteSpace: 'nowrap',
            display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom',
          }}>
            {b.branchName} · {saldo}
          </span>
        )
      })}
      {branches.length === 0 && (
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>Sem estoque registrado</span>
      )}
    </div>
  )
}

function IconButton({ onClick, title, children }: { onClick: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(e) }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 7, cursor: 'pointer',
        border: '1px solid var(--border)', background: 'var(--bg-app)',
        color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 100ms',
      }}
    >
      {children}
    </button>
  )
}
function GearButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return <IconButton onClick={onClick} title="Gerenciar estoque"><Settings size={13} /></IconButton>
}
function PencilButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return <IconButton onClick={onClick} title="Editar produto"><Pencil size={12} /></IconButton>
}

export function AdminStockView({ products, branches, categories, productCategories, suppliers, defaultBranchId, unidadeInicial = '', unidadesDaRede, readOnly = false, buscaInicial = '' }: Props) {
  const router = useRouter()
  // Chegar com uma unidade na URL só faz sentido junto com a visão por unidade:
  // no consolidado o saldo dela ficaria somado ao das outras.
  const [view,       setView]       = useState<ViewMode>(unidadeInicial ? 'por-unidade' : 'consolidado')
  const [search,     setSearch]     = useState(buscaInicial)
  // A busca universal pode trocar o `?q=` com a tela aberta.
  const [buscaVista, setBuscaVista] = useState(buscaInicial)
  if (buscaInicial !== buscaVista) {
    setBuscaVista(buscaInicial)
    setSearch(buscaInicial)
  }
  const [category,   setCategory]   = useState('')
  const [branchId,   setBranchId]   = useState(unidadeInicial)
  const [status,     setStatus]     = useState<StatusFilter>('all')
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set())
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('asc')
  const [managing,   setManaging]   = useState<ProductStock | null>(null)
  const [editing,    setEditing]    = useState<ProductStock | null>(null)
  const [scanning,   setScanning]   = useState(false)
  const editModalRef = useRef<StockProductModalHandle>(null)
  // Lido uma vez (o lote vencido se marca em vermelho; Date.now não roda no render).
  const [agora] = useState(() => Date.now())
  // Rede de verdade só com mais de uma unidade na tela (J-44): no portal da
  // unidade, "TOTAL REDE" e "ESTOQUE POR FILIAL" eram a mesma unidade.
  const variasUnidades = branches.length > 1

  useEffect(() => {
    if (editing) editModalRef.current?.open()
  }, [editing])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  const filtered = useMemo(() => {
    return products
      .filter(p => {
        // Sem acento e também pelo código de barras: é o que a busca universal acha.
        if (!contemSemAcento([p.name, p.sku, p.barcode], search)) return false
        if (category && p.category !== category) return false

        // filtro por filial (só relevante na view por-unidade, mas aplica em ambas)
        if (branchId) {
          if (!p.branches.some(b => b.branchId === branchId)) return false
        }

        // filtro por status (baseado em qualquer filial)
        if (status !== 'all') {
          const stocksToCheck = branchId
            ? p.branches.filter(b => b.branchId === branchId)
            : p.branches

          const situacoes = stocksToCheck.map(b => situacaoDe(p, b))
          if (status === 'zero'  && !situacoes.includes('SEM_ESTOQUE')) return false
          if (status === 'baixo' && !situacoes.some(estoqueBaixo))       return false
          if (status === 'ok'    && !situacoes.includes('OK'))          return false
        }

        return true
      })
      .sort((a, b) => {
        const cmp = a.name.localeCompare(b.name, 'pt-BR')
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [products, search, category, branchId, status, sortDir])

  // Para "por unidade": expande em linhas produto × filial
  const rowsByUnit = useMemo(() => {
    const rows: (ProductStock & { branch: BranchStock })[] = []
    for (const p of filtered) {
      const bList = branchId ? p.branches.filter(b => b.branchId === branchId) : p.branches
      for (const b of bList) rows.push({ ...p, branch: b })
    }
    return rows
  }, [filtered, branchId])

  const thStyle: React.CSSProperties = {
    fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)',
    letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'left',
    background: 'var(--bg-app)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Filtros */}
      <div className="filtros-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Consolidado / Por unidade — duas opções fixas que trocam a visão:
            segmento. Era o SegSelect reimplementado à mão, com raio e altura
            próprios. */}
        {variasUnidades && (
        <SegSelect
          ariaLabel="Como ver o estoque"
          value={view}
          onSelect={v => setView(v as ViewMode)}
          options={[
            { key: 'consolidado', label: 'Consolidado' },
            { key: 'por-unidade', label: 'Por unidade' },
          ]}
        />
        )}

        {/* Busca */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          border: '1px solid var(--border)', borderRadius: 10,
          background: 'var(--surface)', padding: '7px 12px', flex: 1, minWidth: 200,
        }}>
          <Search size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto ou SKU…"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--text-base-sz)', color: 'var(--text)', width: '100%' }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Categoria */}
        {categories.length > 0 && (
          <select className="filtro-select" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {/* Filial */}
        {branches.length > 1 && (
          <select className="filtro-select" value={branchId} onChange={e => setBranchId(e.target.value)}>
            <option value="">Todas as filiais</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}

        {/* Status */}
        <select className="filtro-select" value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
          <option value="all">Todos os status</option>
          <option value="ok">OK</option>
          <option value="baixo">No mínimo ou abaixo</option>
          <option value="zero">Sem estoque</option>
        </select>

        {/* Ordenação */}
        <button
          type="button" className="filtro-toggle"
          onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
        >
          {sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          A–Z
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', fontWeight: 600 }}>
          {view === 'consolidado' ? filtered.length : rowsByUnit.length} resultado{(view === 'consolidado' ? filtered.length : rowsByUnit.length) !== 1 ? 's' : ''}
        </span>

        {/* Botão scanner */}
        {!readOnly && (
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="btn-secondary"
            style={{ gap: 6, flexShrink: 0 }}
          >
            <Barcode size={14} /> Escanear entrada
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {(view === 'consolidado' ? filtered.length : rowsByUnit.length) === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <PackageX size={36} style={{ color: 'var(--text-faint)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 'var(--text-base-sz)' }}>Nenhum produto encontrado</p>
            <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>Ajuste os filtros.</p>
          </div>
        ) : view === 'consolidado' ? (
          /* -- VISTA CONSOLIDADA ------------------ */
          <div style={{ overflowX: 'auto' }}>
            {/* Sete a nove colunas nao cabem em 390px: no celular cada produto
                vira um bloco de rotulo e valor. */}
            <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>PRODUTO</th>
                  <th style={thStyle}>CATEGORIA</th>
                  {/* "TOTAL REDE" só quando há rede para somar (J-44): no portal
                      da unidade a coluna somava só a unidade. */}
                  <th style={thStyle}>{variasUnidades ? 'TOTAL REDE' : 'ESTOQUE'}</th>
                  {variasUnidades && <th style={thStyle}>ESTOQUE POR FILIAL</th>}
                  {!readOnly && <th style={{ ...thStyle, textAlign: 'right' }}>VALOR EM ESTOQUE</th>}
                  {!readOnly && <th style={{ ...thStyle, width: 68 }} />}
                  <th style={{ ...thStyle, width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const isExpanded = expanded.has(p.id)
                  const situacoes   = p.branches.map(b => situacaoDe(p, b))
                  const totalAbaixo = situacoes.filter(s => s === 'ABAIXO').length
                  const totalNoMin  = situacoes.filter(s => s === 'NO_MINIMO').length
                  const totalZero   = situacoes.filter(s => s === 'SEM_ESTOQUE').length
                  // O total na unidade de consumo (o rendimento), não em embalagens arredondadas (J-43).
                  const total = p.consumptionUnit && p.totalRendimento != null
                    ? { quantidade: p.totalRendimento, unidade: p.consumptionUnit }
                    : { quantidade: p.totalStock, unidade: p.unit }

                  return (
                    <Fragment key={p.id}>
                      <tr
                        style={{
                          borderBottom: isExpanded ? 'none' : (i < filtered.length - 1 ? '1px solid var(--hairline)' : 'none'),
                          background: i % 2 === 0 ? 'var(--surface)' : 'transparent',
                          cursor: p.branches.length > 0 ? 'pointer' : 'default',
                        }}
                        onClick={() => p.branches.length > 0 && toggleExpand(p.id)}
                      >
                        <td data-label="" style={{ padding: '13px 16px' }}>
                          <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{p.name}</p>
                          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 1 }}>
                            {[p.sku, rotuloDoUso(p.uso)].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td data-label="Categoria" data-par style={{ padding: '13px 16px' }}>
                          <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {p.category ?? '—'}
                          </span>
                        </td>
                        <td data-label={variasUnidades ? 'Total rede' : 'Estoque'} data-par style={{ padding: '13px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Saldo produto={p} quantidade={total} />
                            {totalZero > 0 && (
                              <span style={{
                                fontSize: 'var(--text-overline)', fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                                background: 'var(--danger-soft)', color: 'var(--danger)',
                              }}>
                                {variasUnidades ? `${totalZero} sem estoque` : 'Sem estoque'}
                              </span>
                            )}
                            {totalZero === 0 && totalAbaixo > 0 && (
                              <span style={{
                                fontSize: 'var(--text-overline)', fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                                background: 'var(--warning-soft)', color: 'var(--warning)',
                              }}>
                                {variasUnidades ? `${totalAbaixo} abaixo do mín.` : 'Abaixo do mín.'}
                              </span>
                            )}
                            {totalZero === 0 && totalAbaixo === 0 && totalNoMin > 0 && (
                              <span style={{
                                fontSize: 'var(--text-overline)', fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                                background: 'var(--warning-soft)', color: 'var(--warning)',
                              }}>
                                {variasUnidades ? `${totalNoMin} no mínimo` : 'No mínimo'}
                              </span>
                            )}
                          </div>
                        </td>
                        {variasUnidades && (
                          <td data-label="Por filial" style={{ padding: '13px 16px' }}>
                            <BranchPills branches={p.branches} produto={p} />
                          </td>
                        )}
                        {!readOnly && (
                          <td data-label="Valor" data-par style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {p.costPrice > 0
                              ? (
                                <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                                  {p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                              ) : (
                                <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>—</span>
                              )
                            }
                          </td>
                        )}
                        {!readOnly && (
                          <td data-label="" style={{ padding: '13px 10px' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <PencilButton onClick={() => setEditing(p)} />
                              <GearButton   onClick={() => setManaging(p)} />
                            </div>
                          </td>
                        )}
                        <td data-label="" style={{ padding: '13px 16px', textAlign: 'center' }}>
                          {p.branches.length > 0 && (
                            isExpanded
                              ? <ChevronUp   size={14} style={{ color: 'var(--text-faint)' }} />
                              : <ChevronDown size={14} style={{ color: 'var(--text-faint)' }} />
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                          <td data-label="" colSpan={(variasUnidades ? 4 : 3) + (readOnly ? 0 : 2) + 1} style={{ padding: '0 16px 14px 40px', background: 'var(--bg-app)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {p.branches.map(b => {
                                const lotes = (p.lotes ?? []).filter(l => l.unidadeId === b.branchId)
                                return (
                                <div key={b.branchId} style={{
                                  display: 'flex', flexDirection: 'column', gap: 6,
                                  padding: '8px 12px', borderRadius: 8,
                                  background: 'var(--surface)', border: '1px solid var(--hairline)',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
                                      {b.branchName}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                                      <Saldo produto={p} quantidade={saldoParaMostrar(saldoDe(b), medidas(p))} forte={false} />
                                      {b.minStock > 0 && (
                                        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                                          mín. {formatarQuantidadeComUnidade(minimoParaMostrar(saldoDe(b), medidas(p)))}
                                        </span>
                                      )}
                                      <StockBadge situacao={situacaoDe(p, b)} />
                                    </div>
                                  </div>
                                  {/* Os lotes desta unidade (J-45): número, validade, o que sobra e o custo da embalagem. */}
                                  {lotes.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid var(--hairline)', paddingTop: 6 }}>
                                      {lotes.map(l => {
                                        const vencido = l.validade ? new Date(l.validade).getTime() < agora : false
                                        return (
                                          <p key={l.id} data-lotes-do-produto style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                            <strong style={{ color: 'var(--text)' }}>{l.numero ? `Lote ${l.numero}` : 'Lote sem número'}</strong>
                                            <span style={{ color: vencido ? 'var(--danger)' : undefined }}>
                                              {l.validade ? `${vencido ? 'venceu' : 'vence'} ${fmtData(l.validade)}` : 'sem validade'}
                                            </span>
                                            <span>{l.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {p.unit}</span>
                                            <span>{l.custoPorEmbalagem != null ? `custo ${fmtBRLv(l.custoPorEmbalagem)}/${p.unit}` : 'custo —'}</span>
                                          </p>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* -- VISTA POR UNIDADE ------------------ */
          <div style={{ overflowX: 'auto' }}>
            {/* Sete a nove colunas nao cabem em 390px: no celular cada produto
                vira um bloco de rotulo e valor. */}
            <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>PRODUTO</th>
                  <th style={thStyle}>CATEGORIA</th>
                  <th style={thStyle}>FILIAL</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>ESTOQUE</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>MÍNIMO</th>
                  {!readOnly && <th style={{ ...thStyle, textAlign: 'right' }}>VALOR</th>}
                  <th style={thStyle}>STATUS</th>
                  {!readOnly && <th style={{ ...thStyle, width: 68 }} />}
                </tr>
              </thead>
              <tbody>
                {rowsByUnit.map((row, i) => {
                  const situacao = situacaoDe(row, row.branch)

                  return (
                    <tr key={`${row.id}-${row.branch.branchId}`} style={{
                      borderBottom: i < rowsByUnit.length - 1 ? '1px solid var(--hairline)' : 'none',
                      background: i % 2 === 0 ? 'var(--surface)' : 'transparent',
                    }}>
                      <td data-label="" style={{ padding: '12px 16px' }}>
                        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{row.name}</p>
                        {row.sku && <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 1 }}>{row.sku}</p>}
                      </td>
                      <td data-label="Categoria" data-par style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{row.category ?? '—'}</span>
                      </td>
                      <td data-label="Filial" data-par style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                          background: 'var(--bg-app)', color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                        }}>
                          {row.branch.branchName}
                        </span>
                      </td>
                      <td data-label="Estoque" data-par style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <Saldo produto={row} quantidade={saldoParaMostrar(saldoDe(row.branch), medidas(row))} />
                      </td>
                      <td data-label="Mínimo" data-par style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
                          {row.branch.minStock > 0 ? formatarQuantidadeComUnidade(minimoParaMostrar(saldoDe(row.branch), medidas(row))) : '—'}
                        </span>
                      </td>
                      {!readOnly && (
                        <td data-label="Valor" data-par style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {row.costPrice > 0
                            ? (
                              <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                                {row.branch.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            ) : (
                              <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>—</span>
                            )
                          }
                        </td>
                      )}
                      <td data-label="Status" data-par style={{ padding: '12px 16px' }}>
                        <StockBadge situacao={situacao} />
                      </td>
                      {!readOnly && (
                        <td data-label="" style={{ padding: '12px 10px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <PencilButton onClick={() => setEditing(row)} />
                            <GearButton   onClick={() => setManaging(row)} />
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {managing && (
        <AdminStockManageModal
          product={managing}
          allBranches={unidadesDaRede && unidadesDaRede.length > 0 ? unidadesDaRede : branches}
          defaultBranchId={defaultBranchId}
          onClose={() => setManaging(null)}
          onSuccess={() => { setManaging(null); router.refresh() }}
        />
      )}

      {editing && (
        <StockProductModal
          ref={editModalRef}
          product={{
            id:                editing.id,
            name:              editing.name,
            sku:               editing.sku,
            barcode:           editing.barcode,
            category:          editing.category,
            category_id:       editing.categoryId,
            unit:              editing.unit,
            supplier:          editing.supplier,
            cost_price:        editing.costPrice,
            sale_price:        editing.salePrice,
            uso:               editing.uso ?? null,
            consumption_unit:  editing.consumptionUnit,
            units_per_package: editing.unitsPerPackage,
            min_stock:         null,
          } satisfies StockProduct}
          suppliers={suppliers ?? []}
          categories={productCategories ?? []}
          onSuccess={() => { setEditing(null); router.refresh() }}
        />
      )}

      {scanning && (
        <BarcodeEntryModal
          allBranches={branches}
          defaultBranchId={defaultBranchId}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  )
}
