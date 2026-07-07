'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, X, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, PackageX, Settings, Barcode, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { AdminStockManageModal } from './admin-stock-manage-modal'
import { BarcodeEntryModal } from './barcode-entry-modal'
import { StockProductModal } from '../branch/stock-product-modal'
import type { StockProduct, ProductCategory, StockProductModalHandle } from '../branch/stock-product-modal'

type BranchStock = {
  branchId:          string
  branchName:        string
  branchSlug:        string
  currentStock:      number
  minStock:          number
  currentRendimento: number | null
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
  consumptionUnit:  string | null
  unitsPerPackage:  number | null
  totalStock:       number
  totalRendimento:  number | null  // soma de current_rendimento das filiais; null se produto sem consumptionUnit
  branches:         BranchStock[]
}

type Branch = { id: string; name: string; slug: string }

interface Props {
  products:          ProductStock[]
  branches:          Branch[]
  categories:        string[]
  productCategories?: ProductCategory[]
  suppliers?:        string[]
  defaultBranchId?:  string
  readOnly?:         boolean
}

type ViewMode  = 'consolidado' | 'por-unidade'
type StatusFilter = 'all' | 'ok' | 'baixo' | 'zero'

function StockBadge({ current, min, unit }: { current: number; min: number; unit: string }) {
  const isZero  = current === 0
  const isBaixo = !isZero && min > 0 && current <= min

  const bg    = isZero ? '#fef2f2' : isBaixo ? '#fffbeb' : '#f0fdf4'
  const color = isZero ? '#dc2626' : isBaixo ? '#d97706' : '#16a34a'
  const icon  = isZero
    ? <PackageX   size={10} />
    : isBaixo
    ? <AlertTriangle size={10} />
    : <CheckCircle2  size={10} />

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11.5, fontWeight: 800, padding: '3px 8px', borderRadius: 99,
      background: bg, color,
    }}>
      {icon}
      {current.toLocaleString('pt-BR')} {unit}
    </span>
  )
}

function BranchPills({ branches, unit }: { branches: BranchStock[]; unit: string }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {branches.map(b => {
        const isZero  = b.currentStock === 0
        const isBaixo = !isZero && b.minStock > 0 && b.currentStock <= b.minStock
        const color   = isZero ? '#dc2626' : isBaixo ? '#d97706' : '#16a34a'
        const bg      = isZero ? '#fef2f2' : isBaixo ? '#fffbeb' : '#f0fdf4'
        return (
          <span key={b.branchId} title={b.branchName} style={{
            fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: bg, color, whiteSpace: 'nowrap',
          }}>
            {b.branchName.split(' ')[0]} · {b.currentStock.toLocaleString('pt-BR')} {unit}
          </span>
        )
      })}
      {branches.length === 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Sem estoque registrado</span>
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

export function AdminStockView({ products, branches, categories, productCategories, suppliers, defaultBranchId, readOnly = false }: Props) {
  const router = useRouter()
  const [view,       setView]       = useState<ViewMode>('consolidado')
  const [search,     setSearch]     = useState('')
  const [category,   setCategory]   = useState('')
  const [branchId,   setBranchId]   = useState('')
  const [status,     setStatus]     = useState<StatusFilter>('all')
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set())
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('asc')
  const [managing,   setManaging]   = useState<ProductStock | null>(null)
  const [editing,    setEditing]    = useState<ProductStock | null>(null)
  const [scanning,   setScanning]   = useState(false)
  const editModalRef = useRef<StockProductModalHandle>(null)

  useEffect(() => {
    if (editing) editModalRef.current?.open()
  }, [editing])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()

    return products
      .filter(p => {
        if (q && !p.name.toLowerCase().includes(q) && !(p.sku ?? '').toLowerCase().includes(q)) return false
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

          if (status === 'zero'  && !stocksToCheck.some(b => b.currentStock === 0))   return false
          if (status === 'baixo' && !stocksToCheck.some(b => b.minStock > 0 && b.currentStock > 0 && b.currentStock <= b.minStock)) return false
          if (status === 'ok'    && !stocksToCheck.some(b => b.currentStock > 0 && (b.minStock === 0 || b.currentStock > b.minStock))) return false
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
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'left',
    background: 'var(--bg-app)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Toggle Consolidado / Por unidade */}
        <div style={{
          display: 'flex', background: 'var(--bg-app)', padding: 4,
          borderRadius: 10, border: '1px solid var(--border)', flexShrink: 0,
        }}>
          {([['consolidado', 'Consolidado'], ['por-unidade', 'Por unidade']] as [ViewMode, string][]).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setView(v)} style={{
              fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 7,
              cursor: 'pointer', border: 'none', transition: 'all 100ms',
              background: view === v ? 'var(--surface)' : 'transparent',
              color: view === v ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
              {l}
            </button>
          ))}
        </div>

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
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', width: '100%' }}
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
          <select value={category} onChange={e => setCategory(e.target.value)} style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '7px 10px', cursor: 'pointer', outline: 'none',
          }}>
            <option value="">Todas as categorias</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {/* Filial */}
        {branches.length > 1 && (
          <select value={branchId} onChange={e => setBranchId(e.target.value)} style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '7px 10px', cursor: 'pointer', outline: 'none',
          }}>
            <option value="">Todas as filiais</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}

        {/* Status */}
        <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)} style={{
          fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '7px 10px', cursor: 'pointer', outline: 'none',
        }}>
          <option value="all">Todos os status</option>
          <option value="ok">OK</option>
          <option value="baixo">Abaixo do mínimo</option>
          <option value="zero">Sem estoque</option>
        </select>

        {/* Ordenação */}
        <button type="button" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          {sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          A–Z
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>
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
            <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 14 }}>Nenhum produto encontrado</p>
            <p style={{ color: 'var(--text-faint)', fontSize: 12.5, marginTop: 4 }}>Ajuste os filtros.</p>
          </div>
        ) : view === 'consolidado' ? (
          /* -- VISTA CONSOLIDADA ------------------ */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>PRODUTO</th>
                  <th style={thStyle}>CATEGORIA</th>
                  <th style={thStyle}>TOTAL REDE</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>RENDIMENTO</th>
                  <th style={thStyle}>ESTOQUE POR FILIAL</th>
                  {!readOnly && <th style={{ ...thStyle, textAlign: 'right' }}>VALOR EM ESTOQUE</th>}
                  {!readOnly && <th style={{ ...thStyle, width: 68 }} />}
                  <th style={{ ...thStyle, width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const isExpanded = expanded.has(p.id)
                  const totalBaixo = p.branches.filter(b => b.minStock > 0 && b.currentStock <= b.minStock).length
                  const totalZero  = p.branches.filter(b => b.currentStock === 0).length

                  return (
                    <>
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: isExpanded ? 'none' : (i < filtered.length - 1 ? '1px solid var(--hairline)' : 'none'),
                          background: i % 2 === 0 ? 'var(--surface)' : 'transparent',
                          cursor: p.branches.length > 0 ? 'pointer' : 'default',
                        }}
                        onClick={() => p.branches.length > 0 && toggleExpand(p.id)}
                      >
                        <td style={{ padding: '13px 16px' }}>
                          <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{p.name}</p>
                          {p.sku && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{p.sku}</p>}
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                            {p.category ?? '—'}
                          </span>
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                              {p.totalStock.toLocaleString('pt-BR')}
                            </span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{p.unit}</span>
                            {totalZero > 0 && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                                background: '#fef2f2', color: '#dc2626',
                              }}>
                                {totalZero} sem estoque
                              </span>
                            )}
                            {totalZero === 0 && totalBaixo > 0 && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                                background: '#fffbeb', color: '#d97706',
                              }}>
                                {totalBaixo} abaixo do mín.
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {p.consumptionUnit && p.totalRendimento != null ? (
                            <div>
                              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                                {p.totalRendimento.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                              </span>
                              <span style={{ fontSize: 11.5, color: 'var(--text-faint)', marginLeft: 4 }}>
                                {p.consumptionUnit}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <BranchPills branches={p.branches} unit={p.unit} />
                        </td>
                        {!readOnly && (
                          <td style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {p.costPrice > 0
                              ? (
                                <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                                  {(p.costPrice * p.totalStock).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>
                              )
                            }
                          </td>
                        )}
                        {!readOnly && (
                          <td style={{ padding: '13px 10px' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <PencilButton onClick={() => setEditing(p)} />
                              <GearButton   onClick={() => setManaging(p)} />
                            </div>
                          </td>
                        )}
                        <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                          {p.branches.length > 0 && (
                            isExpanded
                              ? <ChevronUp   size={14} style={{ color: 'var(--text-faint)' }} />
                              : <ChevronDown size={14} style={{ color: 'var(--text-faint)' }} />
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${p.id}-detail`} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                          <td colSpan={readOnly ? 6 : 8} style={{ padding: '0 16px 14px 40px', background: 'var(--bg-app)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {p.branches.map(b => (
                                <div key={b.branchId} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '8px 12px', borderRadius: 8,
                                  background: 'var(--surface)', border: '1px solid var(--hairline)',
                                }}>
                                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                                    {b.branchName}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    {b.minStock > 0 && (
                                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                                        mín. {b.minStock.toLocaleString('pt-BR')} {p.unit}
                                      </span>
                                    )}
                                    <StockBadge current={b.currentStock} min={b.minStock} unit={p.unit} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* -- VISTA POR UNIDADE ------------------ */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>PRODUTO</th>
                  <th style={thStyle}>CATEGORIA</th>
                  <th style={thStyle}>FILIAL</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>ESTOQUE</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>RENDIMENTO</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>MÍNIMO</th>
                  {!readOnly && <th style={{ ...thStyle, textAlign: 'right' }}>VALOR</th>}
                  <th style={thStyle}>STATUS</th>
                  {!readOnly && <th style={{ ...thStyle, width: 68 }} />}
                </tr>
              </thead>
              <tbody>
                {rowsByUnit.map((row, i) => {
                  const isZero  = row.branch.currentStock === 0
                  const isBaixo = !isZero && row.branch.minStock > 0 && row.branch.currentStock <= row.branch.minStock

                  return (
                    <tr key={`${row.id}-${row.branch.branchId}`} style={{
                      borderBottom: i < rowsByUnit.length - 1 ? '1px solid var(--hairline)' : 'none',
                      background: i % 2 === 0 ? 'var(--surface)' : 'transparent',
                    }}>
                      <td style={{ padding: '12px 16px' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{row.name}</p>
                        {row.sku && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{row.sku}</p>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.category ?? '—'}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                          background: 'var(--bg-app)', color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                        }}>
                          {row.branch.branchName}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <span style={{
                          fontSize: 13.5, fontWeight: 800, letterSpacing: '-0.01em',
                          color: isZero ? '#dc2626' : isBaixo ? '#d97706' : 'var(--text)',
                        }}>
                          {row.branch.currentStock.toLocaleString('pt-BR')}
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-faint)', marginLeft: 4 }}>
                            {row.unit}
                          </span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {row.consumptionUnit && row.unitsPerPackage ? (() => {
                          const r = row.branch.currentRendimento != null
                            ? row.branch.currentRendimento
                            : row.branch.currentStock * row.unitsPerPackage
                          return (
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
                              {r.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                              <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 4 }}>
                                {row.consumptionUnit}
                              </span>
                            </span>
                          )
                        })() : (
                          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                          {row.branch.minStock > 0 ? `${row.branch.minStock.toLocaleString('pt-BR')} ${row.unit}` : '—'}
                        </span>
                      </td>
                      {!readOnly && (
                        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {row.costPrice > 0
                            ? (
                              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                                {(row.costPrice * row.branch.currentStock).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>
                            )
                          }
                        </td>
                      )}
                      <td style={{ padding: '12px 16px' }}>
                        <StockBadge current={row.branch.currentStock} min={row.branch.minStock} unit={row.unit} />
                      </td>
                      {!readOnly && (
                        <td style={{ padding: '12px 10px' }}>
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
          allBranches={branches}
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
