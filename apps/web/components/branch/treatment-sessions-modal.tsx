'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Calendar, Play, CheckCircle2, Loader2, ChevronRight, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  getClientPackageSessions,
  schedulePackageSession,
  getPlannedSessionAppointments,
  schedulePlanSession,
  getSchedulingBranchProfessionals,
  getSchedulingDaySlots,
} from '@/actions/appointments'
import { cancelTreatmentPlan } from '@/actions/treatment-plans'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────

type Session = {
  id:               string
  sessionNumber:    number
  status:           string
  appointmentId:    string | null
  scheduledAt:      string | null
  apptStatus:       string | null
  professionalName: string | null
  procedureName:    string | null
  procedureId?:     string
}

interface Props {
  // Package mode (client_packages)
  clientPackageId?: string
  // Plan mode (avulso treatment_plan)
  planId?:          string
  planStatus?:      string
  // Common
  packageName:      string
  totalSessions:    number
  usedSessions:     number
  clientId:         string
  procedureId:      string   // used in package mode; in plan mode may be per-session
  procedureName:    string
  price:            number
  durationMin:      number
  slug:             string
  branches:         { id: string; name: string }[]
  currentBranchId:  string
  role:             string
  onClose:          () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIME_SLOTS = Array.from({ length: 25 }, (_, i) => {
  const h = Math.floor(i / 2) + 8
  const m = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
})

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  AVAILABLE:   { label: 'Não agendado',  color: 'var(--text-faint)' },
  SCHEDULED:   { label: 'Agendado',      color: '#2563eb' },
  IN_PROGRESS: { label: 'Em andamento',  color: '#d97706' },
  USED:        { label: 'Realizada',     color: 'var(--success)' },
  COMPLETED:   { label: 'Realizada',     color: 'var(--success)' },
  CANCELLED:   { label: 'Cancelada',     color: '#dc2626' },
}

// ── Mini-scheduler inline ─────────────────────────────────────────────────────

function SessionScheduler({
  branches,
  currentBranchId,
  onSave,
  onCancel,
}: {
  branches:        { id: string; name: string }[]
  currentBranchId: string
  onSave:          (params: { branchId: string; professionalId: string; scheduledAt: string }) => Promise<{ error?: string }>
  onCancel:        () => void
}) {
  const [branchId,     setBranchId]     = useState(currentBranchId)
  const [profs,        setProfs]        = useState<{ id: string; name: string }[]>([])
  const [loadingProfs, setLoadingProfs] = useState(false)
  const [profId,       setProfId]       = useState('')
  const [date,         setDate]         = useState('')
  const [slots,        setSlots]        = useState<{ scheduledAt: string; durationMin: number; clientName: string | null }[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [time,         setTime]         = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    if (!branchId) return
    setLoadingProfs(true)
    setProfId('')
    setDate('')
    setSlots([])
    setTime('')
    getSchedulingBranchProfessionals(branchId).then(res => {
      setProfs(res.professionals)
      setLoadingProfs(false)
    })
  }, [branchId])

  useEffect(() => {
    if (!branchId || !profId || !date) return
    setLoadingSlots(true)
    setTime('')
    getSchedulingDaySlots(branchId, profId, date).then(res => {
      setSlots(res.slots)
      setLoadingSlots(false)
    })
  }, [branchId, profId, date])

  function isBooked(t: string) {
    const ms = new Date(`${date}T${t}:00-03:00`).getTime()
    return slots.find(s => {
      const start = new Date(s.scheduledAt).getTime()
      const end   = start + s.durationMin * 60000
      return ms >= start && ms < end
    }) ?? null
  }

  async function handleSave() {
    if (!branchId || !profId || !date || !time) return
    setSaving(true)
    setError(null)
    const result = await onSave({
      branchId,
      professionalId: profId,
      scheduledAt: new Date(`${date}T${time}:00-03:00`).toISOString(),
    })
    setSaving(false)
    if (result.error) setError(result.error)
  }

  const minDate = format(new Date(), 'yyyy-MM-dd')

  return (
    <div style={{ background: 'var(--bg-app)', borderRadius: 12, padding: '16px', marginTop: 10, border: '1px solid var(--border)' }}>

      {branches.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 8 }}>FILIAL</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {branches.map(b => (
              <button key={b.id} type="button" onClick={() => setBranchId(b.id)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: branchId === b.id ? 'var(--brand)' : 'var(--surface)',
                  color: branchId === b.id ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${branchId === b.id ? 'var(--brand)' : 'var(--border)'}`,
                }}>
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-2col" style={{ marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6 }}>PROFISSIONAL</p>
          {loadingProfs ? (
            <Loader2 size={14} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
          ) : (
            <select value={profId} onChange={e => setProfId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}>
              <option value="">Selecionar…</option>
              {profs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6 }}>DATA</p>
          <input type="date" min={minDate} value={date} onChange={e => setDate(e.target.value)}
            disabled={!profId}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' as const }} />
        </div>
      </div>

      {profId && date && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 8 }}>
            HORÁRIO {loadingSlots && <Loader2 size={10} style={{ display: 'inline', animation: 'spin 1s linear infinite' }} />}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {TIME_SLOTS.map(t => {
              const booked = isBooked(t)
              const sel    = time === t
              return (
                <button key={t} type="button" disabled={!!booked} onClick={() => setTime(t)}
                  style={{
                    padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: booked ? 'not-allowed' : 'pointer',
                    background: sel ? 'var(--brand)' : booked ? 'var(--bg-app)' : 'var(--surface)',
                    color: sel ? '#fff' : booked ? 'var(--text-faint)' : 'var(--text)',
                    border: `1px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                    textDecoration: booked ? 'line-through' : 'none',
                  }}>
                  {t}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginBottom: 10 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
          Cancelar
        </button>
        <button type="button" onClick={handleSave} disabled={saving || !branchId || !profId || !date || !time}
          className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
          {saving ? <><Loader2 size={13} className="animate-spin" /> Agendando…</> : 'Confirmar agendamento'}
        </button>
      </div>
    </div>
  )
}

// ── Modal principal ───────────────────────────────────────────────────────────

export function TreatmentSessionsModal({
  clientPackageId, planId, planStatus,
  packageName, totalSessions, usedSessions,
  clientId, procedureId, procedureName, price, durationMin,
  slug, branches, currentBranchId, role, onClose,
}: Props) {
  const router = useRouter()
  const [sessions,      setSessions]      = useState<Session[]>([])
  const [loading,       setLoading]       = useState(true)
  const [schedulingId,  setSchedulingId]  = useState<string | null>(null)
  const [showCancel,    setShowCancel]    = useState(false)
  const [cancelReason,  setCancelReason]  = useState('')
  const [cancelling,    setCancelling]    = useState(false)
  const [cancelError,   setCancelError]   = useState<string | null>(null)

  const isPlanMode = !!planId && !clientPackageId

  // Regra de cancelamento: plan ACCEPTED, multi-sessão → só NETWORK_ADMIN; sessão única → BRANCH_ADMIN+
  const isAccepted = planStatus === 'ACCEPTED'
  const canCancelTreatment = isPlanMode && isAccepted && (
    (totalSessions > 1 && role === 'NETWORK_ADMIN') ||
    (totalSessions === 1 && (role === 'NETWORK_ADMIN' || role === 'BRANCH_ADMIN'))
  )

  async function handleCancelTreatment() {
    if (!planId) return
    setCancelling(true)
    setCancelError(null)
    const res = await cancelTreatmentPlan(planId, cancelReason, slug)
    setCancelling(false)
    if (res.error) { setCancelError(res.error); return }
    router.refresh()
    onClose()
  }

  async function load() {
    setLoading(true)
    if (isPlanMode) {
      const res = await getPlannedSessionAppointments(planId!)
      setSessions(res.sessions.map(s => ({ ...s, procedureId: s.procedureId })))
    } else if (clientPackageId) {
      const res = await getClientPackageSessions(clientPackageId)
      setSessions(res.sessions.map(s => ({ ...s, procedureName: procedureName })))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [clientPackageId, planId])

  // Realtime: re-carrega sessões quando agendamentos ou plano mudarem
  useEffect(() => {
    const supabase = createSupabaseClient()
    const channel  = supabase.channel(`tsm-${planId ?? clientPackageId}`)

    if (planId) {
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `treatment_plan_id=eq.${planId}` },
        () => load(),
      )
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'treatment_plans', filter: `id=eq.${planId}` },
        () => load(),
      )
    }

    if (clientPackageId) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'package_sessions', filter: `client_package_id=eq.${clientPackageId}` },
        () => load(),
      )
    }

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [planId, clientPackageId])

  const completedCount = sessions.filter(s => s.status === 'USED' || s.status === 'COMPLETED').length
  const pct = totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-card)',
        width: '100%', maxWidth: 560, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', marginBottom: 4 }}>TRATAMENTO EM ANDAMENTO</p>
            <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{packageName}</p>
            {!isPlanMode && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{procedureName}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--hairline)' }}>
                <div style={{ height: '100%', borderRadius: 3, background: 'var(--brand)', width: `${pct}%`, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                {completedCount} / {totalSessions} sessões
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, borderRadius: 6, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px 20px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: 'var(--text-faint)' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13 }}>Carregando sessões…</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {sessions.map((sess, i) => {
                const rawStatus = sess.apptStatus ?? sess.status
                const st        = STATUS_LABEL[rawStatus] ?? { label: rawStatus, color: 'var(--text-faint)' }
                const isLast    = i === sessions.length - 1
                const isScheduling = schedulingId === sess.id
                const isDone    = rawStatus === 'USED' || rawStatus === 'COMPLETED'
                const isBooked  = rawStatus === 'SCHEDULED' || rawStatus === 'IN_PROGRESS'
                const isAvail   = !isDone && !isBooked

                return (
                  <div key={sess.id} style={{
                    padding: '14px 0',
                    borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Número */}
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: isDone ? 'var(--success-soft)' : isBooked ? '#eff6ff' : 'var(--bg-app)',
                        border: `1.5px solid ${isDone ? 'var(--success)' : isBooked ? '#2563eb' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800,
                        color: isDone ? 'var(--success)' : isBooked ? '#2563eb' : 'var(--text-faint)',
                      }}>
                        {isDone ? <CheckCircle2 size={14} /> : sess.sessionNumber}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          Sessão {sess.sessionNumber}
                          {isPlanMode && sess.procedureName && (
                            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>· {sess.procedureName}</span>
                          )}
                        </p>
                        {sess.scheduledAt ? (
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            <Calendar size={10} style={{ display: 'inline', marginRight: 3 }} />
                            {format(new Date(sess.scheduledAt), "EEE, dd MMM · HH:mm", { locale: ptBR })}
                            {sess.professionalName && ` · ${sess.professionalName}`}
                          </p>
                        ) : (
                          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>Sem agendamento</p>
                        )}
                      </div>

                      {/* Status + Ações */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: st.color }}>{st.label}</span>

                        {isAvail && !isScheduling && (
                          <button type="button" onClick={() => setSchedulingId(sess.id)}
                            style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--brand-soft)', color: 'var(--brand)', border: 'none' }}>
                            Agendar
                          </button>
                        )}

                        {isBooked && sess.appointmentId && (
                          <button type="button"
                            onClick={() => router.push(`/${slug}/agenda/${sess.appointmentId}`)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--brand)', color: '#fff', border: 'none' }}>
                            <Play size={10} /> Iniciar
                          </button>
                        )}

                        {isDone && sess.appointmentId && (
                          <button type="button"
                            onClick={() => router.push(`/${slug}/agenda/${sess.appointmentId}`)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--bg-app)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            Ver <ChevronRight size={10} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Mini-scheduler inline */}
                    {isScheduling && (
                      <SessionScheduler
                        branches={branches}
                        currentBranchId={currentBranchId}
                        onCancel={() => setSchedulingId(null)}
                        onSave={async (params) => {
                          const sessProcedureId = isPlanMode
                            ? (sess.procedureId ?? procedureId)
                            : procedureId

                          let result: { error?: string }
                          if (isPlanMode) {
                            result = await schedulePlanSession({
                              planId:    planId!,
                              sessionId: sess.id,
                              clientId,
                              procedureId: sessProcedureId,
                              price,
                              durationMin,
                              slug,
                              ...params,
                            })
                          } else {
                            result = await schedulePackageSession({
                              packageSessionId: sess.id,
                              clientId,
                              procedureId,
                              price,
                              durationMin,
                              slug,
                              ...params,
                            })
                          }
                          if (!result.error) {
                            setSchedulingId(null)
                            load()
                          }
                          return result
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer — cancelar tratamento */}
        {canCancelTreatment && (
          <div style={{ borderTop: '1px solid var(--hairline)', padding: '14px 24px' }}>
            {!showCancel ? (
              <button type="button" onClick={() => setShowCancel(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#dc2626', textDecoration: 'underline', padding: 0 }}>
                Cancelar tratamento
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <AlertTriangle size={14} color="#dc2626" />
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#dc2626' }}>Confirmar cancelamento</p>
                </div>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Motivo do cancelamento (opcional)…"
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #fca5a5', fontSize: 12, background: '#fff5f5', color: 'var(--text)', resize: 'none', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 10 }}
                />
                {cancelError && <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>{cancelError}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setShowCancel(false); setCancelError(null) }}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
                    Voltar
                  </button>
                  <button type="button" onClick={handleCancelTreatment} disabled={cancelling}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#dc2626', fontSize: 12, fontWeight: 800, color: '#fff', cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.7 : 1 }}>
                    {cancelling ? <><Loader2 size={12} className="animate-spin" /> Cancelando…</> : 'Confirmar cancelamento'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
