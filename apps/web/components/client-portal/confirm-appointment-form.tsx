'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, CheckCircle2, CalendarDays, User } from 'lucide-react'
import { confirmAndRateAppointment } from '@/actions/appointments'
import { useFuso } from '@/components/shared/fuso'

interface Props {
  appointmentId:    string
  slug:             string
  procedureName:    string
  professionalName: string
  scheduledAt:      string
  /** F17-3: a clínica pede a nota do atendimento (vale para a profissional). */
  avaliaOAtendimento?: boolean
  /** F17-3: os procedimentos feitos no atendimento, um de cada, quando a clínica pede a nota de cada um. */
  procedimentos?:   { id: string; nome: string }[]
}

function StarRating({ value, onChange, label, dica }: {
  value: number
  onChange: (v: number) => void
  label: string
  dica?: string
}) {
  const [hover, setHover] = useState(0)
  return (
    <div>
      <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', marginBottom: dica ? 2 : 8 }}>{label}</p>
      {dica && <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginBottom: 8 }}>{dica}</p>}
      {/* A67: cada estrela diz o grupo e a nota ("Procedimento: 4 de 5
          estrelas"), e a marcada se anuncia (aria-pressed). Eram dez botões
          "1 estrela"…"5 estrelas", iguais nos dois grupos. */}
      <div role="group" aria-label={label} style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => {
          const active = n <= (hover || value)
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n === value ? 0 : n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              aria-label={`${label}: ${n} de 5 estrelas`}
              aria-pressed={n === value}
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
  avaliaOAtendimento = true, procedimentos = [],
}: Props) {
  const fuso = useFuso()
  const router = useRouter()
  // F17-3: a nota do atendimento e a de cada procedimento.
  const [notaDoAtendimento, setNotaDoAtendimento] = useState(0)
  const [notas, setNotas] = useState<Record<string, number>>({})
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
      professionalRating: avaliaOAtendimento ? (notaDoAtendimento || null) : null,
      notasDosProcedimentos: procedimentos
        .filter(p => (notas[p.id] ?? 0) > 0)
        .map(p => ({ procedureId: p.id, nota: notas[p.id]! })),
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            <User size={12} /> {professionalName}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            <CalendarDays size={12} />
            {dt.toLocaleDateString('pt-BR', { timeZone: fuso, day: '2-digit', month: 'long' })} às {dt.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Avaliações (opcionais) */}
      <div className="card" style={{ padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Avalie (opcional)
        </p>
        {avaliaOAtendimento && (
          <StarRating label="Atendimento" dica={`Como foi o atendimento, com ${professionalName}.`}
            value={notaDoAtendimento} onChange={setNotaDoAtendimento} />
        )}
        {procedimentos.map(p => (
          // A55 da 8ª: o bloco tinha o mesmo nome do procedimento do resumo
          // ("Avaliação" e "Avaliação") — o rótulo diz que é a nota dele.
          <StarRating key={p.id} label={`Procedimento: ${p.nome}`} dica={`Como ficou o resultado de ${p.nome}.`} value={notas[p.id] ?? 0}
            onChange={v => setNotas(atual => ({ ...atual, [p.id]: v }))} />
        ))}
        <div>
          <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Comentário</p>
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
        <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--danger)', fontWeight: 600, textAlign: 'center' }}>{error}</p>
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={submitting}
        className="btn-primary"
        style={{ justifyContent: 'center', padding: '13px 16px', fontSize: 'var(--text-base-sz)', opacity: submitting ? 0.6 : 1 }}
      >
        <CheckCircle2 size={17} />
        {submitting ? 'Confirmando…' : 'Confirmar que realizei o atendimento'}
      </button>
    </div>
  )
}
