'use client'

import { useState, useTransition, forwardRef, useImperativeHandle } from 'react'
import { Plus, Trash2, Send, Save, Copy, ChevronDown, ChevronUp, FlaskConical } from 'lucide-react'
import { saveTreatmentPlan, proposeTreatmentPlan } from '@/actions/treatment-plans'
import type { PlanSessionInput } from '@/actions/treatment-plans'

export interface TreatmentPlanEditorRef {
  getSessions: () => PlanSessionInput[]
  getNotes:    () => string
}

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface TreatmentProcedureProduct {
  productId: string
  name:      string
  unit:      string
  quantity:  number
}

export interface TreatmentProcedure {
  id:          string
  name:        string
  category:    string
  price:       number
  durationMin: number
  products?:   TreatmentProcedureProduct[]
}

// Kept for backward compat with appointment-session.tsx
export interface TreatmentPackage {
  id:            string
  name:          string
  procedureId:   string
  totalSessions: number
  price:         number
}

export interface ExistingPlanSession {
  procedures: { procedureId: string; name: string; price: number; products?: TreatmentProcedureProduct[] }[]
}

export interface ExistingPlan {
  id:       string
  status:   string
  notes:    string | null
  sessions: ExistingPlanSession[]
}

// Kept for backward compat with appointment-session.tsx state
export interface SerializedPlanItem {
  procedureId:      string
  servicePackageId: string | null
  sessions:         number
  unitPrice:        number
  products:         { productId: string; quantity: number }[]
}

// ── Tipos internos ────────────────────────────────────────────────────────────

interface EditorProduct {
  localId:   string
  productId: string
  name:      string
  unit:      string
  quantity:  number
}

interface EditorProc {
  localId:     string
  procedureId: string
  name:        string
  price:       number
  products:    EditorProduct[]
}

interface EditorSession {
  localId: string
  procs:   EditorProc[]
}

export interface AvailableProduct {
  id:   string
  name: string
  unit: string
}

interface Props {
  appointmentId: string
  slug:          string
  procedures:    TreatmentProcedure[]
  existingPlan:  ExistingPlan | null
  hideActions?:  boolean
  availableProducts?:   AvailableProduct[]
  // Kept for compat
  servicePackages?:     TreatmentPackage[]
  procedureProductsMap?: Record<string, unknown[]>
  onPlanChange?:        (items: SerializedPlanItem[], notes: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2)
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fromExisting(plan: ExistingPlan | null): EditorSession[] {
  if (!plan || plan.sessions.length === 0) return []
  return plan.sessions.map(s => ({
    localId: uid(),
    procs:   s.procedures.map(p => ({
      localId:     uid(),
      procedureId: p.procedureId,
      name:        p.name,
      price:       p.price,
      products:    (p.products ?? []).map(pr => ({ localId: uid(), ...pr })),
    })),
  }))
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function ProcRow({
  proc, procedures, availableProducts,
  onChangeProcedure, onChangePrice, onRemove,
  onChangeProductQty, onRemoveProduct, onAddProduct,
}: {
  proc:               EditorProc
  procedures:         TreatmentProcedure[]
  availableProducts:  AvailableProduct[]
  onChangeProcedure:  (localId: string, id: string, name: string, price: number, products: EditorProduct[]) => void
  onChangePrice:      (localId: string, price: number) => void
  onRemove:           (localId: string) => void
  onChangeProductQty: (procLocalId: string, prodLocalId: string, qty: number) => void
  onRemoveProduct:    (procLocalId: string, prodLocalId: string) => void
  onAddProduct:       (procLocalId: string, productId: string, name: string, unit: string) => void
}) {
  const [showProducts, setShowProducts] = useState(proc.products.length > 0)

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--hairline)', overflow: 'hidden' }}>
      {/* Linha do procedimento */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface)' }}>
        <select
          value={proc.procedureId}
          onChange={e => {
            const found = procedures.find(p => p.id === e.target.value)
            if (found) {
              const newProds: EditorProduct[] = (found.products ?? []).map(pr => ({
                localId: uid(), productId: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity,
              }))
              onChangeProcedure(proc.localId, found.id, found.name, found.price, newProds)
              if (newProds.length > 0) setShowProducts(true)
            }
          }}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 8,
            border: '1px solid var(--border)', fontSize: 13,
            background: 'var(--surface)', color: 'var(--text)', outline: 'none',
          }}
        >
          <option value="">Selecionar procedimento…</option>
          {procedures.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>R$</span>
          <input
            type="number" min={0} step={0.01} value={proc.price || ''}
            onChange={e => onChangePrice(proc.localId, parseFloat(e.target.value) || 0)}
            placeholder="0,00"
            style={{
              width: 90, padding: '7px 8px', borderRadius: 8, textAlign: 'right',
              border: '1px solid var(--border)', fontSize: 13,
              background: 'var(--surface)', color: 'var(--text)', outline: 'none',
            }}
          />
        </div>

        <button
          type="button"
          title="Insumos"
          onClick={() => setShowProducts(v => !v)}
          style={{
            background: showProducts ? 'var(--brand-soft)' : 'none',
            border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, flexShrink: 0,
            color: proc.products.length > 0 ? 'var(--brand)' : 'var(--text-faint)',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
          }}
        >
          <FlaskConical size={12} />
          {proc.products.length > 0 && <span>{proc.products.length}</span>}
        </button>

        <button
          type="button"
          onClick={() => onRemove(proc.localId)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, borderRadius: 6, flexShrink: 0 }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Seção de insumos */}
      {showProducts && (
        <div style={{ padding: '8px 12px 10px', borderTop: '1px solid var(--hairline)', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 2 }}>INSUMOS</p>
          {proc.products.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic' }}>Nenhum insumo adicionado.</p>
          )}
          {proc.products.map(pr => (
            <div key={pr.localId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text)' }}>{pr.name}</span>
              <input
                type="number" min={0.01} step={0.01} value={pr.quantity || ''}
                onChange={e => onChangeProductQty(proc.localId, pr.localId, parseFloat(e.target.value) || 0)}
                style={{
                  width: 70, padding: '5px 8px', borderRadius: 7, textAlign: 'right',
                  border: '1px solid var(--border)', fontSize: 12,
                  background: 'var(--surface)', color: 'var(--text)', outline: 'none',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-faint)', width: 32, flexShrink: 0 }}>{pr.unit}</span>
              <button
                type="button"
                onClick={() => onRemoveProduct(proc.localId, pr.localId)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 2, borderRadius: 4 }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <select
              defaultValue=""
              onChange={e => {
                const found = availableProducts.find(p => p.id === e.target.value)
                if (found) { onAddProduct(proc.localId, found.id, found.name, found.unit); e.target.value = '' }
              }}
              style={{
                flex: 1, padding: '5px 8px', borderRadius: 7,
                border: '1px dashed var(--border)', fontSize: 12,
                background: 'var(--surface)', color: 'var(--text)', outline: 'none',
              }}
            >
              <option value="">+ Adicionar insumo…</option>
              {availableProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

function SessionCard({
  session, index, total, procedures, availableProducts,
  onAddProc, onChangeProcedure, onChangePrice, onRemoveProc,
  onDuplicate, onRemove,
  onChangeProductQty, onRemoveProduct, onAddProduct,
}: {
  session:            EditorSession
  index:              number
  total:              number
  procedures:         TreatmentProcedure[]
  availableProducts:  AvailableProduct[]
  onAddProc:          (sessLocalId: string) => void
  onChangeProcedure:  (sessLocalId: string, procLocalId: string, id: string, name: string, price: number, products: EditorProduct[]) => void
  onChangePrice:      (sessLocalId: string, procLocalId: string, price: number) => void
  onRemoveProc:       (sessLocalId: string, procLocalId: string) => void
  onDuplicate:        (sessLocalId: string) => void
  onRemove:           (sessLocalId: string) => void
  onChangeProductQty: (sessLocalId: string, procLocalId: string, prodLocalId: string, qty: number) => void
  onRemoveProduct:    (sessLocalId: string, procLocalId: string, prodLocalId: string) => void
  onAddProduct:       (sessLocalId: string, procLocalId: string, productId: string, name: string, unit: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{
      borderRadius: 'var(--radius-card)', border: '1px solid var(--border)',
      overflow: 'hidden', background: 'var(--surface)',
    }}>
      {/* Header da sessão */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        background: 'var(--bg-app)',
        borderBottom: collapsed ? 'none' : '1px solid var(--hairline)',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'var(--brand)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800,
        }}>
          {index + 1}
        </div>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          Sessão {index + 1}
          {session.procs.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
              {session.procs.map(p => p.name || '—').join(' · ')}
            </span>
          )}
        </span>
        {total > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', flexShrink: 0 }}>
            {fmtBRL(total)}
          </span>
        )}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            title="Duplicar sessão"
            onClick={() => onDuplicate(session.localId)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px 6px', borderRadius: 6 }}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            title="Remover sessão"
            onClick={() => onRemove(session.localId)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px 6px', borderRadius: 6 }}
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px 6px', borderRadius: 6 }}
          >
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>

      {/* Corpo da sessão */}
      {!collapsed && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {session.procs.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: '8px 0' }}>
              Nenhum procedimento. Clique em "Adicionar" abaixo.
            </p>
          ) : (
            session.procs.map(proc => (
              <ProcRow
                key={proc.localId}
                proc={proc}
                procedures={procedures}
                availableProducts={availableProducts}
                onChangeProcedure={(procLocalId, id, name, price, products) =>
                  onChangeProcedure(session.localId, procLocalId, id, name, price, products)
                }
                onChangePrice={(procLocalId, price) =>
                  onChangePrice(session.localId, procLocalId, price)
                }
                onRemove={procLocalId => onRemoveProc(session.localId, procLocalId)}
                onChangeProductQty={(procLocalId, prodLocalId, qty) =>
                  onChangeProductQty(session.localId, procLocalId, prodLocalId, qty)
                }
                onRemoveProduct={(procLocalId, prodLocalId) =>
                  onRemoveProduct(session.localId, procLocalId, prodLocalId)
                }
                onAddProduct={(procLocalId, productId, name, unit) =>
                  onAddProduct(session.localId, procLocalId, productId, name, unit)
                }
              />
            ))
          )}
          <button
            type="button"
            onClick={() => onAddProc(session.localId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--brand)', fontSize: 12, fontWeight: 700,
              padding: '4px 0', alignSelf: 'flex-start',
            }}
          >
            <Plus size={13} /> Adicionar procedimento
          </button>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export const TreatmentPlanEditor = forwardRef<TreatmentPlanEditorRef, Props>(function TreatmentPlanEditor({
  appointmentId, slug, procedures, existingPlan, hideActions, availableProducts = [],
}, ref) {
  const [sessions,  setSessions]  = useState<EditorSession[]>(() => fromExisting(existingPlan))
  const [notes,     setNotes]     = useState(existingPlan?.notes ?? '')
  const [msg,       setMsg]       = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isPlanLocked = ['PROPOSED', 'ACCEPTED', 'COMPLETED'].includes(existingPlan?.status ?? '')

  const grandTotal = sessions.reduce(
    (sum, s) => sum + s.procs.reduce((ps, p) => ps + p.price, 0),
    0,
  )

  // ── Handlers de sessão ────────────────────────────────────────────

  function addSession() {
    setSessions(prev => [...prev, { localId: uid(), procs: [] }])
  }

  function duplicateSession(sessLocalId: string) {
    setSessions(prev => {
      const idx = prev.findIndex(s => s.localId === sessLocalId)
      if (idx === -1) return prev
      const copy: EditorSession = {
        localId: uid(),
        procs:   prev[idx]!.procs.map(p => ({ ...p, localId: uid() })),
      }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  function removeSession(sessLocalId: string) {
    setSessions(prev => prev.filter(s => s.localId !== sessLocalId))
  }

  // ── Handlers de procedimento ──────────────────────────────────────

  function addProc(sessLocalId: string) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: [...s.procs, { localId: uid(), procedureId: '', name: '', price: 0, products: [] }],
      }
    ))
  }

  function changeProcedure(sessLocalId: string, procLocalId: string, id: string, name: string, price: number, products: EditorProduct[]) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.map(p =>
          p.localId !== procLocalId ? p : { ...p, procedureId: id, name, price, products }
        ),
      }
    ))
  }

  function changePrice(sessLocalId: string, procLocalId: string, price: number) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.map(p =>
          p.localId !== procLocalId ? p : { ...p, price }
        ),
      }
    ))
  }

  function removeProc(sessLocalId: string, procLocalId: string) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.filter(p => p.localId !== procLocalId),
      }
    ))
  }

  function changeProductQty(sessLocalId: string, procLocalId: string, prodLocalId: string, qty: number) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.map(p =>
          p.localId !== procLocalId ? p : {
            ...p,
            products: p.products.map(pr => pr.localId !== prodLocalId ? pr : { ...pr, quantity: qty }),
          }
        ),
      }
    ))
  }

  function removeProduct(sessLocalId: string, procLocalId: string, prodLocalId: string) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.map(p =>
          p.localId !== procLocalId ? p : {
            ...p,
            products: p.products.filter(pr => pr.localId !== prodLocalId),
          }
        ),
      }
    ))
  }

  function addProduct(sessLocalId: string, procLocalId: string, productId: string, name: string, unit: string) {
    setSessions(prev => prev.map(s =>
      s.localId !== sessLocalId ? s : {
        ...s,
        procs: s.procs.map(p =>
          p.localId !== procLocalId ? p : {
            ...p,
            products: [...p.products, { localId: uid(), productId, name, unit, quantity: 1 }],
          }
        ),
      }
    ))
  }

  // ── Serialização para action ──────────────────────────────────────

  function toActionSessions(): PlanSessionInput[] {
    return sessions.map((s, i) => ({
      sortOrder:  i,
      procedures: s.procs
        .filter(p => p.procedureId)
        .map((p, j) => ({
          procedureId: p.procedureId,
          price:       p.price,
          sortOrder:   j,
          products:    p.products.map(pr => ({
            productId: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity,
          })),
        })),
    }))
  }

  useImperativeHandle(ref, () => ({
    getSessions: toActionSessions,
    getNotes:    () => notes,
  }))

  // ── Salvar rascunho ───────────────────────────────────────────────

  function handleSave() {
    startTransition(async () => {
      setMsg(null)
      const result = await saveTreatmentPlan(appointmentId, toActionSessions(), notes, slug)
      setMsg(result.error ? `Erro: ${result.error}` : 'Rascunho salvo.')
    })
  }

  // ── Enviar para recepção ──────────────────────────────────────────

  function handlePropose() {
    if (!existingPlan?.id && sessions.length === 0) {
      setMsg('Adicione pelo menos uma sessão antes de enviar.')
      return
    }
    startTransition(async () => {
      setMsg(null)
      const saveResult = await saveTreatmentPlan(appointmentId, toActionSessions(), notes, slug)
      if (saveResult.error) { setMsg(`Erro: ${saveResult.error}`); return }
      const propResult = await proposeTreatmentPlan(saveResult.planId!, slug)
      if ((propResult as any)?.error) setMsg(`Erro: ${(propResult as any).error}`)
      else setMsg('Plano enviado para a recepção.')
    })
  }

  // ── Render ────────────────────────────────────────────────────────

  if (isPlanLocked) {
    // Modo leitura: plano já foi enviado/aprovado
    return (
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Tratamento</h3>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#2a8a5c', background: '#f0faf4', border: '1px solid #b8e8cc', borderRadius: 6, padding: '2px 8px' }}>
            {existingPlan?.status === 'PROPOSED' ? 'Aguardando checkout' : 'Em execução'}
          </span>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(existingPlan?.sessions ?? []).map((s, i) => (
            <div key={i} style={{ borderRadius: 10, border: '1px solid var(--hairline)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'var(--bg-app)', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Sessão {i + 1}</span>
                <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 700, marginLeft: 'auto' }}>
                  {fmtBRL(s.procedures.reduce((sum, p) => sum + p.price, 0))}
                </span>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {s.procedures.map((p, j) => (
                  <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text)' }}>
                    <span>{p.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmtBRL(p.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {existingPlan?.notes && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 12px', background: 'var(--bg-app)', borderRadius: 8 }}>
              "{existingPlan.notes}"
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Tratamento</h3>
        {grandTotal > 0 && (
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.01em' }}>
            {fmtBRL(grandTotal)}
          </span>
        )}
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Sessões */}
        {sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 16px', borderRadius: 12, border: '2px dashed var(--hairline)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 10 }}>Nenhuma sessão criada ainda.</p>
            <button type="button" onClick={addSession} className="btn-primary" style={{ fontSize: 12, justifyContent: 'center' }}>
              <Plus size={13} /> Nova sessão
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map((sess, i) => (
                <SessionCard
                  key={sess.localId}
                  session={sess}
                  index={i}
                  total={sess.procs.reduce((s, p) => s + p.price, 0)}
                  procedures={procedures}
                  availableProducts={availableProducts}
                  onAddProc={addProc}
                  onChangeProcedure={changeProcedure}
                  onChangePrice={changePrice}
                  onRemoveProc={removeProc}
                  onDuplicate={duplicateSession}
                  onRemove={removeSession}
                  onChangeProductQty={changeProductQty}
                  onRemoveProduct={removeProduct}
                  onAddProduct={addProduct}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addSession}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 10,
                border: '1.5px dashed var(--brand)', background: 'var(--brand-soft)',
                color: 'var(--brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Plus size={13} /> Nova sessão
            </button>
          </>
        )}

        {/* Observações */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6 }}>OBSERVAÇÕES DA PROFISSIONAL</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Recomendações, contraindicações, observações clínicas…"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border)', fontSize: 13,
              background: 'var(--surface)', color: 'var(--text)', outline: 'none',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Ações */}
        {!hideActions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={handleSave} disabled={isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
              <Save size={13} /> Salvar rascunho
            </button>
            <button type="button" onClick={handlePropose} disabled={isPending || sessions.length === 0}
              className="btn-primary" style={{ justifyContent: 'center' }}>
              <Send size={13} /> Enviar para recepção
            </button>
          </div>
        )}

        {msg && (
          <p style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith('Erro') ? '#dc2626' : 'var(--success)' }}>
            {msg}
          </p>
        )}
      </div>
    </div>
  )
})
