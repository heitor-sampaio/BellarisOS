'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Check, Calendar, Clock, User, Sparkles } from 'lucide-react'
import { getClientAvailableSlots, createClientAppointment } from '@/actions/appointments'

interface Procedure {
  id:           string
  name:         string
  price:        number
  duration_min: number
}

interface Professional {
  id:   string
  name: string
}

interface Props {
  slug:          string
  branchId:      string
  procedures:    Procedure[]
  professionals: Professional[]
}

type Step = 1 | 2 | 3 | 4

export function NewAppointmentWizard({ slug, branchId, procedures, professionals }: Props) {
  const router = useRouter()
  const [step,       setStep]       = useState<Step>(1)
  const [procedure,  setProcedure]  = useState<Procedure | null>(null)
  const [prof,       setProf]       = useState<Professional | null>(null)
  const [date,       setDate]       = useState('')
  const [slots,      setSlots]      = useState<string[]>([])
  const [time,       setTime]       = useState('')
  const [error,      setError]      = useState('')
  const [isPending,  startTransition] = useTransition()
  // Diagnostic: confirms React mounted client-side + counts raw pointer events
  const [mounted,   setMounted]   = useState(false)
  const [tapCount,  setTapCount]  = useState(0)
  useEffect(() => { setMounted(true) }, [])

  const today = new Date().toISOString().split('T')[0]!

  function handleSelectProcedure(p: Procedure) {
    setProcedure(p)
    setProf(null)
    setDate('')
    setSlots([])
    setTime('')
    setStep(2)
  }

  function handleSelectProfessional(p: Professional) {
    setProf(p)
    setDate('')
    setSlots([])
    setTime('')
    setStep(3)
  }

  function handleDateChange(newDate: string) {
    setDate(newDate)
    setTime('')
    setSlots([])
    if (!newDate || !prof || !procedure) return
    startTransition(async () => {
      const res = await getClientAvailableSlots(branchId, prof.id, newDate, procedure.duration_min)
      setSlots(res.slots)
    })
  }

  function handleSelectTime(t: string) {
    setTime(t)
    setStep(4)
  }

  function handleConfirm() {
    if (!procedure || !prof || !date || !time) return
    setError('')
    const parts = time.split(':')
    const hhStr = (parts[0] ?? '00').padStart(2, '0')
    const mmStr = (parts[1] ?? '00').padStart(2, '0')
    const scheduledAt = new Date(`${date}T${hhStr}:${mmStr}:00-03:00`).toISOString()

    startTransition(async () => {
      const res = await createClientAppointment({
        branchId, procedureId: procedure.id, professionalId: prof.id, scheduledAt, slug,
      })
      if (res.error) {
        setError(res.error)
      } else {
        router.push(`/${slug}/cliente/agendamentos`)
      }
    })
  }

  // --- Step indicators ---------------------------------------------
  const STEPS = [
    { n: 1, label: 'Procedimento', icon: <Sparkles size={13} /> },
    { n: 2, label: 'Profissional', icon: <User size={13} /> },
    { n: 3, label: 'Data e hora',  icon: <Calendar size={13} /> },
    { n: 4, label: 'Confirmar',    icon: <Check size={13} /> },
  ]

  const fmtPrice = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

  const fmtDate = (d: string) => {
    if (!d) return ''
    const [y, m, dd] = d.split('-')
    return new Date(Number(y), Number(m) - 1, Number(dd)).toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
  }

  return (
    <div onPointerDown={() => setTapCount(c => c + 1)}>
      {/* Back + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => {
            if (step > 1) {
              setStep((step - 1) as Step)
            } else {
              router.back()
            }
          }}
          style={{
            width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface)', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Novo agendamento
        </h1>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {STEPS.map(s => (
          <div key={s.n} style={{ flex: 1 }}>
            <div style={{
              height:       3,
              borderRadius: 2,
              background:   s.n <= step ? 'var(--brand)' : 'var(--hairline)',
              transition:   'background 240ms',
              marginBottom: 4,
            }} />
            <p style={{
              fontSize:   10.5,
              fontWeight: s.n === step ? 700 : 500,
              color:      s.n === step ? 'var(--brand)' : 'var(--text-faint)',
              letterSpacing: '0.02em',
            }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Diagnostic strip — remove after debugging */}
      <div style={{
        fontSize: 10, color: 'var(--text-faint)', marginBottom: 8,
        display: 'flex', gap: 12, padding: '4px 0',
      }}>
        <span>React: {mounted ? '✓ ativo' : '○ SSR'}</span>
        <span>Taps: {tapCount}</span>
        <span>Step: {step}</span>
      </div>

      {/* --- Step 1: Procedimento ---------------------------------- */}
      {step === 1 && (
        <div>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 16 }}>
            Qual procedimento você deseja agendar?
          </p>
          {procedures.length === 0 && (
            <p style={{ color: 'var(--text-faint)', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
              Nenhum procedimento disponível para agendamento online.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {procedures.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectProcedure(p)}
                style={{
                  display:                    'flex',
                  justifyContent:             'space-between',
                  alignItems:                 'center',
                  padding:                    '14px 18px',
                  borderRadius:               12,
                  border:                     `1.5px solid ${procedure?.id === p.id ? 'var(--brand)' : 'var(--border)'}`,
                  background:                 procedure?.id === p.id ? 'var(--brand-soft)' : 'var(--surface)',
                  cursor:                     'pointer',
                  textAlign:                  'left',
                  width:                      '100%',
                  transition:                 'all 120ms',
                  touchAction:                'manipulation',
                  WebkitTapHighlightColor:    'transparent',
                }}
              >
                <div>
                  <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 2 }}>
                    {p.name}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {p.duration_min}min
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand)' }}>
                    {fmtPrice(p.price)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- Step 2: Profissional ---------------------------------- */}
      {step === 2 && (
        <div>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 16 }}>
            Com quem você prefere ser atendido?
          </p>
          {professionals.length === 0 && (
            <p style={{ color: 'var(--text-faint)', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
              Nenhum profissional disponível.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {professionals.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectProfessional(p)}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  gap:            12,
                  padding:        '14px 18px',
                  borderRadius:   12,
                  border:         `1.5px solid ${prof?.id === p.id ? 'var(--brand)' : 'var(--border)'}`,
                  background:     prof?.id === p.id ? 'var(--brand-soft)' : 'var(--surface)',
                  cursor:         'pointer',
                  textAlign:      'left',
                  width:          '100%',
                  transition:     'all 120ms',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--brand)', fontWeight: 800, fontSize: 14, flexShrink: 0,
                }}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>
                  {p.name}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- Step 3: Data e horário -------------------------------- */}
      {step === 3 && (
        <div>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 16 }}>
            Escolha a data e o horário disponível.
          </p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
              DATA
            </label>
            <input
              type="date"
              className="field"
              min={today}
              value={date}
              onChange={e => handleDateChange(e.target.value)}
              style={{ maxWidth: 220 }}
            />
          </div>

          {date && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 10 }}>
                HORÁRIOS DISPONÍVEIS
              </label>
              {isPending ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px 0' }}>
                  Carregando horários…
                </p>
              ) : slots.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {slots.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => handleSelectTime(slot)}
                      style={{
                        display:      'flex',
                        alignItems:   'center',
                        gap:          5,
                        padding:      '8px 16px',
                        borderRadius: 10,
                        border:       `1.5px solid ${time === slot ? 'var(--brand)' : 'var(--border)'}`,
                        background:   time === slot ? 'var(--brand-soft)' : 'var(--surface)',
                        color:        time === slot ? 'var(--brand)' : 'var(--text)',
                        fontWeight:   time === slot ? 700 : 500,
                        fontSize:     13.5,
                        cursor:       'pointer',
                        transition:   'all 120ms',
                      }}
                    >
                      <Clock size={12} />
                      {slot}
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '16px 0' }}>
                  Nenhum horário disponível para esta data.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- Step 4: Confirmar ------------------------------------- */}
      {step === 4 && procedure && prof && date && time && (
        <div>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 20 }}>
            Confirme os detalhes do seu agendamento.
          </p>

          <div className="card" style={{ padding: '20px 22px', marginBottom: 24 }}>
            <Row label="Procedimento" value={procedure.name} />
            <Row label="Profissional"  value={prof.name} />
            <Row label="Data"          value={fmtDate(date)} />
            <Row label="Horário"       value={time} />
            <Row label="Duração"       value={`${procedure.duration_min} min`} />
            <Row label="Valor"         value={fmtPrice(procedure.price)} accent />
          </div>

          {error && (
            <p style={{
              color:        'var(--warning)',
              background:   'var(--warning-soft)',
              borderRadius: 8,
              padding:      '10px 14px',
              fontSize:     13,
              fontWeight:   700,
              marginBottom: 16,
            }}>
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: 14 }}
          >
            {isPending ? 'Agendando…' : 'Confirmar agendamento'}
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'center',
      padding:        '9px 0',
      borderBottom:   '1px solid var(--hairline)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize:   14,
        fontWeight: accent ? 800 : 600,
        color:      accent ? 'var(--brand)' : 'var(--text)',
      }}>
        {value}
      </span>
    </div>
  )
}
