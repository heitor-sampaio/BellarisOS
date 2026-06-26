'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, User, Stethoscope, Clock, CheckCircle2,
  AlertCircle, Ban, FileText, ChevronRight,
} from 'lucide-react'
import { saveSessionNotes, updateAppointmentStatus } from '@/actions/appointments'

interface Props {
  appointment: {
    id:           string
    status:       string
    scheduledAt:  string
    durationMin:  number
    price:        string
    clientNotes:  string
    sessionNotes: string
  }
  client:      { id: string; name: string; phone: string; document: string }
  procedure:   { id: string; name: string; category: string; durationMin: number; price: string }
  professional: { id: string; name: string }
  branchName:  string
  slug:        string
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED:   'Concluído',
}
const STATUS_CHIP: Record<string, string> = {
  SCHEDULED:   'chip chip-muted',
  CONFIRMED:   'chip chip-brand',
  IN_PROGRESS: 'chip chip-warning',
  COMPLETED:   'chip chip-success',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p className="overline">{label}</p>
      {children}
    </div>
  )
}

export function AppointmentExecution({ appointment, client, procedure, professional, branchName, slug }: Props) {
  const router = useRouter()
  const [saveState, saveAction, savePending] = useActionState(saveSessionNotes, undefined)
  const [statusLoading, startStatusTransition] = useTransition()
  const [showCancelForm, setShowCancelForm]     = useState(false)
  const [cancelReason,   setCancelReason]       = useState('')

  const dt       = new Date(appointment.scheduledAt)
  const endDt    = new Date(dt.getTime() + appointment.durationMin * 60000)
  const dateStr  = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const timeStr  = `${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – ${endDt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  const price    = parseFloat(appointment.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const isActive    = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'].includes(appointment.status)
  const isCompleted = appointment.status === 'COMPLETED'

  function handleStatus(status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW') {
    startStatusTransition(async () => {
      await updateAppointmentStatus(appointment.id, status, slug,
        status === 'CANCELLED' ? cancelReason : undefined,
      )
      router.push(`/${slug}/agenda`)
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760, margin: '0 auto' }}>

      {/* Topo: voltar + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => router.push(`/${slug}/agenda`)}
          className="btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}
        >
          <ArrowLeft size={15} />
          Voltar para agenda
        </button>
        <span className={STATUS_CHIP[appointment.status] ?? 'chip chip-muted'}>
          {STATUS_LABEL[appointment.status] ?? appointment.status}
        </span>
      </div>

      {/* Hero: cliente + procedimento */}
      <div className="card" style={{ padding: 'var(--card-pad)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: 'var(--brand-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <User size={18} style={{ color: 'var(--brand)' }} />
              </div>
              <div>
                <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
                  {client.name}
                </h1>
                {client.phone && (
                  <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 1 }}>{client.phone}</p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Stethoscope size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
                {procedure.name}
              </span>
              {procedure.category && (
                <span className="chip chip-muted" style={{ fontSize: 10 }}>{procedure.category}</span>
              )}
            </div>
          </div>

          {/* Valor */}
          <div style={{
            textAlign: 'right', flexShrink: 0,
            padding: '10px 16px',
            background: 'var(--brand-soft)', borderRadius: 'var(--radius-card-sm)',
            border: '1px solid var(--brand-soft-border)',
          }}>
            <p className="overline" style={{ color: 'var(--brand)' }}>Valor</p>
            <p style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--brand)', marginTop: 2 }}>
              {price}
            </p>
          </div>
        </div>

        {/* Data / hora / profissional */}
        <div className="form-2col" style={{
          marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--hairline)',
        }}>
          <Field label="Data e hora">
            <div>
              <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{timeStr}</p>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>{dateStr}</p>
            </div>
          </Field>
          <Field label="Profissional">
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{professional.name}</p>
          </Field>
        </div>
      </div>

      {/* Observações do cliente (readonly) */}
      {appointment.clientNotes && (
        <div className="card" style={{ padding: 'var(--card-pad-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <FileText size={14} style={{ color: 'var(--text-faint)' }} />
            <p className="overline">Observações do cliente</p>
          </div>
          <p style={{
            fontSize: 'var(--text-sm-sz)', color: 'var(--text)',
            background: 'var(--bg-app)', borderRadius: 'var(--radius-field-token)',
            border: '1px solid var(--border)', padding: '10px 14px', lineHeight: 1.5,
          }}>
            {appointment.clientNotes}
          </p>
        </div>
      )}

      {/* Anotações da sessão */}
      <div className="card" style={{ padding: 'var(--card-pad-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <FileText size={14} style={{ color: 'var(--brand)' }} />
          <p className="overline">Anotações da sessão</p>
        </div>
        <form action={saveAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="hidden" name="_appointmentId" value={appointment.id} />
          <textarea
            name="session_notes"
            rows={5}
            className="field"
            defaultValue={appointment.sessionNotes}
            placeholder="Anamnese, evolução, observações clínicas…"
            style={{ resize: 'vertical', lineHeight: 1.55 }}
            disabled={isCompleted}
          />
          {!isCompleted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="submit" disabled={savePending} className="btn-secondary">
                {savePending ? 'Salvando…' : 'Salvar rascunho'}
              </button>
              {saveState?.success && (
                <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--success)', fontWeight: 700 }}>
                  Salvo
                </span>
              )}
              {saveState?.error && (
                <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 700 }}>
                  {saveState.error}
                </span>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Ações de status */}
      {isActive && (
        <div className="card" style={{ padding: 'var(--card-pad-sm)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {appointment.status !== 'IN_PROGRESS' && (
            <button
              disabled={statusLoading}
              onClick={() => handleStatus('IN_PROGRESS')}
              className="btn-primary"
              style={{ justifyContent: 'center' }}
            >
              <Clock size={14} />
              Iniciar atendimento
            </button>
          )}

          {appointment.status === 'IN_PROGRESS' && (
            <button
              disabled={statusLoading}
              onClick={() => handleStatus('COMPLETED')}
              className="btn-primary"
              style={{ justifyContent: 'center', background: 'var(--success)', borderColor: 'var(--success)' }}
            >
              <CheckCircle2 size={14} />
              {statusLoading ? 'Concluindo…' : 'Concluir atendimento'}
            </button>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={statusLoading}
              onClick={() => handleStatus('NO_SHOW')}
              className="btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <AlertCircle size={14} />
              Não compareceu
            </button>
            <button
              disabled={statusLoading}
              onClick={() => setShowCancelForm(v => !v)}
              className="btn-ghost"
              style={{ flex: 1, justifyContent: 'center', color: 'var(--warning)' }}
            >
              <Ban size={14} />
              Cancelar
            </button>
          </div>

          {showCancelForm && (
            <div style={{
              padding: '12px 14px', background: 'var(--warning-soft)',
              borderRadius: 'var(--radius-field-token)', border: '1px solid var(--warning)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--warning)' }}>
                Motivo do cancelamento *
              </label>
              <input
                type="text" className="field"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Descreva o motivo…"
                style={{ background: 'var(--surface)' }}
              />
              <button
                disabled={!cancelReason.trim() || statusLoading}
                onClick={() => handleStatus('CANCELLED')}
                className="btn-primary"
                style={{ justifyContent: 'center' }}
              >
                Confirmar cancelamento
              </button>
            </div>
          )}
        </div>
      )}

      {isCompleted && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0', color: 'var(--success)' }}>
          <CheckCircle2 size={16} />
          <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700 }}>Atendimento concluído</span>
        </div>
      )}

      {/* Link para prontuário */}
      <a
        href={`/${slug}/clients/${client.id}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: 'var(--radius-card-sm)',
          border: '1px solid var(--border)', color: 'var(--text-muted)',
          fontSize: 'var(--text-xs-sz)', fontWeight: 700,
          textDecoration: 'none', transition: 'border-color 0.12s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        <span>Ver ficha completa do cliente</span>
        <ChevronRight size={14} />
      </a>
    </div>
  )
}
