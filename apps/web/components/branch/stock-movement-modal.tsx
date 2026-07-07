'use client'

import {
  useRef, useCallback, useActionState, useEffect,
  useState, forwardRef, useImperativeHandle,
} from 'react'
import { X, ArrowDownCircle, ArrowUpCircle, SlidersHorizontal } from 'lucide-react'
import { createStockMovement } from '@/actions/stock'

export interface StockMovementModalHandle {
  open: (product: MovProduct) => void
}

export interface MovProduct {
  id:            string
  name:          string
  unit:          string
  current_stock: number
  cost_price?:   number | null
}

interface Props {
  branchId: string
  slug:     string
}

type MovMode = 'entrada' | 'saida' | 'ajuste'

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

const MODES: { key: MovMode; label: string; icon: React.ReactNode }[] = [
  { key: 'entrada', label: 'Entrada',  icon: <ArrowDownCircle size={14} /> },
  { key: 'saida',   label: 'Saída',    icon: <ArrowUpCircle size={14} /> },
  { key: 'ajuste',  label: 'Ajuste',   icon: <SlidersHorizontal size={14} /> },
]

export const StockMovementModal = forwardRef<StockMovementModalHandle, Props>(
  function StockMovementModal({ branchId, slug }, ref) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const formRef   = useRef<HTMLFormElement>(null)
    const [product, setProduct] = useState<MovProduct | null>(null)
    const [mode,    setMode]    = useState<MovMode>('entrada')
    const [state, formAction, pending] = useActionState(createStockMovement, undefined)

    const open = useCallback((p: MovProduct) => {
      setProduct(p)
      setMode('entrada')
      formRef.current?.reset()
      dialogRef.current?.showModal()
    }, [])

    const close = useCallback(() => dialogRef.current?.close(), [])
    useImperativeHandle(ref, () => ({ open }), [open])

    useEffect(() => {
      if (state?.success) close()
    }, [state?.success])

    const movType = mode === 'entrada' ? 'PURCHASE' : 'MANUAL_ADJUSTMENT'
    const isExact = mode === 'ajuste'

    return (
      <dialog
        ref={dialogRef} className="modal"
        style={{ maxWidth: 440 } as React.CSSProperties}
        onClick={e => { if (e.target === dialogRef.current) close() }}
      >
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
              Movimentação
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {product?.name ?? '—'}
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

        <div style={{ padding: '20px 24px 28px' }}>
          {/* Tipo */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {MODES.map(({ key, label, icon }) => {
              const active = mode === key
              return (
                <button key={key} type="button" onClick={() => setMode(key)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '8px 0', borderRadius: 10, cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 700, transition: 'all 120ms',
                  border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
                  background: active ? 'var(--brand-soft)' : 'var(--surface)',
                  color: active ? 'var(--brand)' : 'var(--text-muted)',
                }}>
                  {icon}
                  {label}
                </button>
              )
            })}
          </div>

          <form ref={formRef} action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="hidden" name="_branchId"    value={branchId} />
            <input type="hidden" name="_slug"        value={slug} />
            <input type="hidden" name="_productId"   value={product?.id ?? ''} />
            <input type="hidden" name="_productName" value={product?.name ?? ''} />
            <input type="hidden" name="type"         value={movType} />
            <input type="hidden" name="is_exact"     value={String(isExact)} />

            {/* Estoque atual */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'var(--bg-app)', borderRadius: 10, padding: '10px 14px',
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)' }}>
                Estoque atual
              </span>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                {product?.current_stock ?? 0}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 4 }}>
                  {product?.unit}
                </span>
              </span>
            </div>

            {/* Quantidade */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>
                {mode === 'ajuste' ? 'Nova quantidade total' : 'Quantidade'} ({product?.unit ?? 'un'}) *
              </Label>
              <input
                name="quantity" type="number" step="0.01" min="0" required className="field"
                placeholder={mode === 'ajuste'
                  ? `Atual: ${product?.current_stock ?? 0}`
                  : '0'}
              />
              {mode === 'ajuste' && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  Informe a quantidade correta. A diferença será registrada como ajuste.
                </p>
              )}
            </div>

            {/* Custo + Lote + Validade (entrada) */}
            {mode === 'entrada' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label>Custo por embalagem</Label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 11.5, color: 'var(--text-faint)', pointerEvents: 'none',
                    }}>R$</span>
                    <input
                      name="cost_price" type="number" step="0.01" min="0" className="field"
                      defaultValue={product?.cost_price ?? ''}
                      placeholder="0,00" style={{ paddingLeft: 28 }}
                    />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    Usado para registrar despesa no financeiro. Deixe vazio para não registrar.
                  </p>
                </div>
                <div className="form-2col">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Label>Nº do lote</Label>
                    <input name="batch_number" type="text" className="field" placeholder="LOT-001" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Label>Validade</Label>
                    <input name="expires_at" type="date" className="field" />
                  </div>
                </div>
              </>
            )}

            {/* Observações */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>Observações</Label>
              <textarea
                name="notes" rows={2} className="field"
                placeholder="Motivo, nota fiscal, fornecedor…"
                style={{ resize: 'none' }}
              />
            </div>

            {state?.error && (
              <p style={{
                color: 'var(--warning)', background: 'var(--warning-soft)',
                borderRadius: 8, padding: '8px 12px',
                fontSize: 'var(--text-xs-sz)', fontWeight: 700,
              }}>
                {state.error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={close} className="btn-secondary" disabled={pending}>
                Cancelar
              </button>
              <button type="submit" disabled={pending} className="btn-primary">
                {pending ? 'Registrando…' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    )
  },
)
