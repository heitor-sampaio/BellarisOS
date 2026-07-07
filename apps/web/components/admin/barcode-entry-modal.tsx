'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { X, Barcode, PackagePlus, RotateCcw, Loader2, Link2, Search } from 'lucide-react'
import { findProductByBarcode, adminAddStock, saveBarcodeToProduct, searchProducts } from '@/actions/stock'
import { useRouter } from 'next/navigation'

type Branch = { id: string; name: string }

interface Props {
  allBranches:    Branch[]
  defaultBranchId?: string   // pre-selects and hides the branch selector
  onClose:        () => void
}

type Step = 'scan' | 'entry' | 'not-found'

interface FoundProduct {
  id:                string
  name:              string
  unit:              string
  cost_price:        number | null
  consumption_unit:  string | null
  units_per_package: number | null
  sku:               string | null
  category:          string | null
  barcode:           string | null
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
      {children}
    </label>
  )
}
function FieldWrap({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
}

export function BarcodeEntryModal({ allBranches, defaultBranchId, onClose }: Props) {
  const dialogRef  = useRef<HTMLDialogElement>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const searchRef  = useRef<HTMLInputElement>(null)
  const router     = useRouter()

  const [step,         setStep]         = useState<Step>('scan')
  const [barcode,      setBarcode]      = useState('')
  const [product,      setProduct]      = useState<FoundProduct | null>(null)
  const [scanError,    setScanError]    = useState<string>()
  const [entryError,   setEntryError]   = useState<string>()
  const [success,      setSuccess]      = useState(false)
  const [isPending,    startTransition] = useTransition()

  // Not-found flow
  const [searchQuery,  setSearchQuery]  = useState('')
  const [searchRes,    setSearchRes]    = useState<{ id: string; name: string; sku: string | null; unit: string; barcode: string | null }[]>([])
  const [linking,      setLinking]      = useState(false)
  const [linkError,    setLinkError]    = useState<string>()
  const [selectedProd, setSelectedProd] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
    setTimeout(() => barcodeRef.current?.focus(), 50)
  }, [])

  // Auto-search while typing in not-found step
  useEffect(() => {
    if (step !== 'not-found') return
    const t = setTimeout(async () => {
      if (searchQuery.length < 2) { setSearchRes([]); return }
      const res = await searchProducts(searchQuery)
      setSearchRes(res.products)
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, step])

  function resetToScan() {
    setStep('scan')
    setBarcode('')
    setProduct(null)
    setScanError(undefined)
    setSearchQuery('')
    setSearchRes([])
    setSelectedProd(null)
    setLinkError(undefined)
    setTimeout(() => barcodeRef.current?.focus(), 50)
  }

  function handleScan() {
    const code = barcode.trim()
    if (!code) return
    setScanError(undefined)

    startTransition(async () => {
      const res = await findProductByBarcode(code)
      if ('error' in res) {
        // Not found → offer to link
        setStep('not-found')
        setTimeout(() => searchRef.current?.focus(), 50)
      } else {
        setProduct(res.product as FoundProduct)
        setStep('entry')
      }
    })
  }

  async function handleLink() {
    if (!selectedProd) return
    setLinking(true)
    setLinkError(undefined)
    const res = await saveBarcodeToProduct(selectedProd.id, barcode.trim())
    setLinking(false)
    if (res.error) { setLinkError(res.error); return }
    // barcode linked → now fetch the full product and go to entry
    startTransition(async () => {
      const res2 = await findProductByBarcode(barcode.trim())
      if ('error' in res2) {
        // Fallback: use a minimal product object
        setProduct({ id: selectedProd.id, name: selectedProd.name, unit: '', cost_price: null, consumption_unit: null, units_per_package: null, sku: null, category: null, barcode: barcode.trim() })
      } else {
        setProduct(res2.product as FoundProduct)
      }
      setSearchQuery('')
      setSearchRes([])
      setSelectedProd(null)
      setStep('entry')
    })
  }

  async function handleEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!product) return
    setEntryError(undefined)

    const fd = new FormData(e.currentTarget)
    fd.set('productId', product.id)

    startTransition(async () => {
      const res = await adminAddStock(undefined, fd)
      if (res?.success) {
        setSuccess(true)
        router.refresh()
        setTimeout(() => {
          resetToScan()
          setSuccess(false)
        }, 1200)
      } else {
        setEntryError(res?.error ?? 'Erro inesperado.')
      }
    })
  }

  const displayUnit = (product?.consumption_unit && product?.units_per_package)
    ? product.consumption_unit
    : product?.unit ?? ''

  const defaultUnitCost = product
    ? (() => {
        const cp  = parseFloat(String(product.cost_price ?? 0)) || 0
        const upp = parseFloat(String(product.units_per_package ?? 0)) || 0
        return upp > 0 && product.consumption_unit ? (cp / upp).toFixed(4) : cp.toFixed(2)
      })()
    : ''

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClick={e => { if (e.target === dialogRef.current) onClose() }}
    >
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 1,
        background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
        padding: '16px 22px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Barcode size={18} style={{ color: 'var(--brand)' }} />
          <div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
              Entrada por código de barras
            </h2>
            {step === 'entry' && product && (
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                {product.name}
                {product.sku && <span style={{ color: 'var(--text-faint)' }}> · {product.sku}</span>}
              </p>
            )}
            {step === 'not-found' && (
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                Código não cadastrado · {barcode}
              </p>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} style={{
          width: 32, height: 32, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
          border: '1px solid var(--border)', background: 'var(--bg-app)',
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: '22px 22px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* -- Passo 1: leitura -- */}
        {step === 'scan' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
              Aponte a leitora para o código de barras do produto ou digite o código manualmente.
            </p>

            <FieldWrap>
              <Label>Código de barras</Label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={barcodeRef}
                  type="text"
                  className="field"
                  value={barcode}
                  onChange={e => { setBarcode(e.target.value); setScanError(undefined) }}
                  onKeyDown={e => e.key === 'Enter' && handleScan()}
                  placeholder="EAN-13, UPC, EAN-8…"
                  autoComplete="off"
                  style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '0.08em', fontSize: 14 }}
                />
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={!barcode.trim() || isPending}
                  className="btn-primary"
                  style={{ gap: 6, flexShrink: 0 }}
                >
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <Barcode size={14} />}
                  Buscar
                </button>
              </div>
            </FieldWrap>

            {scanError && (
              <p style={{
                fontSize: 12.5, fontWeight: 700, padding: '8px 12px', borderRadius: 8,
                background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
              }}>
                {scanError}
              </p>
            )}
          </>
        )}

        {/* -- Passo 2: produto não encontrado → vincular -- */}
        {step === 'not-found' && (
          <>
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: '#fff7ed', border: '1.5px solid #fed7aa',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <Barcode size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>Código não cadastrado</p>
                <p style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                  Nenhum produto com o código <code style={{ fontFamily: 'monospace', fontWeight: 700 }}>{barcode}</code>.
                  Vincule a um produto existente para continuar.
                </p>
              </div>
            </div>

            <FieldWrap>
              <Label>Buscar produto para vincular</Label>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
                <input
                  ref={searchRef}
                  type="text"
                  className="field"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSelectedProd(null) }}
                  placeholder="Nome do produto…"
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </FieldWrap>

            {searchRes.length > 0 && !selectedProd && (
              <div style={{
                border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
                maxHeight: 220, overflowY: 'auto',
              }}>
                {searchRes.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProd({ id: p.id, name: p.name })}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '10px 14px', background: 'var(--surface)',
                      border: 'none', borderBottom: i < searchRes.length - 1 ? '1px solid var(--hairline)' : 'none',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
                        {p.sku && <span>{p.sku} · </span>}
                        {p.unit}
                        {p.barcode && <span style={{ color: '#d97706' }}> · já tem código</span>}
                      </p>
                    </div>
                    <Link2 size={13} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}

            {selectedProd && (
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{selectedProd.name}</p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                    Vincular código <code style={{ fontFamily: 'monospace' }}>{barcode}</code>
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedProd(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)' }}>
                  <X size={13} />
                </button>
              </div>
            )}

            {linkError && (
              <p style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                {linkError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={resetToScan} className="btn-secondary">
                <RotateCcw size={13} /> Cancelar
              </button>
              <button
                type="button"
                onClick={handleLink}
                disabled={!selectedProd || linking || isPending}
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {linking || isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                {linking ? 'Vinculando…' : 'Vincular e registrar entrada'}
              </button>
            </div>
          </>
        )}

        {/* -- Passo 3: entrada -- */}
        {step === 'entry' && product && (
          <>
            {/* Card do produto */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 10,
              background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)',
            }}>
              <Barcode size={20} style={{ color: 'var(--brand)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{product.name}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {product.category && <span>{product.category} · </span>}
                  {displayUnit && <span>Unidade: {displayUnit}</span>}
                  {product.barcode && <span style={{ color: 'var(--text-faint)' }}> · {product.barcode}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={resetToScan}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11.5, fontWeight: 700, color: 'var(--brand)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                <RotateCcw size={12} /> Trocar
              </button>
            </div>

            <form onSubmit={handleEntry} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Branch selector — hidden if defaultBranchId provided */}
              {defaultBranchId ? (
                <input type="hidden" name="branchId" value={defaultBranchId} />
              ) : (
                <FieldWrap>
                  <Label>Filial de destino *</Label>
                  <select name="branchId" required className="field" defaultValue="">
                    <option value="" disabled>Selecionar filial…</option>
                    {allBranches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </FieldWrap>
              )}

              <div className="form-2col">
                <FieldWrap>
                  <Label>Quantidade *</Label>
                  <div style={{ position: 'relative' }}>
                    <input name="quantity" type="number" step="0.001" min="0.001" required className="field"
                      placeholder="0" style={{ paddingRight: 36 }} autoFocus />
                    <span style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 11, color: 'var(--text-faint)', pointerEvents: 'none',
                    }}>{displayUnit}</span>
                  </div>
                </FieldWrap>
                <FieldWrap>
                  <Label>Custo unitário</Label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 11.5, color: 'var(--text-faint)', pointerEvents: 'none',
                    }}>R$</span>
                    <input name="unit_cost" type="number" step="0.0001" min="0" className="field"
                      defaultValue={defaultUnitCost} placeholder="0,00" style={{ paddingLeft: 28 }} />
                  </div>
                </FieldWrap>
              </div>

              <div className="form-2col">
                <FieldWrap>
                  <Label>Nº do lote</Label>
                  <input name="batch_number" type="text" className="field" placeholder="LOT-001" />
                </FieldWrap>
                <FieldWrap>
                  <Label>Validade</Label>
                  <input name="expires_at" type="date" className="field" />
                </FieldWrap>
              </div>

              <FieldWrap>
                <Label>Observações</Label>
                <textarea name="notes" className="field" rows={2} placeholder="Nota fiscal, fornecedor…"
                  style={{ resize: 'vertical' }} />
              </FieldWrap>

              {entryError && (
                <p style={{
                  fontSize: 12.5, fontWeight: 700, padding: '8px 12px', borderRadius: 8,
                  background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                }}>{entryError}</p>
              )}

              {success && (
                <p style={{
                  fontSize: 12.5, fontWeight: 700, padding: '8px 12px', borderRadius: 8,
                  background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  ✓ Entrada registrada. Preparando próxima leitura…
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={onClose} className="btn-secondary" disabled={isPending}>
                  Fechar
                </button>
                <button type="submit" className="btn-primary" disabled={isPending || success}>
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <PackagePlus size={14} />}
                  {isPending ? 'Registrando…' : 'Registrar entrada'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </dialog>
  )
}
