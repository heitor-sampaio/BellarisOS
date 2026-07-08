'use client'

import { useState, useMemo, useRef, useTransition } from 'react'
import {
  Search, ArrowDownCircle, History,
  AlertTriangle, PackageX, X, ChevronUp, ChevronDown,
} from 'lucide-react'
import { StockMovementModal, type StockMovementModalHandle, type MovProduct } from './stock-movement-modal'
import { getProductMovements } from '@/actions/stock'

export interface Product {
  id:          string
  name:        string
  sku:         string | null
  category:    string | null
  unit:        string
  supplier:    string | null
  cost_price:  number | null
  sale_price:  number | null
  is_active:   boolean
  product_batches: { expires_at: string | null; quantity: number }[]
  // estoque desta filial (array de 0 ou 1 elemento do join)
  branch_product_stock: { current_stock: number; min_stock: number }[]
}

interface Movement {
  id:            string
  type:          string
  quantity:      number
  balance_after: number
  notes:         string | null
  created_at:    string
}

interface Props {
  initialProducts: Product[]
  categories:      string[]
  branchId:        string
  slug:            string
  canWrite?:       boolean
}

type SortKey = 'name' | 'current_stock' | 'category'
type SortDir = 'asc' | 'desc'

const MOV_LABELS: Record<string, string> = {
  PURCHASE:          'Reabastecimento',
  PROCEDURE_USAGE:   'Uso em procedimento',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  TRANSFER_IN:       'Transferência recebida',
  TRANSFER_OUT:      'Transferência enviada',
}

function stockOf(p: Product) {
  return p.branch_product_stock[0] ?? { current_stock: 0, min_stock: 0 }
}

function StockBadge({ current, min }: { current: number; min: number }) {
  const level = current <= 0 ? 'zero' : min > 0 && current <= min ? 'low' : 'ok'
  const cfg = {
    zero: { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5', label: 'Zerado' },
    low:  { bg: '#fffbeb', color: '#d97706', border: '#fcd34d', label: 'Baixo' },
    ok:   { bg: '#f0fdf4', color: '#16a34a', border: '#86efac', label: 'OK' },
  }
  const { bg, color, border, label } = cfg[level]
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
      background: bg, color, border: `1px solid ${border}`,
    }}>
      {label}
    </span>
  )
}

function ExpiryWarning({ batches }: { batches: { expires_at: string | null }[] }) {
  const now      = Date.now()
  const in30days = now + 30 * 864e5
  const relevant = batches.filter(b => b.expires_at && new Date(b.expires_at).getTime() <= in30days)
  if (relevant.length === 0) return null
  const soonest  = relevant.reduce((a, b) =>
    new Date(a.expires_at!).getTime() < new Date(b.expires_at!).getTime() ? a : b)
  const isExpired = new Date(soonest.expires_at!).getTime() < now
  return (
    <span title={isExpired ? 'Lote vencido' : 'Vencimento próximo'} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      background: isExpired ? '#fef2f2' : '#fffbeb',
      color: isExpired ? '#dc2626' : '#d97706',
      border: `1px solid ${isExpired ? '#fca5a5' : '#fcd34d'}`,
    }}>
      <AlertTriangle size={10} />
      {isExpired ? 'Vencido' : new Date(soonest.expires_at!).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}
    </span>
  )
}

// --- Modal de histórico --------------------------------------------
function HistoryModal({
  dialogRef, product, branchId, history, loading,
}: {
  dialogRef: React.RefObject<HTMLDialogElement>
  product:   Product | null
  branchId:  string
  history:   Movement[]
  loading:   boolean
}) {
  const close = () => dialogRef.current?.close()
  const fmt   = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2)
  const stock = product ? stockOf(product) : { current_stock: 0, min_stock: 0 }

  return (
    <dialog
      ref={dialogRef} className="modal"
      style={{ maxWidth: 560 } as React.CSSProperties}
      onClick={e => { if (e.target === dialogRef.current) close() }}
    >
      <div style={{
        position: 'sticky', top: 0, zIndex: 1,
        background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
        padding: '18px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
            Histórico de movimentações
          </h2>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
            {product?.name ?? '—'} · saldo atual: {fmt(stock.current_stock)} {product?.unit}
          </p>
        </div>
        <button type="button" onClick={close} style={{
          width: 32, height: 32, borderRadius: 10, cursor: 'pointer',
          border: '1px solid var(--border)', background: 'var(--bg-app)',
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: '20px 24px 28px', minHeight: 200 }}>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</p>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <PackageX size={32} style={{ color: 'var(--text-faint)', margin: '0 auto 10px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma movimentação registrada.</p>
          </div>
        ) : (
          history.map((mov, i) => {
            const positive = mov.quantity > 0
            return (
              <div key={mov.id} style={{
                display: 'grid', gridTemplateColumns: '64px 1fr 80px',
                gap: 12, padding: '12px 0',
                borderBottom: i < history.length - 1 ? '1px solid var(--hairline)' : 'none',
              }}>
                <div style={{
                  fontWeight: 800, fontSize: 14, textAlign: 'right',
                  color: positive ? '#16a34a' : '#dc2626', paddingTop: 1,
                }}>
                  {positive ? '+' : ''}{fmt(mov.quantity)} {product?.unit}
                </div>
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                    {MOV_LABELS[mov.type] ?? mov.type}
                  </p>
                  {mov.notes && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{mov.notes}</p>
                  )}
                  <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 3 }}>
                    {new Date(mov.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.04em' }}>SALDO</p>
                  <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                    {fmt(mov.balance_after)} {product?.unit}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </dialog>
  )
}

// --- Componente principal -----------------------------------------
export function StockTable({ initialProducts, categories, branchId, slug, canWrite = true }: Props) {
  const [search,      setSearch]      = useState('')
  const [category,    setCategory]    = useState('')
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [sortKey,     setSortKey]     = useState<SortKey>('name')
  const [sortDir,     setSortDir]     = useState<SortDir>('asc')

  const movRef     = useRef<StockMovementModalHandle>(null)
  const historyRef = useRef<HTMLDialogElement>(null)

  const [histProduct, setHistProduct] = useState<Product | null>(null)
  const [history,     setHistory]     = useState<Movement[]>([])
  const [histLoading, setHistLoading] = useState(false)

  const [_pending, startTransition] = useTransition()

  function handleMoveClick(p: Product) {
    const stock = stockOf(p)
    const mp: MovProduct = {
      id: p.id, name: p.name, unit: p.unit,
      current_stock: stock.current_stock,
      cost_price:    p.cost_price,
    }
    movRef.current?.open(mp)
  }

  function handleHistoryClick(p: Product) {
    setHistProduct(p)
    setHistory([])
    setHistLoading(true)
    historyRef.current?.showModal()
    startTransition(async () => {
      const movs = await getProductMovements(p.id, branchId)
      setHistory(movs as Movement[])
      setHistLoading(false)
    })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase()
    let result = initialProducts.filter(p => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku ?? '').toLowerCase().includes(q)) return false
      if (category && p.category !== category) return false
      if (showLowOnly) {
        const s = stockOf(p)
        if (!(s.current_stock <= s.min_stock && s.min_stock > 0) && s.current_stock > 0) return false
      }
      return true
    })

    return [...result].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name')          cmp = a.name.localeCompare(b.name, 'pt-BR')
      else if (sortKey === 'current_stock') cmp = stockOf(a).current_stock - stockOf(b).current_stock
      else if (sortKey === 'category') cmp = (a.category ?? '').localeCompare(b.category ?? '', 'pt-BR')
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [initialProducts, search, category, showLowOnly, sortKey, sortDir])

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp size={12} style={{ opacity: 0.2 }} />
    return sortDir === 'asc'
      ? <ChevronUp   size={12} style={{ color: 'var(--brand)' }} />
      : <ChevronDown size={12} style={{ color: 'var(--brand)' }} />
  }

  const thStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'left',
    background: 'var(--bg-app)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap', userSelect: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          border: '1px solid var(--border)', borderRadius: 10,
          background: 'var(--surface)', padding: '7px 12px',
          flex: 1, minWidth: 200,
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

        <button type="button" onClick={() => setShowLowOnly(v => !v)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 10,
          cursor: 'pointer', transition: 'all 120ms',
          border: showLowOnly ? '1.5px solid #d97706' : '1px solid var(--border)',
          background: showLowOnly ? '#fffbeb' : 'var(--surface)',
          color: showLowOnly ? '#d97706' : 'var(--text-muted)',
        }}>
          <AlertTriangle size={13} />
          Baixo estoque
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>
          {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <PackageX size={36} style={{ color: 'var(--text-faint)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 14 }}>Nenhum produto encontrado</p>
            <p style={{ color: 'var(--text-faint)', fontSize: 12.5, marginTop: 4 }}>
              O catálogo de produtos é gerenciado pelo admin da rede.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {([['name', 'Produto'], ['category', 'Categoria'], ['current_stock', 'Estoque nesta filial']] as [SortKey, string][]).map(([key, label]) => (
                    <th key={key} style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort(key)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {label.toUpperCase()} <SortIcon col={key} />
                      </span>
                    </th>
                  ))}
                  <th style={thStyle}>FORNECEDOR</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p, i) => {
                  const stock = stockOf(p)
                  const fmt   = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2)
                  return (
                    <tr key={p.id} style={{
                      borderBottom: i < filteredProducts.length - 1 ? '1px solid var(--hairline)' : 'none',
                      background: i % 2 === 0 ? 'var(--surface)' : 'transparent',
                    }}>
                      <td data-label="" style={{ padding: '13px 16px' }}>
                        <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{p.name}</p>
                        {p.sku && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{p.sku}</p>}
                      </td>

                      <td data-label="Categoria" style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                          {p.category ?? '—'}
                        </span>
                      </td>

                      <td data-label="Estoque" style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                            {fmt(stock.current_stock)}
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 3 }}>
                              {p.unit}
                            </span>
                          </span>
                          <StockBadge current={stock.current_stock} min={stock.min_stock} />
                          <ExpiryWarning batches={p.product_batches} />
                        </div>
                        {stock.min_stock > 0 && (
                          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 3 }}>
                            mín. {fmt(stock.min_stock)} {p.unit}
                          </p>
                        )}
                      </td>

                      <td data-label="Fornecedor" style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.supplier ?? '—'}</span>
                      </td>

                      <td data-label="" style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {canWrite && (
                            <button type="button" onClick={() => handleMoveClick(p)} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8,
                              border: '1.5px solid var(--brand)', background: 'var(--brand-soft)',
                              color: 'var(--brand)', cursor: 'pointer',
                            }}>
                              <ArrowDownCircle size={13} />
                              Reabastecer
                            </button>
                          )}
                          <button type="button" title="Histórico" onClick={() => handleHistoryClick(p)} style={{
                            width: 32, height: 32, borderRadius: 8,
                            border: '1px solid var(--border)', background: 'var(--surface)',
                            color: 'var(--text-muted)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <History size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <StockMovementModal ref={movRef} branchId={branchId} slug={slug} />

      <HistoryModal
        dialogRef={historyRef as React.RefObject<HTMLDialogElement>}
        product={histProduct}
        branchId={branchId}
        history={history}
        loading={histLoading}
      />
    </div>
  )
}
