'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, User, Stethoscope, Calendar, CheckCircle2, Clock, Play, ChevronRight, Loader2, Settings } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getTreatmentPlanDetails } from '@/actions/treatment-plans'
import { TreatmentSessionsModal } from './treatment-sessions-modal'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import type { TreatmentFileDetails } from '@/actions/treatment-plans'
import type { ProfileClient, ProfilePackage } from './client-profile'

// -- Helpers -------------------------------------------------------------------

function fmtDate(d: string) {
  return format(new Date(d), "dd/MM/yyyy", { locale: ptBR })
}

function fmtDateTime(d: string) {
  return format(new Date(d), "EEE, dd MMM · HH:mm", { locale: ptBR })
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ACCEPTED:   { label: 'Em andamento', color: 'var(--brand)',   bg: 'var(--brand-soft)' },
  COMPLETED:  { label: 'Concluído',    color: '#16a34a',        bg: '#f0fdf4' },
  REJECTED:   { label: 'Cancelado',    color: '#dc2626',        bg: '#fef2f2' },
  PROPOSED:   { label: 'Aguardando',   color: '#d97706',        bg: '#fffbeb' },
  DRAFT:      { label: 'Rascunho',     color: 'var(--text-faint)', bg: 'var(--bg-app)' },
}

const APPT_STATUS: Record<string, { label: string; color: string }> = {
  SCHEDULED:   { label: 'Agendada',     color: '#2563eb' },
  CONFIRMED:   { label: 'Confirmada',   color: '#2563eb' },
  IN_PROGRESS: { label: 'Em andamento', color: '#d97706' },
  COMPLETED:   { label: 'Realizada',    color: '#16a34a' },
  CANCELLED:   { label: 'Cancelada',    color: '#dc2626' },
  NO_SHOW:     { label: 'Não compareceu', color: '#6b7280' },
}

const ANAMNESE_LABELS: Record<string, string> = {
  skinType:                  'Tipo de pele',
  allergies:                 'Alergias',
  medications:               'Medicamentos em uso',
  healthConditions:          'Condições de saúde',
  previousProcedures:        'Procedimentos anteriores',
  isPregnantOrBreastfeeding: 'Gestante ou amamentando',
  useSunscreen:              'Usa protetor solar',
  observations:              'Observações',
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: 'var(--text-faint)', marginBottom: 12,
    }}>
      {children}
    </p>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--hairline)', margin: '4px 0' }} />
}

// -- Sessão item ---------------------------------------------------------------

function SessionItem({
  session, index, isLast, slug, onSessionClick,
}: {
  session:        TreatmentFileDetails['sessions'][number]
  index:          number
  isLast:         boolean
  slug:           string
  onSessionClick: (apptId: string) => void
}) {
  const router     = useRouter()
  const appt       = session.appointment
  const apptStatus = appt?.status ?? null
  const isDone     = apptStatus === 'COMPLETED'
  const isActive   = apptStatus === 'IN_PROGRESS'
  const isBooked   = apptStatus === 'SCHEDULED' || apptStatus === 'CONFIRMED'
  const isPending  = !appt

  const dotColor = isDone ? '#16a34a' : isActive ? '#d97706' : isBooked ? '#2563eb' : 'var(--border)'
  const dotBg    = isDone ? '#f0fdf4' : isActive ? '#fffbeb' : isBooked ? '#eff6ff' : 'var(--bg-app)'

  const procNames = session.procedures.map(p => p.name).join(' + ')

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {/* Connector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: dotBg, border: `2px solid ${dotColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800,
          color: isDone ? '#16a34a' : dotColor,
        }}>
          {isDone ? <CheckCircle2 size={14} /> : index + 1}
        </div>
        {!isLast && (
          <div style={{ width: 2, flex: 1, minHeight: 16, background: 'var(--hairline)', margin: '4px 0' }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
              Sessão {index + 1}
              {procNames && (
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>
                  · {procNames}
                </span>
              )}
            </p>
            {appt ? (
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={10} style={{ flexShrink: 0 }} />
                {fmtDateTime(appt.scheduledAt)}
              </p>
            ) : (
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>Aguardando agendamento</p>
            )}
            {appt?.notes && isDone && (
              <p style={{
                fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6,
                background: 'var(--bg-app)', borderRadius: 6, padding: '6px 10px',
                borderLeft: '2px solid var(--brand-soft)',
              }}>
                {appt.notes}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {apptStatus && (
              <span style={{ fontSize: 10, fontWeight: 700, color: APPT_STATUS[apptStatus]?.color ?? 'var(--text-faint)' }}>
                {APPT_STATUS[apptStatus]?.label ?? apptStatus}
              </span>
            )}
            {(isDone || isBooked || isActive) && appt?.id && (
              <button
                type="button"
                onClick={() => router.push(`/${slug}/agenda/${appt.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: isActive ? 'var(--brand)' : 'var(--bg-app)',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${isActive ? 'var(--brand)' : 'var(--border)'}`,
                }}
              >
                {isActive ? <><Play size={9} /> Abrir</> : <><ChevronRight size={10} /> Ver</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// -- Linha do tempo ------------------------------------------------------------

function Timeline({ details }: { details: TreatmentFileDetails }) {
  type TLEvent = { date: string; label: string; sub: string | null; color: string; icon: React.ReactNode }
  const events: TLEvent[] = []

  if (details.evaluationDate) {
    events.push({
      date:  fmtDate(details.evaluationDate),
      label: 'Avaliação inicial',
      sub:   details.professionalName ? `com ${details.professionalName}` : null,
      color: 'var(--brand)',
      icon:  <Stethoscope size={12} />,
    })
  }

  const completed = details.sessions.filter(s => s.appointment?.status === 'COMPLETED')
  completed.forEach((s, i) => {
    if (!s.appointment) return
    const procName = s.procedures[0]?.name ?? '—'
    events.push({
      date:  fmtDate(s.appointment.scheduledAt),
      label: `Sessão ${s.sortOrder + 1} realizada`,
      sub:   procName,
      color: '#16a34a',
      icon:  <CheckCircle2 size={12} />,
    })
  })

  const scheduled = details.sessions.filter(s => s.appointment && (s.appointment.status === 'SCHEDULED' || s.appointment.status === 'CONFIRMED'))
  scheduled.forEach(s => {
    if (!s.appointment) return
    const procName = s.procedures[0]?.name ?? '—'
    events.push({
      date:  fmtDate(s.appointment.scheduledAt),
      label: `Sessão ${s.sortOrder + 1} agendada`,
      sub:   procName,
      color: '#2563eb',
      icon:  <Calendar size={12} />,
    })
  })

  events.sort((a, b) => a.date.localeCompare(b.date))

  if (events.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhum evento registrado ainda.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {events.map((ev, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 2 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: ev.color + '18',
              border: `1.5px solid ${ev.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: ev.color, flexShrink: 0,
            }}>
              {ev.icon}
            </div>
            {i < events.length - 1 && (
              <div style={{ width: 1.5, height: 28, background: 'var(--hairline)', margin: '3px 0' }} />
            )}
          </div>
          <div style={{ paddingBottom: i < events.length - 1 ? 8 : 0 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{ev.label}</p>
            {ev.sub && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{ev.sub}</p>}
            <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>{ev.date}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// -- Props ---------------------------------------------------------------------

interface Props {
  client:          ProfileClient
  activePackage:   ProfilePackage
  branches:        { id: string; name: string }[]
  currentBranchId: string
  slug:            string
  role:            string
  onClose:         () => void
}

// -- Modal principal -----------------------------------------------------------

export function TreatmentFileModal({ client, activePackage, branches, currentBranchId, slug, role, onClose }: Props) {
  const [details,      setDetails]      = useState<TreatmentFileDetails | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [sessionsOpen, setSessionsOpen] = useState(false)

  const hasPlan = !!activePackage.planId

  const fetchDetails = useCallback(() => {
    if (!activePackage.planId) return
    setLoading(true)
    getTreatmentPlanDetails(activePackage.planId, client.id).then(res => {
      if (res.data) setDetails(res.data)
      else setError(res.error ?? 'Erro ao carregar ficha.')
      setLoading(false)
    })
  }, [activePackage.planId, client.id])

  useEffect(() => {
    if (!hasPlan) return
    fetchDetails()
  }, [hasPlan, fetchDetails])

  // Realtime: re-busca detalhes quando plano ou seus agendamentos mudam
  useEffect(() => {
    if (!activePackage.planId) return
    const supabase = createSupabaseClient()
    const planId   = activePackage.planId
    const channel  = supabase.channel(`tfm-${planId}`)

    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'treatment_plans',  filter: `id=eq.${planId}` }, fetchDetails)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments',     filter: `treatment_plan_id=eq.${planId}` }, fetchDetails)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'treatment_plan_sessions', filter: `plan_id=eq.${planId}` }, fetchDetails)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activePackage.planId, fetchDetails])

  const status  = details ? (STATUS_MAP[details.status] ?? STATUS_MAP['ACCEPTED']!) : STATUS_MAP['ACCEPTED']!
  const pct     = activePackage.totalSessions > 0
    ? Math.round((activePackage.usedSessions / activePackage.totalSessions) * 100)
    : 0

  function maskCPF(doc: string) {
    return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  function calcAge(birthDate: string) {
    const diff = Date.now() - new Date(birthDate).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
  }

  if (sessionsOpen) {
    return (
      <TreatmentSessionsModal
        clientPackageId={activePackage.planId ? undefined : activePackage.id}
        planId={activePackage.planId}
        planStatus={activePackage.planStatus}
        packageName={activePackage.name}
        totalSessions={activePackage.totalSessions}
        usedSessions={activePackage.usedSessions}
        clientId={client.id}
        procedureId={activePackage.procedureId}
        procedureName={activePackage.procedureName}
        price={activePackage.price}
        durationMin={activePackage.durationMin}
        slug={slug}
        branches={branches}
        currentBranchId={currentBranchId}
        role={role}
        onClose={() => setSessionsOpen(false)}
      />
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-card)',
        width: '100%', maxWidth: 720, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>

        {/* -- Header --------------------------------------------------- */}
        <div style={{
          background: 'linear-gradient(135deg, var(--brand), var(--brand-deep, #a03358))',
          padding: '20px 24px', color: '#fff',
          display: 'flex', alignItems: 'flex-start', gap: 16,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.75 }}>
                FICHA DE TRATAMENTO
              </p>
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
                background: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em',
              }}>
                {status.label.toUpperCase()}
              </span>
            </div>
            <p style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {activePackage.name}
            </p>
            {details?.professionalName && (
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                Profissional responsável: {details.professionalName}
              </p>
            )}
            {/* Progress */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)' }}>
                <div style={{ height: '100%', borderRadius: 3, background: '#fff', width: `${pct}%`, transition: 'width 0.4s' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, opacity: 0.95, flexShrink: 0 }}>
                {activePackage.usedSessions} / {activePackage.totalSessions} sessões
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
            background: 'rgba(255,255,255,0.2)', border: 'none',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* -- Body ----------------------------------------------------- */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '24px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', color: 'var(--text-faint)', justifyContent: 'center' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13 }}>Carregando ficha…</span>
            </div>
          ) : error ? (
            <p style={{ fontSize: 13, color: '#dc2626', padding: '20px 0' }}>{error}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

              {/* -- Informações do cliente --------------------------- */}
              <div className="rg-2">
                <div>
                  <SectionTitle>Informações do cliente</SectionTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: 'var(--brand-soft)', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <User size={18} style={{ color: 'var(--brand)' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{client.name}</p>
                        {client.document && (
                          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                            CPF: {maskCPF(client.document)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginLeft: 50 }}>
                      {client.birthDate && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>Idade</span>
                          {calcAge(client.birthDate)} anos
                        </p>
                      )}
                      {client.phone && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>Telefone</span>
                          {client.phone}
                        </p>
                      )}
                      {client.email && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>Email</span>
                          {client.email}
                        </p>
                      )}
                      {client.city && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>Cidade</span>
                          {client.city}{client.state ? ` · ${client.state}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Avaliação inicial */}
                {details?.evaluationDate && (
                  <div>
                    <SectionTitle>Avaliação inicial</SectionTitle>
                    <div style={{
                      background: 'var(--bg-app)', borderRadius: 10,
                      padding: '14px 16px', border: '1px solid var(--border)',
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Calendar size={12} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                        {fmtDate(details.evaluationDate)}
                        {details.professionalName && ` · ${details.professionalName}`}
                      </p>
                      {details.evaluationComplaints && (
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 4 }}>
                            QUEIXAS DO CLIENTE
                          </p>
                          <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
                            {details.evaluationComplaints}
                          </p>
                        </div>
                      )}
                      {details.professionalNotes && (
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 4 }}>
                            NOTAS DA PROFISSIONAL
                          </p>
                          <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
                            {details.professionalNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sem avaliação: mostrar notas da profissional em posição diferente */}
                {!details?.evaluationDate && details?.professionalNotes && (
                  <div>
                    <SectionTitle>Observações do tratamento</SectionTitle>
                    <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6 }}>
                      {details.professionalNotes}
                    </p>
                  </div>
                )}
              </div>

              {/* -- Anamnese ---------------------------------------- */}
              {details?.anamnesis && Object.keys(details.anamnesis).some(k => {
                const v = (details.anamnesis as unknown as Record<string, unknown>)[k]
                return v !== null && v !== '' && v !== undefined
              }) && (
                <>
                  <Divider />
                  <div>
                    <SectionTitle>Anamnese</SectionTitle>
                    <div className="rg-2">
                      {Object.entries(details.anamnesis as unknown as Record<string, unknown>).map(([k, v]) => {
                        const label = ANAMNESE_LABELS[k]
                        if (!label) return null
                        const strVal = typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : String(v ?? '')
                        if (!strVal || strVal === 'false') return null
                        return (
                          <div key={k} style={{
                            background: 'var(--bg-app)', borderRadius: 8, padding: '10px 12px',
                            border: '1px solid var(--border)',
                          }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.05em', marginBottom: 4 }}>
                              {label.toUpperCase()}
                            </p>
                            <p style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{strVal}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* -- Sessões ----------------------------------------- */}
              {(details?.sessions ?? []).length > 0 && (
                <>
                  <Divider />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <SectionTitle>Sessões do tratamento</SectionTitle>
                      <button
                        type="button"
                        onClick={() => setSessionsOpen(true)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 12, fontWeight: 700, color: 'var(--brand)',
                          background: 'var(--brand-soft)', border: 'none',
                          padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                        }}
                      >
                        <Settings size={12} /> Gerenciar
                      </button>
                    </div>
                    <div>
                      {details!.sessions.map((s, i) => (
                        <SessionItem
                          key={s.id}
                          session={s}
                          index={i}
                          isLast={i === details!.sessions.length - 1}
                          slug={slug}
                          onSessionClick={() => {}}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* -- Para pacotes sem plan (sem sessões do plano) -- */}
              {!hasPlan && !loading && (
                <>
                  <Divider />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <SectionTitle>Sessões do tratamento</SectionTitle>
                      <button
                        type="button"
                        onClick={() => setSessionsOpen(true)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 12, fontWeight: 700, color: 'var(--brand)',
                          background: 'var(--brand-soft)', border: 'none',
                          padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                        }}
                      >
                        <Settings size={12} /> Gerenciar sessões
                      </button>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {activePackage.usedSessions} de {activePackage.totalSessions} sessões realizadas.
                    </p>
                  </div>
                </>
              )}

              {/* -- Linha do tempo ---------------------------------- */}
              {details && (
                <>
                  <Divider />
                  <div>
                    <SectionTitle>Linha do tempo</SectionTitle>
                    <Timeline details={details} />
                  </div>
                </>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
