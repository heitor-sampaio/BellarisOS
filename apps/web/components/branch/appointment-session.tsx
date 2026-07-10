'use client'

import { useActionState, useState, useRef, useMemo, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, X, Loader2, AlertTriangle,
  Plus, Search, Trash2, Pencil, CheckCircle2, Play,
  XCircle, Clock, Lock, LockOpen, Send,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  checkinAppointment,
  startAppointment,
  finishSession,
  confirmPayment,
  cancelAppointmentSession,
  saveDraftNotes,
  reassignProfessional,
} from '@/actions/appointments'
import { generateEvaluationPlan } from '@/actions/treatment-plans'
import type { AnamnesisData } from '@/actions/treatment-plans'
import type { GeneralAnamnesis } from '@/components/branch/anamnesis-tab'
import { AnamnesisTab } from '@/components/branch/anamnesis-tab'
import { AnamnesisFormRenderer, type AnamnesisAnswers } from '@/components/branch/anamnesis-form-renderer'
import { AttendanceRecordCard } from '@/components/branch/attendance-record-card'
import { saveProcedureAttendance } from '@/actions/anamnesis'
import type { AnamnesisRow } from '@/lib/anamnesis'
import { TreatmentPlanEditor } from '@/components/branch/treatment-plan-editor'
import type { TreatmentProcedure, TreatmentPackage, ExistingPlan, TreatmentPlanEditorRef } from '@/components/branch/treatment-plan-editor'

// -- Types ----------------------------------------------------------------------

export interface SessionAppointment {
  id:                  string
  status:              string
  scheduledAt:         string
  startedAt:           string | null
  completedAt:         string | null
  cancelledAt:         string | null
  cancellationReason:  string | null
  price:               number
  durationMin:         number
  clientNotes:         string | null
  procedureName:       string
  procedureCategory:   string
  professionalId:      string
  professionalName:    string
  roomName:            string | null
  savedNotes:          string | null
  savedIntercurrences: string | null
  isEvaluation:        boolean
  complaints:          string | null
  clientConfirmedAt:   string | null
  clientRating:        number | null
  procedureRating:     number | null
  clientFeedback:      string | null
}

export interface SessionClient {
  id:        string
  name:      string
  phone:     string | null
  birthDate: string | null
  tags:      string[]
  notes:     string | null
  document:  string | null
}

export interface SessionProduct {
  productId: string
  name:      string
  unit:      string
  quantity:  number
}

export interface AvailableProduct {
  id:   string
  name: string
  unit: string
}

export interface SessionProfessional {
  id:   string
  name: string
}

export interface HistoryEntry {
  id:            string
  changedByName: string
  action:        string
  description:   string
  createdAt:     string
}

interface Props {
  appointment:        SessionAppointment
  client:             SessionClient
  anamnesis:          GeneralAnamnesis | null
  anamnesisForm:      { name: string; rows: AnamnesisRow[] } | null
  anamnesisAnswers:   Record<string, unknown>
  attendanceForm:     { name: string; rows: AnamnesisRow[] } | null
  attendanceAnswers:  Record<string, unknown>
  products:           SessionProduct[]
  availableProducts:  AvailableProduct[]
  professionals:      SessionProfessional[]
  history:            HistoryEntry[]
  branchId:           string
  slug:               string
  canCheckin:         boolean
  canManage:          boolean
  canReassign:        boolean
  canPayment:         boolean
  isProfessional:     boolean
  paymentTransaction: { id: string; paymentMethod: string; amount: number } | null
  treatmentProcedures:   TreatmentProcedure[]
  treatmentPackages:     TreatmentPackage[]
  existingPlan:          ExistingPlan | null
  procedureProductsMap:  Record<string, { productId: string; name: string; unit: string; quantity: number }[]>
  isPartOfPlan?:         boolean
}

// -- Helpers -------------------------------------------------------------------

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function calcAge(birthDate: string | null) {
  if (!birthDate) return null
  return Math.floor((Date.now() - new Date(birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
}

function fmtTimer(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function realDurationMin(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null
  return Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000)
}

const STATUS_OVERLINE: Record<string, { label: string; color: string }> = {
  SCHEDULED:   { label: 'Agendado',          color: '#6b7280' },
  CONFIRMED:   { label: 'Confirmado',         color: '#3a6bcc' },
  IN_PROGRESS: { label: 'Atendimento em andamento', color: 'var(--brand)' },
  COMPLETED:   { label: 'Concluído',          color: '#2a8a5c' },
  CANCELLED:   { label: 'Cancelado',          color: 'var(--warning)' },
  NO_SHOW:     { label: 'Não compareceu',     color: '#9ca3af' },
}

const PAYMENT_METHODS = [
  { value: 'PIX',             label: 'Pix' },
  { value: 'CASH',            label: 'Dinheiro' },
  { value: 'DEBIT_CARD',      label: 'Débito' },
  { value: 'CREDIT_CARD',     label: 'Crédito' },
  { value: 'INTERNAL_CREDIT', label: 'Crédito interno' },
]

// -- Modais --------------------------------------------------------------------

function CancelModal({ appointmentId, slug, onClose }: { appointmentId: string; slug: string; onClose: () => void }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(cancelAppointmentSession, null)
  if (state !== null && !state?.error && !pending) { onClose(); router.refresh(); return null }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 460, padding: 0, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', flex: 1 }}>Cancelar atendimento</h2>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={15} /></button>
        </div>
        <form action={action} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="appointment_id" value={appointmentId} />
          <input type="hidden" name="slug" value={slug} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Motivo do cancelamento *</label>
            <textarea name="cancellation_reason" required rows={3} placeholder="Descreva o motivo…" className="field" style={{ resize: 'vertical' }} />
          </div>
          {state?.error && <p style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn-secondary"><X size={13} /> Voltar</button>
            <button type="submit" disabled={pending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--warning)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
              {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Modal 1: Profissional confirma conclusão clínica (sem pagamento)
function FinishModal({ appointmentId, slug, initialNotes, initialIntercurrences, insumos, onClose }: {
  appointmentId: string; slug: string
  initialNotes: string | null; initialIntercurrences: string | null
  insumos: SessionProduct[]; onClose: () => void
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(finishSession, null)
  if (state !== null && !state?.error && !pending) { onClose(); router.refresh(); return null }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 500, padding: 0, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={16} style={{ color: '#2a8a5c' }} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Finalizar atendimento</h2>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 1 }}>O pagamento será confirmado pela recepcionista.</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={15} /></button>
        </div>
        <form action={action} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="hidden" name="appointment_id" value={appointmentId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="products_used" value={JSON.stringify(insumos)} />
          <div style={{ padding: '12px 16px', borderRadius: 10, background: '#f0faf4', border: '1px solid #b8e8cc' }}>
            <p style={{ fontSize: 13, color: '#2a8a5c', fontWeight: 600 }}>O procedimento foi realizado com sucesso?</p>
            <p style={{ fontSize: 12, color: '#4b7a62', marginTop: 3 }}>Confirme para liberar o cliente. Adicione observações se necessário.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Observações finais <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(opcional)</span></label>
            <textarea name="notes" rows={3} defaultValue={initialNotes ?? ''} placeholder="Técnicas, áreas tratadas, produtos utilizados…" className="field" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Intercorrências <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(opcional)</span></label>
            <textarea name="intercurrences" rows={2} defaultValue={initialIntercurrences ?? ''} placeholder="Reações ou observações…" className="field" style={{ resize: 'vertical' }} />
          </div>
          {state?.error && <p style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-secondary"><X size={13} /> Voltar</button>
            <button type="submit" disabled={pending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 9, border: 'none', background: '#2a8a5c', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', minWidth: 180, justifyContent: 'center' }}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {pending ? 'Finalizando…' : 'Confirmar conclusão'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Modal 2: Recepcionista/admin confirma pagamento
function PaymentModal({ appointmentId, slug, price, onClose }: {
  appointmentId: string; slug: string; price: number; onClose: () => void
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(confirmPayment, null)
  if (state !== null && !state?.error && !pending) { onClose(); router.refresh(); return null }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: 0, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={16} style={{ color: 'var(--brand)' }} />
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', flex: 1 }}>Confirmar pagamento</h2>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={15} /></button>
        </div>
        <form action={action} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="hidden" name="appointment_id" value={appointmentId} />
          <input type="hidden" name="slug" value={slug} />
          <div className="form-2col">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="field-label">Forma de pagamento *</label>
              <select name="payment_method" className="field" defaultValue="PIX">
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="field-label">Valor (R$)</label>
              <input type="number" defaultValue={price} step="0.01" min="0" className="field" readOnly
                style={{ background: 'var(--bg-app)', color: 'var(--text-muted)', fontWeight: 700 }} />
            </div>
          </div>
          {state?.error && <p style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-secondary"><X size={13} /> Voltar</button>
            <button type="submit" disabled={pending} className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', fontSize: 13, minWidth: 170, justifyContent: 'center' }}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {pending ? 'Registrando…' : 'Confirmar pagamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// -- Insumos -------------------------------------------------------------------

function InsumoCard({ items, available, checkedIds, onToggle, onChangeQty, onAdd, onRemove, readonly, embedded }: {
  items:       SessionProduct[]
  available:   AvailableProduct[]
  checkedIds:  Set<string>
  onToggle:    (id: string) => void
  onChangeQty: (id: string, qty: number) => void
  onAdd:       (p: AvailableProduct) => void
  onRemove:    (id: string) => void
  readonly:    boolean
  embedded?:   boolean
}) {
  const [adding,  setAdding]  = useState(false)
  const [search,  setSearch]  = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const alreadyIn = useMemo(() => new Set(items.map(i => i.productId)), [items])
  const filtered  = useMemo(() => {
    const q = search.toLowerCase()
    return available.filter(p => !alreadyIn.has(p.id) && p.name.toLowerCase().includes(q))
  }, [available, search, alreadyIn])

  return (
    <div className={embedded ? '' : 'card'} style={embedded ? { position: 'relative' } : { padding: 0, overflow: 'hidden' }}>
      {embedded ? (
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>Baixa automática no estoque</p>
      ) : (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Insumos utilizados</h3>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 500 }}>Baixa automática no estoque</span>
        </div>
      )}

      {adding && !readonly && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--hairline)', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--brand)', borderRadius: 8, padding: '6px 10px', background: 'var(--surface)' }}>
            <Search size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar produto…"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', width: '100%' }} />
            <button type="button" onClick={() => { setAdding(false); setSearch('') }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: 0 }}>
              <X size={13} />
            </button>
          </div>
          {filtered.length > 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% - 2px)', left: 16, right: 16, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', maxHeight: 200, overflowY: 'auto' }}>
              {filtered.map((p, i) => (
                <button key={p.id} type="button" onMouseDown={() => { onAdd(p); setSearch(''); setAdding(false) }}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: i < filtered.length - 1 ? '1px solid var(--hairline)' : 'none', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: items.length === 0 ? '20px' : '0 0 4px' }}>
        {items.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-faint)', textAlign: 'center' }}>Nenhum insumo registrado.</p>
        ) : items.map((item, i) => {
          const checked = checkedIds.has(item.productId)
          return (
            <div key={item.productId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: i < items.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
              {/* Checkbox */}
              <div
                onClick={() => !readonly && onToggle(item.productId)}
                style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  border: `2px solid ${checked ? 'var(--brand)' : 'var(--border)'}`,
                  background: checked ? 'var(--brand)' : 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: readonly ? 'default' : 'pointer', transition: 'all 0.15s',
                }}
              >
                {checked && <Check size={11} color="#fff" strokeWidth={3} />}
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: checked ? 'var(--text)' : 'var(--text-faint)', lineHeight: 1.3 }}>{item.name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{item.unit}</p>
              </div>
              {/* Qty */}
              {readonly || !checked ? (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: checked ? 'var(--text-muted)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                  {item.quantity} {item.unit}
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="number" step="0.001" min="0" defaultValue={item.quantity}
                    onBlur={e => {
                      const v = parseFloat(e.target.value.replace(',', '.'))
                      if (!isNaN(v) && v >= 0) onChangeQty(item.productId, v)
                    }}
                    style={{ width: 68, textAlign: 'right', fontSize: 13, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 7, padding: '4px 8px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                    onFocus={e => e.target.select()} />
                  <span style={{ fontSize: 11.5, color: 'var(--text-faint)', minWidth: 24 }}>{item.unit}</span>
                  <button type="button" onClick={() => onRemove(item.productId)}
                    style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, border: '1px solid var(--border)', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#dc2626' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!readonly && (
        <div style={{ padding: '10px 20px', borderTop: items.length > 0 ? '1px solid var(--hairline)' : 'none' }}>
          <button type="button"
            onClick={() => { setAdding(v => !v); setTimeout(() => searchRef.current?.focus(), 50) }}
            style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> Adicionar insumo
          </button>
        </div>
      )}
    </div>
  )
}

// -- Observações ---------------------------------------------------------------

function ObservacoesCard({ appointmentId, initialNotes, initialIntercurrences, readonly }: {
  appointmentId: string; initialNotes: string | null; initialIntercurrences: string | null; readonly: boolean
}) {
  const [state, action, pending] = useActionState(saveDraftNotes, null)
  const saved = state !== null && !state?.error && !pending
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Observações do atendimento</h3>
      </div>
      <form action={action} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="hidden" name="appointment_id" value={appointmentId} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label">O que foi realizado</label>
          <textarea name="notes" rows={4} defaultValue={initialNotes ?? ''} readOnly={readonly}
            placeholder={readonly ? '—' : 'Descreva técnicas, áreas tratadas, produtos utilizados…'}
            className="field" style={{ resize: 'vertical', background: readonly ? 'var(--bg-app)' : undefined }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label">Intercorrências</label>
          <textarea name="intercurrences" rows={2} defaultValue={initialIntercurrences ?? ''} readOnly={readonly}
            placeholder={readonly ? '—' : 'Reações, intercorrências ou observações…'}
            className="field" style={{ resize: 'vertical', background: readonly ? 'var(--bg-app)' : undefined }} />
        </div>
        {!readonly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="submit" disabled={pending} className="btn-secondary" style={{ gap: 5, fontSize: 12 }}>
              {pending ? <Loader2 size={12} className="animate-spin" /> : null}
              {pending ? 'Salvando…' : 'Salvar rascunho'}
            </button>
            {saved && <span style={{ fontSize: 12, color: '#2a8a5c', fontWeight: 600 }}>✓ Salvo</span>}
            {state?.error && <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>{state.error}</span>}
          </div>
        )}
      </form>
    </div>
  )
}

// -- Dores / Queixas do cliente (controlado pelo pai) --------------------------

function DorasCard({ value, onChange, readonly }: {
  value:    string
  onChange: (v: string) => void
  readonly: boolean
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Dores do cliente</h3>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>Queixas e necessidades relatadas pelo cliente</p>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <textarea
          rows={4} value={value} readOnly={readonly}
          onChange={e => onChange(e.target.value)}
          placeholder={readonly ? '—' : 'Anote o que o cliente relatou: queixas estéticas, objetivos, histórico de tratamentos anteriores…'}
          className="field" style={{ resize: 'vertical', background: readonly ? 'var(--bg-app)' : undefined }}
        />
      </div>
    </div>
  )
}

// -- Anamnese inline para avaliação (sempre em modo edição, controlado) ---------

const EVAL_SKIN_TYPES = [
  { value: '',         label: 'Não informado' },
  { value: 'normal',   label: 'Normal' },
  { value: 'seca',     label: 'Seca' },
  { value: 'oleosa',   label: 'Oleosa' },
  { value: 'mista',    label: 'Mista' },
  { value: 'sensivel', label: 'Sensível' },
]

function EvaluationAnamnesisFields({
  value,
  onChange,
}: {
  value:    AnamnesisData
  onChange: (v: AnamnesisData) => void
}) {
  function set(field: keyof AnamnesisData, val: string | boolean) {
    onChange({ ...value, [field]: val })
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Anamnese</h3>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>Ficha clínica do cliente</p>
      </div>
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-3col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Tipo de pele</label>
            <select value={value.skinType} onChange={e => set('skinType', e.target.value)} className="field">
              {EVAL_SKIN_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Usa protetor solar?</label>
            <select value={value.useSunscreen ? 'true' : 'false'} onChange={e => set('useSunscreen', e.target.value === 'true')} className="field">
              <option value="false">Não</option>
              <option value="true">Sim</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Grávida / amamentando?</label>
            <select value={value.isPregnantOrBreastfeeding ? 'true' : 'false'} onChange={e => set('isPregnantOrBreastfeeding', e.target.value === 'true')} className="field">
              <option value="false">Não</option>
              <option value="true">Sim</option>
            </select>
          </div>
        </div>
        <div className="form-2col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Alergias</label>
            <textarea rows={3} value={value.allergies} onChange={e => set('allergies', e.target.value)}
              placeholder="Ex: látex, penicilina…" className="field" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Medicamentos em uso</label>
            <textarea rows={3} value={value.medications} onChange={e => set('medications', e.target.value)}
              placeholder="Ex: anticoagulantes, isotretinoína…" className="field" style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div className="form-2col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Condições de saúde</label>
            <textarea rows={3} value={value.healthConditions} onChange={e => set('healthConditions', e.target.value)}
              placeholder="Ex: diabetes, hipertensão…" className="field" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Procedimentos anteriores</label>
            <textarea rows={3} value={value.previousProcedures} onChange={e => set('previousProcedures', e.target.value)}
              placeholder="Ex: botox há 6 meses…" className="field" style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label">Observações gerais</label>
          <textarea rows={2} value={value.observations} onChange={e => set('observations', e.target.value)}
            placeholder="Anotações adicionais relevantes…" className="field" style={{ resize: 'vertical' }} />
        </div>
      </div>
    </div>
  )
}

// -- Linha de anamnese ---------------------------------------------------------

// -- Main component ------------------------------------------------------------

export function AppointmentSession({
  appointment, client, anamnesis, anamnesisForm, anamnesisAnswers, attendanceForm, attendanceAnswers, products, availableProducts,
  professionals, history, branchId, slug,
  canCheckin, canManage, canReassign, canPayment, isProfessional, paymentTransaction,
  treatmentProcedures, treatmentPackages, existingPlan, procedureProductsMap,
  isPartOfPlan = false,
}: Props) {
  const router = useRouter()

  const [showCancel,    setShowCancel]    = useState(false)
  const [showFinish,    setShowFinish]    = useState(false)
  const [showPayment,   setShowPayment]   = useState(false)
  const [starting,      setStarting]      = useState(false)
  const [checkingIn,    setCheckingIn]    = useState(false)
  const [insumos,       setInsumos]       = useState<SessionProduct[]>(products)
  const [checkedIds,    setCheckedIds]    = useState<Set<string>>(() => new Set(products.map(p => p.productId)))
  const [editingProf,   setEditingProf]   = useState(false)
  const [savingProf,    setSavingProf]    = useState(false)
  const [selectedProfId, setSelectedProfId] = useState(appointment.professionalId)
  const [elapsed,        setElapsed]       = useState(0)
  const [isUnlocked,     setIsUnlocked]    = useState(false)

  // Estado do formulário unificado de avaliação
  const [evalComplaints,         setEvalComplaints]         = useState(appointment.complaints ?? '')
  const [evalAnamnesis,          setEvalAnamnesis]          = useState<AnamnesisData>({
    skinType:                  anamnesis?.skinType                  ?? '',
    allergies:                 anamnesis?.allergies                 ?? '',
    medications:               anamnesis?.medications               ?? '',
    healthConditions:          anamnesis?.healthConditions          ?? '',
    previousProcedures:        anamnesis?.previousProcedures        ?? '',
    isPregnantOrBreastfeeding: anamnesis?.isPregnantOrBreastfeeding ?? false,
    useSunscreen:              anamnesis?.useSunscreen              ?? false,
    observations:              anamnesis?.observations              ?? '',
  })
  const [evalPlanNotes,          setEvalPlanNotes]          = useState(existingPlan?.notes ?? '')
  const [evalSessionNotes,       setEvalSessionNotes]       = useState(appointment.savedNotes ?? '')
  const [evalSessionInterc,      setEvalSessionInterc]      = useState(appointment.savedIntercurrences ?? '')
  const [generating,             setGenerating]             = useState(false)
  const [genError,               setGenError]               = useState<string | null>(null)
  const evalEditorRef = useRef<TreatmentPlanEditorRef>(null)

  const selectedProfName = professionals.find(p => p.id === selectedProfId)?.name ?? appointment.professionalName

  const status    = appointment.status
  const overline  = STATUS_OVERLINE[status] ?? STATUS_OVERLINE['SCHEDULED']!
  const isActive  = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'].includes(status)
  const isDone    = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)
  const age       = calcAge(client.birthDate)
  // Somente BRANCH_ADMIN e NETWORK_ADMIN podem desbloquear edição pós-conclusão
  const editLocked = isDone && !isUnlocked

  const confirmedInsumos = useMemo(
    () => insumos.filter(i => checkedIds.has(i.productId)),
    [insumos, checkedIds],
  )

  // Live timer
  useEffect(() => {
    if (status !== 'IN_PROGRESS' || !appointment.startedAt) return
    const startMs = new Date(appointment.startedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [status, appointment.startedAt])

  async function handleCheckin() {
    setCheckingIn(true)
    await checkinAppointment(appointment.id, slug)
    router.refresh()
    setCheckingIn(false)
  }

  async function handleStart() {
    setStarting(true)
    await startAppointment(appointment.id, slug)
    router.refresh()
    setStarting(false)
  }

  // Bloco "Dados do procedimento" (profissional com reassign, horários, sala/valor, duração).
  const procedureNode = (
    <div className="form-2col">
      {!isProfessional && (
        <>
          <div>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Profissional</p>
            {editingProf && canReassign ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select value={selectedProfId} onChange={e => setSelectedProfId(e.target.value)} className="field" style={{ fontSize: 12.5, padding: '4px 8px', height: 30 }} autoFocus>
                  {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button type="button" disabled={savingProf}
                  onClick={async () => { setSavingProf(true); await reassignProfessional(appointment.id, selectedProfId, slug); setSavingProf(false); setEditingProf(false); router.refresh() }}
                  style={{ height: 30, padding: '0 10px', borderRadius: 6, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {savingProf ? <Loader2 size={11} className="animate-spin" /> : 'Salvar'}
                </button>
                <button type="button" onClick={() => { setEditingProf(false); setSelectedProfId(appointment.professionalId) }}
                  style={{ height: 30, width: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{selectedProfName}</p>
                {canReassign && !isDone && professionals.length > 1 && (
                  <button type="button" onClick={() => setEditingProf(true)}
                    style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Pencil size={10} />
                  </button>
                )}
              </div>
            )}
          </div>
          <div>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Procedimento</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{appointment.procedureName}{appointment.procedureCategory ? ` · ${appointment.procedureCategory}` : ''}</p>
          </div>
        </>
      )}

      <div>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Agendado para</p>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {format(new Date(appointment.scheduledAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>

      <div>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Duração prevista</p>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock size={12} style={{ color: 'var(--text-faint)' }} /> {appointment.durationMin} min
        </p>
      </div>

      {!isProfessional && (
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{appointment.roomName ? 'Sala / Cabine' : 'Valor'}</p>
          {appointment.roomName ? (
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{appointment.roomName}</p>
          ) : (
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{fmtBRL(appointment.price)}</p>
          )}
        </div>
      )}

      {appointment.startedAt && (
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Início real</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{format(new Date(appointment.startedAt), 'HH:mm', { locale: ptBR })}</p>
        </div>
      )}
      {appointment.completedAt && (
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Término</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{format(new Date(appointment.completedAt), 'HH:mm', { locale: ptBR })}</p>
        </div>
      )}
      {(() => {
        const real = realDurationMin(appointment.startedAt, appointment.completedAt)
        if (real === null) return null
        const delta = real - appointment.durationMin
        return (
          <div style={{ gridColumn: 'span 2' }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Duração real</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={13} style={{ color: 'var(--brand)' }} /> {real} min
              </p>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: delta <= 0 ? '#dcfce7' : delta <= 10 ? '#fef3c7' : '#fee2e2',
                color:      delta <= 0 ? '#16a34a' : delta <= 10 ? '#d97706' : '#dc2626' }}>
                {delta === 0 ? '= previsto' : delta > 0 ? `▲ ${delta} min vs previsto` : `▼ ${Math.abs(delta)} min vs previsto`}
              </span>
            </div>
          </div>
        )
      })()}
    </div>
  )

  // Ficha de atendimento = documento único (4 seções): Dados do cliente (+ anamnese geral),
  // Dados do procedimento (com insumos), Ficha de anamnese (construtor), Ficha de atendimento (construtor).
  // insumosNode só é passado no fluxo de atendimento normal (avaliações não consomem insumos).
  const renderFichaCard = (insumosNode?: ReactNode) => (
    <AttendanceRecordCard
      client={{ name: client.name, document: client.document, birthDate: client.birthDate, phone: client.phone }}
      generalAnamnesis={
        <AnamnesisTab embedded anamnesis={anamnesis} clientId={client.id} branchId={branchId} slug={slug} canEdit={canManage} />
      }
      procedureNode={procedureNode}
      insumos={insumosNode ?? null}
      anamnesis={anamnesisForm && anamnesisForm.rows.length > 0 ? {
        name: anamnesisForm.name,
        node: (
          <AnamnesisFormRenderer
            appointmentId={appointment.id} slug={slug}
            formName={anamnesisForm.name} rows={anamnesisForm.rows}
            initial={anamnesisAnswers as AnamnesisAnswers} canEdit={canManage}
          />
        ),
      } : null}
      attendance={attendanceForm && attendanceForm.rows.length > 0 ? {
        name: attendanceForm.name,
        node: (
          <AnamnesisFormRenderer
            appointmentId={appointment.id} slug={slug}
            formName={attendanceForm.name} rows={attendanceForm.rows}
            initial={attendanceAnswers as AnamnesisAnswers} canEdit={canManage}
            saveAction={saveProcedureAttendance}
          />
        ),
      } : null}
    />
  )

  const insumosSection = (
    <InsumoCard
      embedded
      items={insumos}
      available={availableProducts}
      checkedIds={checkedIds}
      readonly={isDone}
      onToggle={id => setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })}
      onChangeQty={(id, qty) => setInsumos(prev => prev.map(i => i.productId === id ? { ...i, quantity: qty } : i))}
      onAdd={p => setInsumos(prev => [...prev, { productId: p.id, name: p.name, unit: p.unit, quantity: 1 }])}
      onRemove={id => { setInsumos(prev => prev.filter(i => i.productId !== id)); setCheckedIds(prev => { const n = new Set(prev); n.delete(id); return n }) }}
    />
  )

  return (
    <>
      {showCancel  && <CancelModal appointmentId={appointment.id} slug={slug} onClose={() => setShowCancel(false)} />}
      {showFinish  && (
        <FinishModal
          appointmentId={appointment.id} slug={slug}
          initialNotes={appointment.savedNotes} initialIntercurrences={appointment.savedIntercurrences}
          insumos={confirmedInsumos}
          onClose={() => setShowFinish(false)}
        />
      )}
      {showPayment && (
        <PaymentModal
          appointmentId={appointment.id} slug={slug} price={appointment.price}
          onClose={() => setShowPayment(false)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* -- Top bar --------------------------------------------------- */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <Link href={`/${slug}/agenda`} style={{ display: 'flex', alignItems: 'center', marginTop: 6, color: 'var(--text-faint)', textDecoration: 'none', flexShrink: 0 }}>
            <ArrowLeft size={18} />
          </Link>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: overline.color, marginBottom: 3 }}>
              {overline.label}
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {appointment.procedureName}
            </h1>
          </div>

          {/* Ações do topo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginTop: 4 }}>
            {/* Timer IN_PROGRESS */}
            {status === 'IN_PROGRESS' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.01em' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)', display: 'inline-block', animation: 'pulse 1.4s ease-in-out infinite' }} />
                {fmtTimer(elapsed)}
              </div>
            )}

            {/* Check-in (SCHEDULED + canCheckin) */}
            {status === 'SCHEDULED' && canCheckin && (
              <button type="button" onClick={handleCheckin} disabled={checkingIn}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {checkingIn ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {checkingIn ? 'Registrando…' : 'Check-in'}
              </button>
            )}

            {/* Iniciar (CONFIRMED + canManage) */}
            {status === 'CONFIRMED' && canManage && (
              <button type="button" onClick={handleStart} disabled={starting} className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, fontSize: 13 }}>
                {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {starting ? 'Iniciando…' : 'Iniciar atendimento'}
              </button>
            )}

            {/* Pausar (IN_PROGRESS — visual only) */}
            {status === 'IN_PROGRESS' && (
              <button type="button" className="btn-secondary" style={{ padding: '9px 16px', fontSize: 13, fontWeight: 700 }}>
                Pausar
              </button>
            )}

            {/* Finalizar (IN_PROGRESS + canManage) — conclui clinicamente */}
            {status === 'IN_PROGRESS' && canManage && (
              <button type="button" onClick={() => setShowFinish(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(195,77,107,.3)' }}>
                <CheckCircle2 size={14} /> Finalizar atendimento
              </button>
            )}

            {/* Confirmar pagamento (COMPLETED sem pagamento + canPayment) — oculto para sessões de plano */}
            {status === 'COMPLETED' && !paymentTransaction && canPayment && !isPartOfPlan && (
              <button type="button" onClick={() => setShowPayment(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(195,77,107,.3)' }}>
                <CheckCircle2 size={14} /> Confirmar pagamento
              </button>
            )}

            {/* Pagamento confirmado — badge informativo */}
            {status === 'COMPLETED' && paymentTransaction && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: '#f0faf4', border: '1px solid #b8e8cc' }}>
                <CheckCircle2 size={14} style={{ color: '#2a8a5c' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#2a8a5c' }}>Pago</span>
              </div>
            )}

            {/* Cancelar (qualquer ativo) */}
            {isActive && (canCheckin || canManage) && (
              <button type="button" onClick={() => setShowCancel(true)}
                className="btn-ghost" style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-faint)', gap: 5 }}>
                <XCircle size={14} /> Cancelar
              </button>
            )}
          </div>
        </div>

        {/* -- Client strip ----------------------------------------------- */}
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Avatar */}
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
              {initials(client.name)}
            </div>

            {/* Nome + info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{client.name}</span>
                {client.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: tag === 'VIP' ? 'var(--brand-soft)' : '#fef3c7',
                    color: tag === 'VIP' ? 'var(--brand)' : '#d97706',
                    border: `1px solid ${tag === 'VIP' ? 'var(--brand-soft-border)' : '#fde68a'}`,
                  }}>{tag}</span>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {[
                  age ? `${age} anos` : null,
                  anamnesis?.skinType ? `Pele ${anamnesis.skinType}` : null,
                  client.birthDate ? `Cliente desde ${format(new Date(client.birthDate), 'MMM yyyy', { locale: ptBR })}` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* Right badges */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              {anamnesis && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={11} strokeWidth={3} /> Anamnese revisada
                </span>
              )}
              {appointment.clientNotes && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                  Obs. da cliente
                </span>
              )}
            </div>
          </div>

          {appointment.clientNotes && (
            <>
              <div style={{ height: 1, background: 'var(--hairline)', margin: '12px 0' }} />
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Solicitação da cliente</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>{appointment.clientNotes}</p>
            </>
          )}
        </div>

        {/* -- Banner de bloqueio / edição -------------------------------- */}
        {isDone && (
          <div style={{
            padding: '12px 20px', borderRadius: 12,
            background: isUnlocked ? '#fffbeb' : 'var(--surface)',
            border: `1.5px solid ${isUnlocked ? '#fde68a' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: isUnlocked ? '#fef3c7' : 'var(--bg-app)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isUnlocked
                ? <LockOpen size={15} style={{ color: '#d97706' }} />
                : <Lock     size={15} style={{ color: 'var(--text-faint)' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: isUnlocked ? '#92400e' : 'var(--text-muted)' }}>
                {isUnlocked ? 'Editando registro finalizado' : 'Registro bloqueado para edição'}
              </p>
              <p style={{ fontSize: 11.5, color: isUnlocked ? '#b45309' : 'var(--text-faint)', marginTop: 2 }}>
                {isUnlocked
                  ? 'Todas as alterações serão registradas no histórico do atendimento.'
                  : 'Atendimento concluído. Apenas gerentes podem editar este registro.'}
              </p>
            </div>
            {canReassign && (
              isUnlocked ? (
                <button type="button" onClick={() => setIsUnlocked(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fde68a', background: 'transparent', color: '#92400e', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                  <Lock size={13} /> Bloquear
                </button>
              ) : (
                <button type="button" onClick={() => setIsUnlocked(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                  <LockOpen size={13} /> Editar registro
                </button>
              )
            )}
          </div>
        )}

        {/* -- Concluído / Cancelado banner ------------------------------- */}
        {isDone && (
          <div style={{
            padding: '14px 20px', borderRadius: 12,
            background: status === 'COMPLETED' ? '#f0faf4' : '#fef6f8',
            border: `1.5px solid ${status === 'COMPLETED' ? '#b8e8cc' : '#f0c5ce'}`,
          }}>
            {status === 'COMPLETED' && appointment.completedAt && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p style={{ fontSize: 13, color: '#2a8a5c', fontWeight: 600 }}>
                  ✓ Atendimento concluído em {format(new Date(appointment.completedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
                {paymentTransaction ? (
                  <p style={{ fontSize: 12, color: '#4b7a62' }}>
                    Pagamento confirmado — {PAYMENT_METHODS.find(m => m.value === paymentTransaction.paymentMethod)?.label ?? paymentTransaction.paymentMethod} · {fmtBRL(paymentTransaction.amount)}
                  </p>
                ) : isPartOfPlan ? (
                  <p style={{ fontSize: 12, color: '#4b7a62' }}>
                    Pagamento realizado no checkout do plano de tratamento.
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                    ⏳ Aguardando confirmação de pagamento pela recepcionista
                  </p>
                )}

                {/* Confirmação do cliente pelo app (prova que substitui a ficha de papel) */}
                {appointment.clientConfirmedAt ? (
                  <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid #cde8d9' }}>
                    <p style={{ fontSize: 12, color: '#2a8a5c', fontWeight: 700 }}>
                      ✓ Confirmado pelo cliente em {format(new Date(appointment.clientConfirmedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    {(appointment.procedureRating != null || appointment.clientRating != null) && (
                      <p style={{ fontSize: 12, color: '#4b7a62', marginTop: 2 }}>
                        {appointment.procedureRating != null && <>Procedimento {appointment.procedureRating}/5</>}
                        {appointment.procedureRating != null && appointment.clientRating != null && ' · '}
                        {appointment.clientRating != null && <>Profissional {appointment.clientRating}/5</>}
                      </p>
                    )}
                    {appointment.clientFeedback && (
                      <p style={{ fontSize: 12, color: '#4b7a62', marginTop: 2, fontStyle: 'italic' }}>
                        “{appointment.clientFeedback}”
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#d97706', fontWeight: 600, marginTop: 6, paddingTop: 8, borderTop: '1px solid #cde8d9' }}>
                    ⏳ Aguardando confirmação do cliente pelo app
                  </p>
                )}
              </div>
            )}
            {status === 'CANCELLED' && (
              <>
                <p style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 700 }}>Atendimento cancelado</p>
                {appointment.cancellationReason && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Motivo: {appointment.cancellationReason}</p>}
              </>
            )}
            {status === 'NO_SHOW' && <p style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>Cliente não compareceu.</p>}
          </div>
        )}

        {/* -- Conteúdo do atendimento (coluna única) --------------------- */}
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>


            {appointment.isEvaluation ? (() => {
              // Plano já gerado e enviado para recepção → modo leitura
              const planGenerated = ['PROPOSED', 'ACCEPTED', 'COMPLETED'].includes(existingPlan?.status ?? '')
              if (planGenerated) return (
                <>
                  {appointment.complaints && (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)' }}>
                        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Dores do cliente</h3>
                      </div>
                      <div style={{ padding: '16px 20px' }}>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{appointment.complaints}</p>
                      </div>
                    </div>
                  )}
                  {renderFichaCard()}
                  <TreatmentPlanEditor
                    appointmentId={appointment.id} slug={slug}
                    procedures={treatmentProcedures} servicePackages={treatmentPackages}
                    existingPlan={existingPlan} procedureProductsMap={procedureProductsMap}
                    availableProducts={availableProducts}
                  />
                  <ObservacoesCard
                    appointmentId={appointment.id}
                    initialNotes={appointment.savedNotes}
                    initialIntercurrences={appointment.savedIntercurrences}
                    readonly={editLocked}
                  />
                </>
              )

              // Plano ainda não gerado → formulário unificado
              return (
                <>
                  <DorasCard
                    value={evalComplaints}
                    onChange={setEvalComplaints}
                    readonly={editLocked}
                  />

                  <EvaluationAnamnesisFields
                    value={evalAnamnesis}
                    onChange={setEvalAnamnesis}
                  />

                  <TreatmentPlanEditor
                    appointmentId={appointment.id} slug={slug}
                    ref={evalEditorRef}
                    procedures={treatmentProcedures} servicePackages={treatmentPackages}
                    existingPlan={existingPlan} procedureProductsMap={procedureProductsMap}
                    availableProducts={availableProducts}
                    hideActions={true}
                    onPlanChange={(_items, notes) => setEvalPlanNotes(notes)}
                  />

                  {/* Observações do atendimento — controladas, sem save individual */}
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
                      <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Observações do atendimento</h3>
                    </div>
                    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label className="field-label">Anotações clínicas</label>
                        <textarea
                          rows={4} value={evalSessionNotes}
                          onChange={e => setEvalSessionNotes(e.target.value)}
                          placeholder="Técnicas utilizadas, regiões tratadas, evolução do cliente…"
                          className="field" style={{ resize: 'vertical' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label className="field-label">Intercorrências</label>
                        <textarea
                          rows={2} value={evalSessionInterc}
                          onChange={e => setEvalSessionInterc(e.target.value)}
                          placeholder="Reações, intercorrências ou observações…"
                          className="field" style={{ resize: 'vertical' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Botão único de geração */}
                  {canManage && (
                    <div className="card" style={{ padding: '20px 24px' }}>
                      {genError && (
                        <p style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 600, marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>
                          {genError}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={generating}
                        onClick={async () => {
                          setGenerating(true); setGenError(null)
                          const currentSessions = evalEditorRef.current?.getSessions() ?? []
                          const currentNotes    = evalEditorRef.current?.getNotes()    ?? evalPlanNotes
                          const res = await generateEvaluationPlan(
                            appointment.id,
                            evalComplaints,
                            evalAnamnesis,
                            currentSessions,
                            currentNotes,
                            evalSessionNotes,
                            evalSessionInterc,
                            slug,
                          )
                          setGenerating(false)
                          if (res.error) setGenError(res.error)
                          else router.refresh()
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                          padding: '14px 20px', borderRadius: 12, fontSize: 14, fontWeight: 800,
                          background: generating ? 'var(--bg-app)' : 'var(--brand)',
                          color:      generating ? 'var(--text-faint)' : '#fff',
                          border:     generating ? '1px solid var(--border)' : 'none',
                          cursor:     generating ? 'wait' : 'pointer',
                          boxShadow:  generating ? 'none' : '0 2px 12px rgba(195,77,107,0.3)',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {generating
                          ? <><Loader2 size={16} className="animate-spin" /> Gerando plano…</>
                          : <><Send size={16} /> Gerar Plano de Tratamento</>}
                      </button>
                      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'center', marginTop: 10 }}>
                        Salva todas as informações e envia o plano para a recepção realizar o checkout.
                      </p>
                    </div>
                  )}
                </>
              )
            })() : (
              <>
                {renderFichaCard(insumosSection)}

                <ObservacoesCard
                  appointmentId={appointment.id}
                  initialNotes={appointment.savedNotes}
                  initialIntercurrences={appointment.savedIntercurrences}
                  readonly={editLocked}
                />
              </>
            )}

            {/* Histórico */}
            <div className="card" style={{ padding: '18px 20px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                Histórico
              </p>
              {history.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--text-faint)', fontStyle: 'italic' }}>Nenhum registro ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {history.map((entry, idx) => {
                    const dt = new Date(entry.createdAt)
                    return (
                      <div key={entry.id} style={{ display: 'flex', gap: 14, paddingBottom: idx < history.length - 1 ? 14 : 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 18 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 3, background: entry.action === 'COMPLETED' ? '#2e7d32' : 'var(--brand)' }} />
                          {idx < history.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
                        </div>
                        <div style={{ flex: 1, paddingBottom: 2 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 1 }}>{entry.description}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                            {entry.changedByName} · {dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
