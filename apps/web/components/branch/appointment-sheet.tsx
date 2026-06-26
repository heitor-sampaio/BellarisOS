'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, CheckCircle2, Clock, AlertCircle, Ban, Play } from 'lucide-react'
import Link from 'next/link'
import { updateAppointmentStatus } from '@/actions/appointments'

interface AppointmentEvent {
  id:               string
  status:           string
  clientName:       string
  procedureName:    string
  professionalName: string
  price:            string
  start:            string
}

interface AppointmentSheetProps {
  appointment: AppointmentEvent
  slug:        string
  userRole:    string
  onClose:     () => void
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED:   'Concluído',
  CANCELLED:   'Cancelado',
  NO_SHOW:     'Não compareceu',
}
const STATUS_CHIP: Record<string, string> = {
  SCHEDULED:   'chip chip-muted',
  CONFIRMED:   'chip chip-brand',
  IN_PROGRESS: 'chip chip-warning',
  COMPLETED:   'chip chip-success',
  CANCELLED:   'chip chip-muted',
  NO_SHOW:     'chip chip-muted',
}

export function AppointmentSheet({ appointment, slug, userRole, onClose }: AppointmentSheetProps) {
  const isProfessional = userRole === 'PROFESSIONAL'
  const router = useRouter()
  const [showCancelReason, setShowCancelReason] = useState(false)
  const [cancelReason, setCancelReason]         = useState('')
  const [loading, setLoading]                   = useState(false)

  const dt = new Date(appointment.start)
  const dateStr = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  async function changeStatus(status: Parameters<typeof updateAppointmentStatus>[1]) {
    setLoading(true)
    await updateAppointmentStatus(appointment.id, status, slug,
      status === 'CANCELLED' ? cancelReason : undefined
    )
    setLoading(false)
    if (status === 'IN_PROGRESS') {
      onClose()
      router.push(`/${slug}/agenda/${appointment.id}`)
    } else {
      onClose()
    }
  }

  const isDone    = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.status)
  const isActive  = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'].includes(appointment.status)

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(34,22,25,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 440 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span className={STATUS_CHIP[appointment.status] ?? 'chip chip-muted'}>
            {STATUS_LABEL[appointment.status] ?? appointment.status}
          </span>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={16} /></button>
        </div>

        {/* Info principal */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 'var(--text-name)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)', letterSpacing: 'var(--tracking-tight)' }}>
            {appointment.clientName}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {appointment.procedureName}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Clock size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
              <strong>{timeStr}</strong> — {dateStr}
            </span>
          </div>
          {!isProfessional && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg-app)', borderRadius: 'var(--radius-card-sm)', border: '1px solid var(--border)' }}>
              <div>
                <p className="overline">Profissional</p>
                <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)', marginTop: 3 }}>{appointment.professionalName}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className="overline">Valor</p>
                <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)', marginTop: 3 }}>
                  {parseFloat(appointment.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Ações de status */}
        {isActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Confirmar: só admins/recepcionistas */}
            {appointment.status === 'SCHEDULED' && !isProfessional && (
              <button disabled={loading} onClick={() => changeStatus('CONFIRMED')} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                <CheckCircle2 size={14} /> Confirmar agendamento
              </button>
            )}
            {appointment.status === 'CONFIRMED' && (
              <button disabled={loading} onClick={() => changeStatus('IN_PROGRESS')} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                <Play size={14} /> Iniciar atendimento
              </button>
            )}
            {appointment.status === 'IN_PROGRESS' && (
              <Link
                href={`/${slug}/agenda/${appointment.id}`}
                onClick={onClose}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 7 }}
              >
                <Play size={14} /> Retomar atendimento
              </Link>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={loading} onClick={() => changeStatus('NO_SHOW')} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                <AlertCircle size={14} /> Não compareceu
              </button>
              <button disabled={loading} onClick={() => setShowCancelReason(true)} className="btn-ghost" style={{ flex: 1, justifyContent: 'center', color: 'var(--warning)' }}>
                <Ban size={14} /> Cancelar
              </button>
            </div>

            {showCancelReason && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--warning)' }}>
                <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--warning)' }}>
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
                  disabled={!cancelReason.trim() || loading}
                  onClick={() => changeStatus('CANCELLED')}
                  className="btn-primary"
                  style={{ justifyContent: 'center' }}
                >
                  Confirmar cancelamento
                </button>
              </div>
            )}
          </div>
        )}

        {isDone && (
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-xs-sz)' }}>
            Este agendamento já foi encerrado.
          </p>
        )}
      </div>
    </div>
  )
}
