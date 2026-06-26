'use client'

import { useState, useRef, useEffect } from 'react'
import {
  X, PackagePlus, ArrowLeftRight, SlidersHorizontal,
  AlertTriangle, TrendingDown, Check, Loader2,
} from 'lucide-react'
import {
  adminAddStock, adminTransferStock, adminAdjustStock, adminUpdateMinStock,
} from '@/actions/stock'

type BranchStock = {
  branchId:     string
  branchName:   string
  currentStock: number
  minStock:     number
}

type ProductInfo = {
  id:       string
  name:     string
  unit:     string
  branches: BranchStock[]
}

type AllBranch = { id: string; name: string }

interface Props {
  product:         ProductInfo
  allBranches:     AllBranch[]
  defaultBranchId?: string
  onClose:         () => void
  onSuccess:       () => void
}

type Tab   = 'movimentacoes' | 'min-stock'
type MovOp = 'entrada' | 'transferencia' | 'ajuste'

// ── Primitivos ────────────────────────────────────────────────────────
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
function ErrorMsg({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <p style={{
      fontSize: 12.5, fontWeight: 700, padding: '8px 12px', borderRadius: 8,
      background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
    }}>{msg}</p>
  )
}

function UnitSuffix({ unit }: { unit: string }) {
  return (
    <span style={{
      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
      fontSize: 11, color: 'var(--text-faint)', pointerEvents: 'none',
    }}>{unit}</span>
  )
}

function BranchSelect({
  name, branches, allBranches, label, required, onChange, defaultValue,
}: {
  name:          string
  branches:      BranchStock[]
  allBranches:   AllBranch[]
  label:         string
  required?:     boolean
  onChange?:     (id: string) => void
  defaultValue?: string
}) {
  const stockMap = Object.fromEntries(branches.map(b => [b.branchId, b.currentStock]))
  return (
    <FieldWrap>
      <Label>{label}{required && ' *'}</Label>
      <select name={name} required={required} defaultValue={defaultValue ?? ''} className="field"
        onChange={e => onChange?.(e.target.value)}>
        <option value="" disabled>Selecionar filial…</option>
        {allBranches.map(b => (
          <option key={b.id} value={b.id}>
            {b.name}{stockMap[b.id] !== undefined ? ` · ${stockMap[b.id].toLocaleString('pt-BR')}` : ''}
          </option>
        ))}
      </select>
    </FieldWrap>
  )
}

// ── Formulário: Entrada ───────────────────────────────────────────────
function EntradaForm({ product, allBranches, defaultBranchId, onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  defaultBranchId?: string
  onClose: () => void; onSuccess: () => void
}) {
  const [error, setError]     = useState<string>()
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      const res = await adminAddStock(undefined, fd)
      if (res?.success) onSuccess()
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {defaultBranchId ? (
        <input type="hidden" name="branchId" value={defaultBranchId} />
      ) : (
        <BranchSelect name="branchId" branches={product.branches} allBranches={allBranches}
          label="Filial de destino" required />
      )}

      <div className="form-2col">
        <FieldWrap>
          <Label>Quantidade *</Label>
          <div style={{ position: 'relative' }}>
            <input name="quantity" type="number" step="0.001" min="0.001" required className="field"
              placeholder="0" style={{ paddingRight: 36 }} />
            <UnitSuffix unit={product.unit} />
          </div>
        </FieldWrap>
        <FieldWrap>
          <Label>Custo unitário</Label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11.5, color: 'var(--text-faint)', pointerEvents: 'none',
            }}>R$</span>
            <input name="unit_cost" type="number" step="0.01" min="0" className="field"
              placeholder="0,00" style={{ paddingLeft: 28 }} />
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

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={pending}>
          <PackagePlus size={14} />
          {pending ? 'Salvando…' : 'Registrar entrada'}
        </button>
      </div>
    </form>
  )
}

// ── Formulário: Transferência ─────────────────────────────────────────
function TransferenciaForm({ product, allBranches, onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  onClose: () => void; onSuccess: () => void
}) {
  const [error,   setError]   = useState<string>()
  const [pending, setPending] = useState(false)
  const [fromId,  setFromId]  = useState('')
  const [toId,    setToId]    = useState('')

  const stockMap  = Object.fromEntries(product.branches.map(b => [b.branchId, b.currentStock]))
  const fromStock = fromId ? (stockMap[fromId] ?? 0) : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      const res = await adminTransferStock(undefined, fd)
      if (res?.success) onSuccess()
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="flex-wrap-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', gap: 8 }}>
        <BranchSelect name="fromBranchId" branches={product.branches} allBranches={allBranches}
          label="Origem" required onChange={setFromId} />
        <div style={{ paddingBottom: 10, color: 'var(--text-faint)' }}>
          <ArrowLeftRight size={16} />
        </div>
        <BranchSelect name="toBranchId" branches={product.branches} allBranches={allBranches}
          label="Destino" required onChange={setToId} />
      </div>

      {fromStock !== null && (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: 'var(--bg-app)', border: '1px solid var(--border)',
          fontSize: 12.5, color: 'var(--text-muted)',
        }}>
          Disponível na origem:&nbsp;
          <strong style={{ color: 'var(--text)' }}>
            {fromStock.toLocaleString('pt-BR')} {product.unit}
          </strong>
        </div>
      )}

      <FieldWrap>
        <Label>Quantidade *</Label>
        <div style={{ position: 'relative' }}>
          <input name="quantity" type="number" step="0.001" min="0.001" required className="field"
            placeholder="0" max={fromStock ?? undefined} style={{ paddingRight: 36 }} />
          <UnitSuffix unit={product.unit} />
        </div>
      </FieldWrap>

      <FieldWrap>
        <Label>Observações</Label>
        <textarea name="notes" className="field" rows={2} placeholder="Motivo da transferência…"
          style={{ resize: 'vertical' }} />
      </FieldWrap>

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={pending || fromId === toId}>
          <ArrowLeftRight size={14} />
          {pending ? 'Transferindo…' : 'Confirmar transferência'}
        </button>
      </div>
    </form>
  )
}

// ── Formulário: Ajuste ────────────────────────────────────────────────
function AjusteForm({ product, allBranches, defaultBranchId, onClose, onSuccess }: {
  product: ProductInfo; allBranches: AllBranch[]
  defaultBranchId?: string
  onClose: () => void; onSuccess: () => void
}) {
  const [error,     setError]     = useState<string>()
  const [pending,   setPending]   = useState(false)
  const [branchId,  setBranchId]  = useState(defaultBranchId ?? '')
  const [newQty,    setNewQty]    = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const stockMap     = Object.fromEntries(product.branches.map(b => [b.branchId, b.currentStock]))
  const currentStock = branchId ? (stockMap[branchId] ?? 0) : null
  const parsedNew    = newQty !== '' ? parseFloat(newQty.replace(',', '.')) : null
  const delta        = currentStock !== null && parsedNew !== null ? parsedNew - currentStock : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!confirmed) return
    setPending(true); setError(undefined)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('productId', product.id)
      const res = await adminAdjustStock(undefined, fd)
      if (res?.success) onSuccess()
      else setError(res?.error ?? 'Erro inesperado.')
    } catch { setError('Erro inesperado.') }
    finally { setPending(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        padding: '10px 13px', borderRadius: 9,
        background: '#fff7ed', border: '1.5px solid #fed7aa',
        display: 'flex', gap: 9, alignItems: 'flex-start',
      }}>
        <AlertTriangle size={15} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
          <strong>Operação crítica.</strong> O ajuste sobrescreve o estoque e pode gerar
          inconsistência com movimentações anteriores. Use apenas após inventário físico confirmado.
        </p>
      </div>

      {defaultBranchId ? (
        <input type="hidden" name="branchId" value={defaultBranchId} />
      ) : (
        <BranchSelect name="branchId" branches={product.branches} allBranches={allBranches}
          label="Filial" required onChange={id => { setBranchId(id); setConfirmed(false) }} />
      )}

      {currentStock !== null && (
        <div className="form-2col" style={{
          padding: '10px 13px', borderRadius: 8,
          background: 'var(--bg-app)', border: '1px solid var(--border)',
        }}>
          <div>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 2 }}>
              ESTOQUE ATUAL
            </p>
            <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {currentStock.toLocaleString('pt-BR')}
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-faint)', marginLeft: 4 }}>{product.unit}</span>
            </p>
          </div>
          {delta !== null && !isNaN(delta) && (
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 2 }}>
                VARIAÇÃO
              </p>
              <p style={{
                fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em',
                color: delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : 'var(--text-faint)',
              }}>
                {delta > 0 ? '+' : ''}{delta.toLocaleString('pt-BR')}
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-faint)', marginLeft: 4 }}>{product.unit}</span>
              </p>
            </div>
          )}
        </div>
      )}

      <FieldWrap>
        <Label>Novo estoque *</Label>
        <div style={{ position: 'relative' }}>
          <input name="new_quantity" type="number" step="0.001" min="0" required className="field"
            placeholder="0" value={newQty}
            onChange={e => { setNewQty(e.target.value); setConfirmed(false) }}
            style={{ paddingRight: 36 }} />
          <UnitSuffix unit={product.unit} />
        </div>
      </FieldWrap>

      <FieldWrap>
        <Label>Motivo *</Label>
        <textarea name="reason" required className="field" rows={2}
          placeholder="Ex: Inventário físico realizado, divergência identificada…"
          style={{ resize: 'vertical' }} />
      </FieldWrap>

      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
        borderRadius: 8, cursor: 'pointer', transition: 'all 150ms',
        border: `1.5px solid ${confirmed ? 'var(--brand)' : 'var(--border)'}`,
        background: confirmed ? 'var(--brand-soft)' : 'var(--bg-app)',
      }}>
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--brand)', flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.4,
          color: confirmed ? 'var(--brand)' : 'var(--text-muted)' }}>
          Confirmo que o novo valor foi verificado fisicamente e estou ciente da inconsistência no histórico.
        </span>
      </label>

      <ErrorMsg msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>Cancelar</button>
        <button type="submit" disabled={pending || !confirmed} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 10,
          border: 'none', cursor: pending || !confirmed ? 'not-allowed' : 'pointer',
          background: confirmed ? '#dc2626' : 'var(--border)',
          color: confirmed ? '#fff' : 'var(--text-faint)',
          transition: 'all 150ms',
        }}>
          <SlidersHorizontal size={14} />
          {pending ? 'Ajustando…' : 'Aplicar ajuste'}
        </button>
      </div>
    </form>
  )
}

// ── Tab: Estoque mínimo ───────────────────────────────────────────────
function MinStockTab({ product, allBranches, defaultBranchId }: {
  product:          ProductInfo
  allBranches:      AllBranch[]
  defaultBranchId?: string
}) {
  const stockMap = Object.fromEntries(product.branches.map(b => [b.branchId, b]))
  const visibleBranches = defaultBranchId ? allBranches.filter(b => b.id === defaultBranchId) : allBranches

  const [values,  setValues]  = useState<Record<string, string>>(() =>
    Object.fromEntries(allBranches.map(b => [
      b.id,
      String(stockMap[b.id]?.minStock ?? 0),
    ])),
  )
  const [saving,  setSaving]  = useState<Record<string, boolean>>({})
  const [saved,   setSaved]   = useState<Record<string, boolean>>({})
  const [errors,  setErrors]  = useState<Record<string, string>>({})

  async function save(branchId: string) {
    const raw = values[branchId] ?? '0'
    const v   = parseFloat(raw.replace(',', '.'))
    if (isNaN(v) || v < 0) {
      setErrors(p => ({ ...p, [branchId]: 'Valor inválido.' }))
      return
    }
    setSaving(p => ({ ...p, [branchId]: true }))
    setErrors(p => ({ ...p, [branchId]: '' }))
    const res = await adminUpdateMinStock(product.id, branchId, v)
    setSaving(p => ({ ...p, [branchId]: false }))
    if (res?.success) {
      setSaved(p => ({ ...p, [branchId]: true }))
      setTimeout(() => setSaved(p => ({ ...p, [branchId]: false })), 2000)
    } else {
      setErrors(p => ({ ...p, [branchId]: res?.error ?? 'Erro.' }))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Configure o estoque mínimo desejável de <strong style={{ color: 'var(--text)' }}>{product.name}</strong> em
        cada filial. Abaixo deste valor, o produto será sinalizado como alerta.
      </p>

      {visibleBranches.map(b => {
        const bs           = stockMap[b.id]
        const currentStock = bs?.currentStock ?? 0
        const isBusy       = saving[b.id]
        const isDone       = saved[b.id]
        const errMsg       = errors[b.id]

        return (
          <div key={b.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface)',
          }}>
            {/* Branch info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{b.name}</p>
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 1 }}>
                Atual: {currentStock.toLocaleString('pt-BR')} {product.unit}
              </p>
            </div>

            {/* Input */}
            <div style={{ position: 'relative', width: 110 }}>
              <input
                type="number" step="0.001" min="0"
                value={values[b.id] ?? '0'}
                onChange={e => {
                  setValues(p => ({ ...p, [b.id]: e.target.value }))
                  setSaved(p => ({ ...p, [b.id]: false }))
                }}
                onKeyDown={e => e.key === 'Enter' && save(b.id)}
                className="field"
                style={{ paddingRight: 36, textAlign: 'right' }}
              />
              <span style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 10.5, color: 'var(--text-faint)', pointerEvents: 'none',
              }}>{product.unit}</span>
            </div>

            {/* Save button */}
            <button
              type="button"
              onClick={() => save(b.id)}
              disabled={isBusy}
              style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: isBusy ? 'wait' : 'pointer',
                background: isDone ? '#f0fdf4' : 'var(--brand-soft)',
                color: isDone ? '#16a34a' : 'var(--brand)',
                transition: 'all 150ms',
              }}
              title="Salvar"
            >
              {isBusy
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : isDone
                ? <Check size={14} />
                : <TrendingDown size={14} />
              }
            </button>

            {errMsg && (
              <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>{errMsg}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Modal principal ───────────────────────────────────────────────────
export function AdminStockManageModal({ product, allBranches, defaultBranchId, onClose, onSuccess }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [tab,   setTab]   = useState<Tab>('movimentacoes')
  const [movOp, setMovOp] = useState<MovOp>('entrada')

  useEffect(() => {
    dialogRef.current?.showModal()
    return () => dialogRef.current?.close()
  }, [])

  const allMovOpts: { op: MovOp; label: string; icon: React.ReactNode; color: string }[] = [
    { op: 'entrada',       label: 'Entrada',       icon: <PackagePlus      size={13} />, color: '#16a34a' },
    { op: 'transferencia', label: 'Transferência',  icon: <ArrowLeftRight   size={13} />, color: '#2563eb' },
    { op: 'ajuste',        label: 'Ajuste',         icon: <SlidersHorizontal size={13}/>, color: '#d97706' },
  ]
  const MOV_OPTS = defaultBranchId
    ? allMovOpts.filter(o => o.op !== 'transferencia')
    : allMovOpts

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
        <div>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
            Gerenciar estoque
          </h2>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{product.name}</p>
        </div>
        <button type="button" onClick={onClose} style={{
          width: 32, height: 32, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
          border: '1px solid var(--border)', background: 'var(--bg-app)',
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--border)',
        padding: '0 22px',
        background: 'var(--surface)',
      }}>
        {([
          ['movimentacoes', 'Movimentações'],
          ['min-stock',     'Estoque mínimo'],
        ] as [Tab, string][]).map(([t, l]) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            padding: '10px 16px', fontSize: 13, fontWeight: 700,
            border: 'none', background: 'none', cursor: 'pointer',
            color: tab === t ? 'var(--brand)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--brand)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 120ms',
          }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 22px 26px' }}>
        {tab === 'movimentacoes' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Sub-tabs de operação */}
            <div style={{
              display: 'flex', gap: 6,
              background: 'var(--bg-app)', padding: 4, borderRadius: 10,
              border: '1px solid var(--border)',
            }}>
              {MOV_OPTS.map(o => (
                <button key={o.op} type="button" onClick={() => setMovOp(o.op)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 7,
                  border: 'none', cursor: 'pointer', transition: 'all 100ms',
                  background: movOp === o.op ? 'var(--surface)' : 'transparent',
                  color: movOp === o.op ? o.color : 'var(--text-muted)',
                  boxShadow: movOp === o.op ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                  {o.icon}
                  {o.label}
                </button>
              ))}
            </div>

            {movOp === 'entrada'       && <EntradaForm       product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} onClose={onClose} onSuccess={onSuccess} />}
            {movOp === 'transferencia' && <TransferenciaForm product={product} allBranches={allBranches} onClose={onClose} onSuccess={onSuccess} />}
            {movOp === 'ajuste'        && <AjusteForm        product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} onClose={onClose} onSuccess={onSuccess} />}
          </div>
        ) : (
          <MinStockTab product={product} allBranches={allBranches} defaultBranchId={defaultBranchId} />
        )}
      </div>
    </dialog>
  )
}
