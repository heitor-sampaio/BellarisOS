'use client'

import { useState, useMemo, useRef, useTransition } from 'react'
import { Search, Pencil, PowerOff, Power, X, ChevronUp, ChevronDown, PackageX } from 'lucide-react'
import { StockProductModal, type StockProductModalHandle, type StockProduct, type ProductCategory } from '@/components/branch/stock-product-modal'
import { toggleProductActive } from '@/actions/stock'
import { useRouter } from 'next/navigation'

interface Product {
  id:                string
  name:              string
  sku:               string | null
  category:          string | null
  category_id:       string | null
  unit:              string
  supplier:          string | null
  cost_price:        number | null
  sale_price:        number | null
  min_stock:         number | null
  barcode:           string | null
  consumption_unit:  string | null
  units_per_package: number | null
  is_active:         boolean
  created_at:        string
}

interface Props {
  initialProducts: Product[]
  categories:      ProductCategory[]
  suppliers:       string[]
}

type SortKey = 'name' | 'category' | 'unit'
type SortDir = 'asc' | 'desc'

export function AdminProductTable({ initialProducts, categories, suppliers }: Props) {
  const [search,      setSearch]      = useState('')
  const [category,    setCategory]    = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [sortKey,     setSortKey]     = useState<SortKey>('name')
  const [sortDir,     setSortDir]     = useState<SortDir>('asc')
  const [editProduct, setEditProduct] = useState<StockProduct | null>(null)

  const editRef  = useRef<StockProductModalHandle>(null)
  const router   = useRouter()
  const [_p, start] = useTransition()

  function handleEditClick(p: Product) {
    setEditProduct({
      id: p.id, name: p.name, sku: p.sku, barcode: p.barcode,
      category: p.category, category_id: p.category_id,
      unit: p.unit, supplier: p.supplier,
      cost_price: p.cost_price, sale_price: p.sale_price,
      min_stock: p.min_stock,
      consumption_unit:  p.consumption_unit,
      units_per_package: p.units_per_package,
    })
    setTimeout(() => editRef.current?.open(), 0)
  }

  function handleToggleActive(p: Product) {
    start(async () => {
      await toggleProductActive(p.id, !p.is_active)
      router.refresh()
    })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return [...initialProducts]
      .filter(p => {
        if (!showInactive && !p.is_active) return false
        if (q && !p.name.toLowerCase().includes(q) && !(p.sku ?? '').toLowerCase().includes(q)) return false
        if (category && p.category_id !== category) return false
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (sortKey === 'name')     cmp = a.name.localeCompare(b.name, 'pt-BR')
        if (sortKey === 'category') cmp = (a.category ?? '').localeCompare(b.category ?? '', 'pt-BR')
        if (sortKey === 'unit')     cmp = a.unit.localeCompare(b.unit, 'pt-BR')
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [initialProducts, search, category, showInactive, sortKey, sortDir])

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp size={12} style={{ opacity: 0.2 }} />
    return sortDir === 'asc'
      ? <ChevronUp   size={12} style={{ color: 'var(--brand)' }} />
      : <ChevronDown size={12} style={{ color: 'var(--brand)' }} />
  }

  const fmtBRL = (v: number | null) =>
    v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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

        {categories.length > 0 && (
          <select value={category} onChange={e => setCategory(e.target.value)} style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '7px 10px', cursor: 'pointer', outline: 'none',
          }}>
            <option value="">Todas as categorias</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <button type="button" onClick={() => setShowInactive(v => !v)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 10,
          cursor: 'pointer', transition: 'all 120ms',
          border: showInactive ? '1.5px solid var(--brand)' : '1px solid var(--border)',
          background: showInactive ? 'var(--brand-soft)' : 'var(--surface)',
          color: showInactive ? 'var(--brand)' : 'var(--text-muted)',
        }}>
          Mostrar inativos
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>
          {filtered.length} produto{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <PackageX size={36} style={{ color: 'var(--text-faint)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 14 }}>Nenhum produto encontrado</p>
            <p style={{ color: 'var(--text-faint)', fontSize: 12.5, marginTop: 4 }}>
              Crie o primeiro produto com o botão "Novo produto".
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {([['name', 'Produto'], ['category', 'Categoria'], ['unit', 'Unidade']] as [SortKey, string][]).map(([key, label]) => (
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
                {filtered.map((p, i) => (
                  <tr key={p.id} style={{
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--hairline)' : 'none',
                    background: !p.is_active
                      ? 'var(--bg-app)'
                      : i % 2 === 0 ? 'var(--surface)' : 'transparent',
                    opacity: p.is_active ? 1 : 0.55,
                  }}>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div>
                          <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{p.name}</p>
                          {p.sku && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{p.sku}</p>}
                        </div>
                        {!p.is_active && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                            background: 'var(--border)', color: 'var(--text-faint)',
                          }}>
                            INATIVO
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                        {p.category ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                        background: 'var(--bg-app)', color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                      }}>
                        {p.unit}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.supplier ?? '—'}</span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button type="button" title="Editar" onClick={() => handleEditClick(p)} style={{
                          width: 32, height: 32, borderRadius: 8,
                          border: '1px solid var(--border)', background: 'var(--surface)',
                          color: 'var(--text-muted)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          title={p.is_active ? 'Desativar' : 'Reativar'}
                          onClick={() => handleToggleActive(p)}
                          style={{
                            width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
                            border: p.is_active ? '1px solid var(--border)' : '1.5px solid #16a34a',
                            background: p.is_active ? 'var(--surface)' : '#f0fdf4',
                            color: p.is_active ? 'var(--text-muted)' : '#16a34a',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {p.is_active ? <PowerOff size={13} /> : <Power size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editProduct && (
        <StockProductModal
          ref={editRef}
          key={editProduct.id}
          product={editProduct}
          suppliers={suppliers}
          categories={categories}
        />
      )}
    </div>
  )
}
