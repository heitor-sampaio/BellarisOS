'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, CheckCircle2, CalendarDays, User } from 'lucide-react'
import { confirmAndRateAppointment } from '@/actions/appointments'

interface Props {
  appointmentId:    string
  slug:             string
  procedureName:    string
  professionalName: string
  scheduledAt:      string
}

function StarRating({ value, onChange, label }: {
  value: number
  onChange: (v: number) => void
  label: string
}) {
  const [hover, setHover] = useState(0)
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => {
          const active = n <= (hover || value)
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n === value ? 0 : n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
              style={{
                background: 'none', border: 'none', padding: 2, cursor: 'pointer',
                lineHeight: 0, color: active ? 'var(--brand)' : 'var(--text-faint)',
              }}
            >
              <Star size={30} strokeWidth={2} fill={active ? 'var(--brand)' : 'none'} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ConfirmAppointmentForm({
  appointmentId, slug, procedureName, professionalName, scheduledAt,
}: Props) {
  const router = useRouter()
  const [procedureRating,    setProcedureRating]    = useState(0)
  const [professionalRating, setProfessionalRating] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dt = new Date(scheduledAt)

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    const res = await confirmAndRateAppointment({
      appointmentId,
      slug,
      professionalRating: professionalRating || null,
      procedureRating:    procedureRating || null,
      feedback:           feedback || null,
    })
    if (res.error) {
      setError(res.error)
      setSubmitting(false)
      return
    }
    router.replace(`/${slug}/cliente/historico`)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Resumo do atendimento */}
      <div className="card" style={{ padding: '16px 18px' }}>
        <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 15.5, letterSpacing: '-0.01em', marginBottom: 8 }}>
          {procedureName}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-muted)' }}>
            <User size={12} /> {professionalName}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-muted)' }}>
            <CalendarDays size={12} />
            {dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} às {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Avaliações (opcionais) */}
      <div className="card" style={{ padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Avalie (opcional)
        </p>
        <StarRating label="Procedimento" value={procedureRating} onChange={setProcedureRating} />
        <StarRating label="Profissional" value={professionalRating} onChange={setProfessionalRating} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Comentário</p>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Conte como foi seu atendimento (opcional)"
            className="field"
            style={{ resize: 'vertical', minHeight: 72, lineHeight: 1.5 }}
          />
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, textAlign: 'center' }}>{error}</p>
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={submitting}
        className="btn-primary"
        style={{ justifyContent: 'center', padding: '13px 16px', fontSize: 14, opacity: submitting ? 0.6 : 1 }}
      >
        <CheckCircle2 size={17} />
        {submitting ? 'Confirmando…' : 'Confirmar que realizei o atendimento'}
      </button>
    </div>
  )
}
