'use client'

import {
  useRef, useCallback, useState, useMemo,
  forwardRef, useImperativeHandle,
} from 'react'
import { X, Package, Building2, ChevronDown, Barcode } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createProduct, updateProduct } from '@/actions/stock'

export interface StockProductModalHandle { open: () => void }

export interface StockProduct {
  id:                string
  name:              string
  sku:               string | null
  barcode:           string | null
  category:          string | null
  category_id:       string | null
  unit:              string
  supplier:          string | null
  cost_price:        number | null
  sale_price:        number | null
  min_stock:         number | null
  consumption_unit:  string | null
  units_per_package: number | null
}

export interface ProductCategory { id: string; name: string }

interface Props {
  product?:    StockProduct
  trigger?:    React.ReactNode
  suppliers?:  string[]
  categories?: ProductCategory[]
  onSuccess?:  () => void
}

function SupplierCombobox({ suppliers, defaultValue }: { suppliers: string[]; defaultValue?: string | null }) {
  const [value,    setValue]    = useState(defaultValue ?? '')
  const [open,     setOpen]     = useState(false)
  const containerRef            = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(s => s.toLowerCase().includes(q))
  }, [suppliers, value])

  const showDrop = open && filtered.length > 0

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          name="supplier"
          type="text"
          className="field"
          value={value}
          placeholder="Buscar ou digitar fornecedor…"
          autoComplete="off"
          onChange={e => { setValue(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{ paddingRight: 30 }}
        />
        <ChevronDown
          size={13}
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-faint)', pointerEvents: 'none',
            transition: 'transform 120ms',
            rotate: open ? '180deg' : '0deg',
          }}
        />
      </div>
      {showDrop && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
          maxHeight: 192, overflowY: 'auto',
        }}>
          {filtered.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={() => { setValue(s); setOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 14px',
                background: 'none', border: 'none',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--hairline)' : 'none',
                cursor: 'pointer', fontSize: 13, color: 'var(--text)',
                display: 'flex', alignItems: 'center', gap: 9,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <Building2 size={12} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const UNITS = ['un', 'UI', 'ml', 'L', 'g', 'kg', 'cx', 'par', 'rolo', 'ampola', 'frasco']

function skuPrefix(cat: string): string {
  return cat
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3) || 'OUT'
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 'var(--text-xs-sz)', fontWeight: 700,
      color: 'var(--text-muted)', letterSpacing: '0.04em',
    }}>
      {children}
    </label>
  )
}

// -- Campos compartilhados --------------------------------------------
function ProductFields({
  product, suppliers, categories = [], onClose, state, pending, submitLabel, isCreate = false,
}: {
  product?:    StockProduct
  suppliers:   string[]
  categories:  ProductCategory[]
  onClose:     () => void
  state:       { error?: string; success?: boolean } | undefined
  pending:     boolean
  submitLabel: string
  isCreate?:   boolean
}) {
  const [categoryId,       setCategoryId]       = useState(product?.category_id ?? '')
  const [barcodeValue,     setBarcodeValue]     = useState(product?.barcode ?? '')
  const [barcodeReady,     setBarcodeReady]     = useState(false)
  const [costPriceStr,     setCostPriceStr]     = useState(product?.cost_price != null ? String(product.cost_price) : '')
  const [unitsPerPkgStr,   setUnitsPerPkgStr]   = useState(product?.units_per_package != null ? String(product.units_per_package) : '')
  const [consumptionUnit,  setConsumptionUnit]  = useState(product?.consumption_unit ?? '')
  const [vendaDireta,      setVendaDireta]      = useState((product?.sale_price ?? null) !== null)
  const [showStock,        setShowStock]        = useState(false)

  const selectedCat = useMemo(() => categories.find(c => c.id === categoryId), [categories, categoryId])
  const skuPreview  = useMemo(
    () => selectedCat ? `${skuPrefix(selectedCat.name)}-NNN` : null,
    [selectedCat],
  )

  const costPerUnit = useMemo(() => {
    const cost = parseFloat(costPriceStr)
    const upp  = parseFloat(unitsPerPkgStr)
    if (!cost || !upp || upp <= 0 || !consumptionUnit) return null
    return cost / upp
  }, [costPriceStr, unitsPerPkgStr, consumptionUnit])

  return (
    <>
      {/* Nome + SKU */}
      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label>Nome *</Label>
          <input name="name" type="text" required className="field"
            defaultValue={product?.name}
            placeholder="Ex: Ácido Hialurônico 1%" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label>SKU</Label>
          {product?.sku ? (
            <div className="field" style={{
              background: 'var(--bg-app)', cursor: 'default',
              fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
              color: 'var(--text)', letterSpacing: '0.05em',
            }}>
              {product.sku}
            </div>
          ) : (
            <div className="field" style={{
              background: 'var(--bg-app)', cursor: 'default',
              fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
              color: skuPreview ? 'var(--brand)' : 'var(--text-faint)',
              letterSpacing: '0.05em',
            }}>
              {skuPreview ?? '—'}
            </div>
          )}
        </div>
      </div>

      {/* Código de barras */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label>Código de barras</Label>
          {barcodeReady && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10.5, fontWeight: 700, color: 'var(--brand)',
              letterSpacing: '0.02em',
            }}>
              <Barcode size={11} />
              Pronto para leitura
            </span>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <input
            name="barcode"
            type="text"
            className="field"
            value={barcodeValue}
            onChange={e => setBarcodeValue(e.target.value)}
            onFocus={() => setBarcodeReady(true)}
            onBlur={() => setBarcodeReady(false)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            placeholder="Escaneie ou digite o código EAN/UPC…"
            autoComplete="off"
            spellCheck={false}
            style={{
              fontFamily: barcodeValue ? 'monospace' : undefined,
              letterSpacing: barcodeValue ? '0.08em' : undefined,
              fontSize: barcodeValue ? 14 : undefined,
              outline: 'none',
              borderColor: barcodeReady ? 'var(--brand)' : undefined,
              boxShadow: barcodeReady ? '0 0 0 3px var(--brand-soft)' : undefined,
              transition: 'border-color 150ms, box-shadow 150ms',
            }}
          />
        </div>
      </div>

      {/* Categoria + Unidade */}
      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label>Categoria</Label>
          <select
            name="category_id"
            className="field"
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            disabled={categories.length === 0}
          >
            <option value="">
              {categories.length === 0 ? 'Nenhuma categoria cadastrada' : 'Sem categoria'}
            </option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label>Embalagem *</Label>
          <select name="unit" required className="field"
            defaultValue={product?.unit ?? 'un'}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* Conversão de embalagem (opcional) */}
      <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          Conteúdo da embalagem <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'var(--text-faint)' }}>— opcional</span>
        </p>
        <div className="form-2col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Label>Quantidade</Label>
            <input name="units_per_package" type="number" step="0.0001" min="0.0001" className="field"
              value={unitsPerPkgStr}
              onChange={e => setUnitsPerPkgStr(e.target.value)}
              placeholder="Ex: 100" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Label>Medida</Label>
            <select name="consumption_unit" className="field"
              value={consumptionUnit}
              onChange={e => setConsumptionUnit(e.target.value)}
            >
              <option value="">—</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
          Ex: 1 frasco com <strong>100 ml</strong> → custo por ml = preço ÷ 100
        </p>
      </div>

      {/* Toggle: Venda direta */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: vendaDireta ? 12 : 0,
        border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px',
        background: vendaDireta ? 'var(--bg-app)' : 'transparent',
        transition: 'background 200ms',
      }}>
        <button
          type="button"
          role="switch"
          aria-checked={vendaDireta}
          onClick={() => setVendaDireta(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            textAlign: 'left',
          }}
        >
          <div style={{
            width: 36, height: 20, borderRadius: 10, flexShrink: 0,
            background: vendaDireta ? 'var(--brand)' : 'var(--border)',
            position: 'relative', transition: 'background 200ms',
          }}>
            <div style={{
              position: 'absolute', top: 3,
              left: vendaDireta ? 19 : 3,
              width: 14, height: 14, borderRadius: '50%',
              background: 'white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              transition: 'left 200ms',
            }} />
          </div>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block' }}>
              Produto para venda direta ao cliente
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              {vendaDireta ? 'Informe o preço de venda abaixo' : 'Apenas para uso interno como insumo'}
            </span>
          </div>
        </button>

        {vendaDireta && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Label>Preço de venda</Label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 11.5, color: 'var(--text-faint)', pointerEvents: 'none',
              }}>R$</span>
              <input name="sale_price" type="number" step="0.01" min="0" className="field"
                defaultValue={product?.sale_price ?? ''}
                placeholder="0,00" style={{ paddingLeft: 28 }} />
            </div>
          </div>
        )}

        {/* Garante que sale_price seja enviado como null quando venda direta estiver desativada */}
        {!vendaDireta && <input type="hidden" name="sale_price" value="" />}
      </div>

      {/* Fornecedor + Estoque mínimo */}
      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label>Fornecedor</Label>
          <SupplierCombobox suppliers={suppliers} defaultValue={product?.supplier} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Label>Estoque mínimo</Label>
          <input name="min_stock" type="number" step="0.001" min="0" className="field"
            defaultValue={product?.min_stock ?? 0}
            placeholder="0" />
        </div>
      </div>

      {/* Estoque inicial — só na criação */}
      {isCreate && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: showStock ? 12 : 0,
          border: `1px solid ${showStock ? 'var(--brand-soft, #f3d9e0)' : 'var(--border)'}`,
          borderRadius: 10, padding: '12px 14px',
          background: showStock ? 'var(--brand-soft, #fdf4f6)' : 'transparent',
          transition: 'background 200ms, border-color 200ms',
        }}>
          <button
            type="button"
            role="switch"
            aria-checked={showStock}
            onClick={() => setShowStock(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
            }}
          >
            <div style={{
              width: 36, height: 20, borderRadius: 10, flexShrink: 0,
              background: showStock ? 'var(--brand)' : 'var(--border)',
              position: 'relative', transition: 'background 200ms',
            }}>
              <div style={{
                position: 'absolute', top: 3,
                left: showStock ? 19 : 3,
                width: 14, height: 14, borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'left 200ms',
              }} />
            </div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block' }}>
                Adicionar estoque inicial
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {showStock ? 'Lançamento de entrada registrado junto ao cadastro' : 'Registrar quantidade disponível agora'}
              </span>
            </div>
          </button>

          {showStock && (
            <>
              {/* Quantidade + Preço de custo por embalagem */}
              <div className="form-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label>Quantidade *</Label>
                  <input
                    name="initial_qty"
                    type="number" step="0.001" min="0.001"
                    required
                    className="field"
                    placeholder="0"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <Label>Custo por embalagem</Label>
                    {costPerUnit !== null && (
                      <span style={{ fontSize: 10, color: 'var(--brand)', fontWeight: 700 }}>
                        = R$ {costPerUnit.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} / {consumptionUnit}
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 11.5, color: 'var(--text-faint)', pointerEvents: 'none',
                    }}>R$</span>
                    <input name="initial_cost" type="number" step="0.01" min="0" className="field"
                      value={costPriceStr}
                      onChange={e => setCostPriceStr(e.target.value)}
                      placeholder="0,00" style={{ paddingLeft: 28 }} />
                  </div>
                </div>
              </div>

              {/* Lote + Validade */}
              <div className="form-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label>Número do lote</Label>
                  <input name="initial_batch" type="text" className="field" placeholder="Ex: LOT-2024-001" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label>Data de validade</Label>
                  <input name="initial_expires_at" type="date" className="field" />
                </div>
              </div>

              {/* Observações */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Observações</Label>
                <input name="initial_notes" type="text" className="field" placeholder="Ex: Compra inicial, NF 1234" />
              </div>
            </>
          )}
        </div>
      )}

      {state?.error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 700,
        }}>
          {state.error}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          <Package size={14} />
          {pending ? 'Salvando…' : submitLabel}
        </button>
      </div>
    </>
  )
}

// -- Form de criação ---------------------------------------------------
function CreateForm({ suppliers, categories, onClose, onSuccess }: {
  suppliers:  string[]
  categories: ProductCategory[]
  onClose:    () => void
  onSuccess:  () => void
}) {
  const [error,   setError]   = useState<string>()
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(undefined)
    try {
      const result = await createProduct(undefined, new FormData(e.currentTarget))
      if (result?.success) onSuccess()
      else setError(result?.error ?? 'Erro inesperado.')
    } catch {
      setError('Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ProductFields
        isCreate
        suppliers={suppliers} categories={categories} onClose={onClose}
        state={error ? { error } : undefined}
        pending={pending} submitLabel="Criar produto"
      />
    </form>
  )
}

// -- Form de edição ---------------------------------------------------
function EditForm({ product, suppliers, categories, onClose, onSuccess }: {
  product:    StockProduct
  suppliers:  string[]
  categories: ProductCategory[]
  onClose:    () => void
  onSuccess:  () => void
}) {
  const [error,   setError]   = useState<string>()
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(undefined)
    try {
      const result = await updateProduct(undefined, new FormData(e.currentTarget))
      if (result?.success) onSuccess()
      else setError(result?.error ?? 'Erro inesperado.')
    } catch {
      setError('Erro inesperado.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="_productId" value={product.id} />
      <ProductFields
        product={product} suppliers={suppliers} categories={categories} onClose={onClose}
        state={error ? { error } : undefined}
        pending={pending} submitLabel="Salvar"
      />
    </form>
  )
}

// -- Modal wrapper -----------------------------------------------------
export const StockProductModal = forwardRef<StockProductModalHandle, Props>(
  function StockProductModal({ product, trigger, suppliers = [], categories = [], onSuccess }, ref) {
    const isEdit    = !!product
    const dialogRef = useRef<HTMLDialogElement>(null)
    const router    = useRouter()

    const [formKey, setFormKey] = useState(0)

    const open  = useCallback(() => dialogRef.current?.showModal(), [])
    const close = useCallback(() => dialogRef.current?.close(), [])
    useImperativeHandle(ref, () => ({ open }), [open])

    function handleSuccess() {
      setFormKey(k => k + 1)
      close()
      router.refresh()
      onSuccess?.()
    }

    return (
      <>
        {trigger && (
          <span onClick={open} style={{ cursor: 'pointer', display: 'contents' }}>
            {trigger}
          </span>
        )}

        <dialog
          ref={dialogRef} className="modal"
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
                {isEdit ? 'Editar produto' : 'Novo produto'}
              </h2>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {isEdit ? product.name : 'Adicionar ao catálogo da rede'}
              </p>
            </div>
            <button type="button" onClick={close} style={{
              width: 32, height: 32, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
              border: '1px solid var(--border)', background: 'var(--bg-app)',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={15} />
            </button>
          </div>

          <div style={{ padding: '24px 24px 28px' }}>
            {isEdit
              ? <EditForm key={`${product.id}-${formKey}`} product={product} suppliers={suppliers} categories={categories} onClose={close} onSuccess={handleSuccess} />
              : <CreateForm key={formKey} suppliers={suppliers} categories={categories} onClose={close} onSuccess={handleSuccess} />
            }
          </div>
        </dialog>
      </>
    )
  },
)
