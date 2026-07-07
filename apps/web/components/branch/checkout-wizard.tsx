'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, ChevronLeft, User, FileText, CreditCard, CalendarCheck, Package, Stethoscope, Printer, MapPin, Clock } from 'lucide-react'
import { createCheckoutConsentTerms, checkoutTreatmentPlan, cancelCheckout } from '@/actions/treatment-plans'
import type { SessionScheduleInput, PlanSessionForCheckout } from '@/actions/treatment-plans'
import { getSchedulingBranchProfessionals, getSchedulingDaySlots } from '@/actions/appointments'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// -- Types ---------------------------------------------------------------------

export interface CheckoutPlan {
  id:                string
  status:            string
  professionalNotes: string | null
  clientName:        string
  clientDocument:    string | null
  clientPhone:       string | null
  clientId:          string
  branchName:        string
  medicalRecordId:   string | null
  sessions:         PlanSessionForCheckout[]
  total:            number
  professionals:    { id: string; name: string }[]
  branches:         { id: string; name: string }[]
  currentBranchId:  string
}

interface DaySlot {
  scheduledAt: string
  durationMin: number
  clientName:  string | null
}

// Slots de 30min das 08:00 às 20:00 (hora local)
const TIME_SLOTS: string[] = Array.from({ length: 25 }, (_, i) => {
  const h = String(8 + Math.floor(i / 2)).padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

interface ConsentTerm {
  id:      string
  title:   string
  content: string
  status:  string
}

interface Props {
  plan: CheckoutPlan
  slug: string
}

// -- Helpers -------------------------------------------------------------------

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PAYMENT_METHODS = [
  { value: 'PIX',           label: 'Pix' },
  { value: 'CASH',          label: 'Dinheiro' },
  { value: 'DEBIT_CARD',    label: 'Débito' },
  { value: 'CREDIT_CARD',   label: 'Crédito' },
  { value: 'INTERNAL_CREDIT', label: 'Crédito interno' },
]

const STEPS = [
  { label: 'Plano',         icon: Stethoscope  },
  { label: 'Documentação',  icon: FileText      },
  { label: 'Pagamento',     icon: CreditCard    },
  { label: 'Agendamento',   icon: CalendarCheck },
]

// -- Componente principal ------------------------------------------------------

export function CheckoutWizard({ plan, slug }: Props) {
  const router = useRouter()
  const total  = plan.total

  const [step, setStep] = useState(0)

  // Documentação
  const [terms,         setTerms]         = useState<ConsentTerm[] | null>(null)
  const [printed,       setPrinted]       = useState(false)
  const [creatingTerms, startCreateTerms] = useTransition()

  // Pagamento
  const [paymentMethod, setPaymentMethod] = useState('PIX')

  // Agendamento — compartilhado por todas as sessões
  const [schedBranchId, setSchedBranchId] = useState(plan.currentBranchId)
  const [schedProfs,    setSchedProfs]    = useState<{ id: string; name: string }[]>([])
  const [loadingProfs,  setLoadingProfs]  = useState(false)
  const [schedProfId,   setSchedProfId]   = useState('')

  // Por sessão: key = planSessionId → { date, time }
  const [sessionDates,  setSessionDates]  = useState<Record<string, { date: string; time: string }>>({})
  const [activeSession, setActiveSession] = useState(plan.sessions[0]?.id ?? '')
  const [daySlots,      setDaySlots]      = useState<DaySlot[]>([])
  const [loadingSlots,  setLoadingSlots]  = useState(false)

  const activeDate = sessionDates[activeSession]?.date ?? ''
  const activeTime = sessionDates[activeSession]?.time ?? ''

  const [submitting,   startSubmit]   = useTransition()
  const [error,        setError]      = useState<string | null>(null)
  const [cancelling,   startCancel]   = useTransition()
  const [showCancel,   setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  // Busca profissionais quando branch muda
  useEffect(() => {
    if (!schedBranchId) return
    setLoadingProfs(true)
    setProfId('')
    getSchedulingBranchProfessionals(schedBranchId).then(res => {
      setSchedProfs(res.professionals)
      setLoadingProfs(false)
    })
  }, [schedBranchId])

  function setProfId(v: string) {
    setSchedProfId(v)
    setSessionDates({})
    setActiveSession(plan.sessions[0]?.id ?? '')
    setDaySlots([])
  }

  // Busca slots quando profissional + sessão ativa + data mudam
  useEffect(() => {
    if (!schedBranchId || !schedProfId || !activeDate) { setDaySlots([]); return }
    setLoadingSlots(true)
    getSchedulingDaySlots(schedBranchId, schedProfId, activeDate).then(res => {
      setDaySlots(res.slots)
      setLoadingSlots(false)
    })
  }, [schedBranchId, schedProfId, activeDate, activeSession])

  function setActiveDate(date: string) {
    setSessionDates(prev => ({ ...prev, [activeSession]: { date, time: '' } }))
    setDaySlots([])
  }

  function setActiveTime(time: string) {
    setSessionDates(prev => ({
      ...prev,
      [activeSession]: { date: prev[activeSession]?.date ?? '', time },
    }))
  }

  function isSlotBooked(time: string): DaySlot | null {
    if (!activeDate) return null
    const slotMs = new Date(`${activeDate}T${time}:00-03:00`).getTime()
    return daySlots.find(s => {
      const start = new Date(s.scheduledAt).getTime()
      const end   = start + s.durationMin * 60000
      return slotMs >= start && slotMs < end
    }) ?? null
  }

  // -- Passo 1: gerar documentos ao entrar em Documentação ---------------------
  function handleGoToDocs() {
    if (terms) { setStep(1); return }
    startCreateTerms(async () => {
      if (!plan.medicalRecordId) { setError('Prontuário não encontrado para este cliente.'); return }
      const result = await createCheckoutConsentTerms(
        plan.id,
        plan.medicalRecordId,
        plan.clientName,
        plan.branchName,
        plan.sessions.flatMap(sess =>
          sess.procedures.map(p => ({ procedureName: p.name, sessions: 1, unitPrice: p.price }))
        ),
        total,
      )
      if (result.error) { setError(result.error); return }
      setTerms((result.terms ?? []) as ConsentTerm[])
      setStep(1)
    })
  }

  // -- Finalizar checkout -------------------------------------------------------
  function handleFinish() {
    setError(null)
    const schedules: SessionScheduleInput[] = plan.sessions
      .filter(s => {
        const d = sessionDates[s.id]
        return d?.date && d?.time && schedProfId && schedBranchId
      })
      .map(s => {
        const d = sessionDates[s.id]!
        return {
          planSessionId:  s.id,
          scheduledAt:    new Date(`${d.date}T${d.time}:00-03:00`).toISOString(),
          professionalId: schedProfId,
          branchId:       schedBranchId,
        }
      })

    startSubmit(async () => {
      const result = await checkoutTreatmentPlan(plan.id, paymentMethod, schedules, slug)
      if (result.error) { setError(result.error); return }
      router.push(`/${slug}/clients/${plan.clientId}`)
    })
  }

  function handleCancel() {
    startCancel(async () => {
      const result = await cancelCheckout(plan.id, cancelReason, slug)
      if (result.error) { setError(result.error); setShowCancel(false); return }
      router.push(`/${slug}/clients/${plan.clientId}`)
    })
  }

  const cancelBlock = showCancel ? (
    <div style={{ marginTop: 24, padding: '18px 20px', borderRadius: 12, border: '1.5px solid #fca5a5', background: '#fff5f5' }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 10 }}>
        Cancelar checkout
      </p>
      <p style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 12 }}>
        O plano voltará para rascunho e o profissional poderá revisá-lo antes de reenviar.
      </p>
      <textarea
        value={cancelReason}
        onChange={e => setCancelReason(e.target.value)}
        placeholder="Motivo do cancelamento (opcional)…"
        rows={2}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, resize: 'vertical',
          border: '1px solid #fca5a5', background: '#fff', color: 'var(--text)', outline: 'none',
          boxSizing: 'border-box', marginBottom: 12,
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowCancel(false)}
          style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: '#dc2626', fontSize: 13, fontWeight: 700, color: '#fff', cursor: cancelling ? 'wait' : 'pointer' }}
        >
          {cancelling ? 'Cancelando…' : 'Confirmar cancelamento'}
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setShowCancel(true)}
      style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 10, border: 'none', background: 'none', fontSize: 13, fontWeight: 600, color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}
    >
      Cancelar checkout
    </button>
  )

  // -- Progress bar -------------------------------------------------------------
  const progressBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {STEPS.map((s, i) => {
        const done    = i < step
        const current = i === step
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background:  done ? '#dcfce7' : current ? 'var(--brand)' : 'var(--bg-app)',
                border:      done ? '1.5px solid #22c55e' : current ? 'none' : '1.5px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {done
                  ? <Check size={16} color="#22c55e" />
                  : <s.icon size={15} color={current ? '#fff' : 'var(--text-faint)'} />}
              </div>
              <span style={{
                fontSize: 11, fontWeight: current ? 700 : 600,
                color: current ? 'var(--brand)' : done ? '#22c55e' : 'var(--text-faint)',
                whiteSpace: 'nowrap',
              }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1.5, background: done ? '#22c55e' : 'var(--hairline)', margin: '0 8px', marginBottom: 22 }} />
            )}
          </div>
        )
      })}
    </div>
  )

  // -- Renderização dos passos ---------------------------------------------------

  // PASSO 0: Revisão do plano
  if (step === 0) return (
    <div>
      {progressBar}

      {/* Card do cliente */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', background: 'var(--brand-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <User size={20} style={{ color: 'var(--brand)' }} />
        </div>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{plan.clientName}</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {plan.clientDocument ? `CPF ${plan.clientDocument}` : 'CPF não informado'}
            {plan.clientPhone ? ` · ${plan.clientPhone}` : ''}
          </p>
        </div>
      </div>

      {/* Sessões do plano */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Plano de tratamento — {plan.sessions.length} sessão(ões)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plan.sessions.map((sess, i) => (
            <div key={sess.id} style={{
              borderRadius: 10, background: 'var(--bg-app)', border: '1px solid var(--hairline)', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid var(--hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Sessão {i + 1}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{fmtBRL(sess.totalPrice)}</span>
              </div>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sess.procedures.map((p, j) => (
                  <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Stethoscope size={11} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                      {p.name}
                    </span>
                    <span>{fmtBRL(p.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {plan.professionalNotes && (
          <p style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
            "{plan.professionalNotes}"
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Total: {fmtBRL(total)}</span>
        </div>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</p>}

      <button onClick={handleGoToDocs} disabled={creatingTerms}
        style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: creatingTerms ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 2px 12px rgba(195,77,107,0.3)' }}>
        {creatingTerms ? 'Gerando documentos…' : 'Confirmar plano'} <ChevronRight size={18} />
      </button>

      {cancelBlock}
    </div>
  )

  // PASSO 1: Documentação (anamnese + contrato para imprimir e assinar fisicamente)
  if (step === 1) return (
    <div>
      {progressBar}

      {/* Documentos gerados */}
      {(terms ?? []).map((term, i) => (
        <div key={term.id} className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            {term.title}
          </p>
          <pre style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {term.content}
          </pre>
          {/* Espaço para assinatura física */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--hairline)' }}>
            <div style={{ display: 'flex', gap: 40 }}>
              <div style={{ flex: 1 }}>
                <div style={{ borderBottom: '1px solid var(--text)', marginBottom: 6 }} />
                <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>Assinatura do cliente</p>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ borderBottom: '1px solid var(--text)', marginBottom: 6 }} />
                <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>Data</p>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Botão imprimir + avançar */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => setPrinted(true)}
          style={{
            flex: 1, padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            border: printed ? '1.5px solid #22c55e' : '1.5px solid var(--border)',
            background: printed ? '#f0fdf4' : 'var(--surface)',
            color: printed ? '#15803d' : 'var(--text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {printed ? <Check size={15} color="#15803d" /> : <Printer size={15} />}
          {printed ? 'Impresso' : 'Imprimir documentos'}
        </button>
        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={!printed}
          style={{
            flex: 2, padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
            background: printed ? 'var(--brand)' : 'var(--bg-app)',
            color:      printed ? '#fff'          : 'var(--text-faint)',
            border:     printed ? 'none'          : '1px solid var(--border)',
            cursor:     printed ? 'pointer'       : 'not-allowed',
            boxShadow:  printed ? '0 2px 12px rgba(195,77,107,0.3)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          Ir para pagamento <ChevronRight size={18} />
        </button>
      </div>

      {cancelBlock}
    </div>
  )

  // PASSO 2: Pagamento
  if (step === 2) return (
    <div>
      {progressBar}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Forma de pagamento
        </p>
        <div className="form-2col" style={{ marginBottom: 20 }}>
          {PAYMENT_METHODS.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => setPaymentMethod(m.value)}
              style={{
                padding: '14px', borderRadius: 10, textAlign: 'center', fontWeight: 700, fontSize: 14,
                border:     paymentMethod === m.value ? '2px solid var(--brand)'   : '1.5px solid var(--border)',
                background: paymentMethod === m.value ? 'var(--brand-soft)'        : 'var(--surface)',
                color:      paymentMethod === m.value ? 'var(--brand)'             : 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderTop: '1px solid var(--hairline)' }}>
          <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600 }}>Total a cobrar</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{fmtBRL(total)}</span>
        </div>
      </div>
      <button
        onClick={() => setStep(3)}
        style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 2px 12px rgba(195,77,107,0.3)' }}>
        Confirmar pagamento <ChevronRight size={18} />
      </button>

      {cancelBlock}
    </div>
  )

  // PASSO 3: Agendamento
  const minDate = format(new Date(), 'yyyy-MM-dd')
  const scheduledCount = plan.sessions.filter(s => sessionDates[s.id]?.date && sessionDates[s.id]?.time).length

  return (
    <div>
      {progressBar}

      {/* Filial + Profissional (compartilhados) */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Filial e profissional
        </p>

        {/* Filial */}
        {plan.branches.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {plan.branches.map(b => {
              const isSel = b.id === schedBranchId
              return (
                <button key={b.id} type="button" onClick={() => setSchedBranchId(b.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
                    border:     isSel ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                    background: isSel ? 'var(--brand-soft)'      : 'var(--surface)',
                    color:      isSel ? 'var(--brand)'           : 'var(--text)',
                    fontWeight: 700, fontSize: 13,
                  }}>
                  <MapPin size={13} /> {b.name}
                  {b.id === plan.currentBranchId && <span style={{ fontSize: 10, opacity: 0.6 }}>(atual)</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* Profissional */}
        {loadingProfs ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Carregando profissionais…</p>
        ) : schedProfs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum profissional nesta filial.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {schedProfs.map(p => {
              const sel = p.id === schedProfId
              return (
                <button key={p.id} type="button" onClick={() => setProfId(p.id)}
                  style={{
                    padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    border:     sel ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                    background: sel ? 'var(--brand)'           : 'var(--surface)',
                    color:      sel ? '#fff'                   : 'var(--text)',
                  }}>
                  {p.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Tabs por sessão */}
      {schedProfId && (
        <div className="card" style={{ padding: '18px 20px', marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Agendamento por sessão
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {plan.sessions.map((sess, i) => {
              const hasDate  = !!(sessionDates[sess.id]?.date && sessionDates[sess.id]?.time)
              const isActive = activeSession === sess.id
              const label    = plan.sessions.length === 1
                ? 'Sessão única'
                : `Sessão ${i + 1}`
              const subLabel = sess.procedures.map(p => p.name).join(' · ')
              return (
                <button key={sess.id} type="button" onClick={() => setActiveSession(sess.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border:     isActive ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                    background: isActive ? 'var(--brand-soft)'      : hasDate ? '#f0fdf4' : 'var(--surface)',
                    color:      isActive ? 'var(--brand)'           : hasDate ? '#16a34a' : 'var(--text-muted)',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                  }}>
                  <span>{hasDate ? <Check size={10} style={{ display: 'inline', marginRight: 3 }} /> : null}{label}</span>
                  {subLabel && <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>{subLabel}</span>}
                </button>
              )
            })}
          </div>

          {/* Data */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Data</label>
            <input
              type="date" min={minDate} value={activeDate}
              onChange={e => setActiveDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--bg-app)', boxSizing: 'border-box' as const }}
            />
          </div>

          {/* Grade de horários */}
          {activeDate && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Horários</p>
                {loadingSlots && <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>carregando…</p>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {TIME_SLOTS.map(t => {
                  const booked = isSlotBooked(t)
                  const sel    = activeTime === t
                  return (
                    <button key={t} type="button" disabled={!!booked} onClick={() => setActiveTime(t)}
                      style={{
                        padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        cursor:     booked ? 'not-allowed' : 'pointer',
                        background: sel ? 'var(--brand)' : booked ? 'var(--bg-app)' : 'var(--surface)',
                        color:      sel ? '#fff'         : booked ? 'var(--text-faint)' : 'var(--text)',
                        border:     sel ? '2px solid var(--brand)' : booked ? '1px solid var(--hairline)' : '1.5px solid var(--border)',
                        textDecoration: booked ? 'line-through' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                      }}>
                      {sel && <Check size={10} />}{t}
                    </button>
                  )
                })}
              </div>

              {activeTime && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--brand-soft)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>
                    <Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    {activeDate.split('-').reverse().join('/')} às {activeTime} · {schedProfs.find(p => p.id === schedProfId)?.name}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Resumo de sessões agendadas */}
      {scheduledCount > 0 && (
        <div className="card" style={{ padding: '14px 20px', marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', letterSpacing: '0.06em' }}>
            <Check size={12} style={{ display: 'inline', marginRight: 4 }} />
            {scheduledCount} de {plan.sessions.length} sessão{plan.sessions.length !== 1 ? 'ões' : ''} com data definida
          </p>
        </div>
      )}

      {error && <p style={{ color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</p>}

      <button
        type="button"
        onClick={() => handleFinish()}
        disabled={submitting}
        style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: submitting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 2px 12px rgba(195,77,107,0.3)' }}>
        {submitting ? 'Finalizando…' : scheduledCount > 0 ? 'Concluir' : 'Concluir sem agendar'}
      </button>

      {cancelBlock}
    </div>
  )
}
