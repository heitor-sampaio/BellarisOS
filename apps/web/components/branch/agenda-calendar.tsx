'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

import { AppointmentModal } from './appointment-modal'
import { AppointmentSheet } from './appointment-sheet'
import { AgendaDayView } from './agenda-day-view'
import { AgendaWeekView } from './agenda-week-view'
import { AgendaMonthView } from './agenda-month-view'
import { rescheduleAppointment } from '@/actions/appointments'
import type { CalendarEvent } from './agenda-month-view'

type ViewMode = 'dia' | 'semana' | 'mes'

function toLocalDT(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface Client      { id: string; name: string; phone: string }
interface Procedure   { id: string; name: string; category: string; duration_min: number; price: string | number }
interface Professional { id: string; name: string }
interface Room        { id: string; name: string }

interface AgendaCalendarProps {
  branchId:      string
  branchName:    string
  slug:          string
  events:        CalendarEvent[]
  clients:       Client[]
  procedures:    Procedure[]
  professionals: Professional[]
  rooms:         Room[]
  canWrite:      boolean
  userRole:      string
}

// ── KPI helpers ─────────────────────────────────────────────────────────────

function calcKPIs(
  events: CalendarEvent[],
  professionals: Professional[],
  view: ViewMode,
  date: Date,
) {
  let from: Date, to: Date, workDays: number

  if (view === 'dia') {
    const d = new Date(date); d.setHours(0, 0, 0, 0)
    from = d; to = new Date(d.getTime() + 86399999); workDays = 1
  } else if (view === 'semana') {
    from = startOfWeek(date, { weekStartsOn: 1 })
    to   = addDays(from, 5)
    workDays = 6
  } else {
    from = startOfMonth(date); to = endOfMonth(date)
    workDays = to.getDate()
  }

  const windowEvs = events.filter(e => {
    const d = new Date(e.start)
    return d >= from && d <= to
  })

  const totalCount   = windowEvs.filter(e => !['CANCELLED', 'NO_SHOW'].includes(e.status)).length
  const waitingCount = windowEvs.filter(e => e.status === 'SCHEDULED').length
  const bookedMin    = windowEvs
    .filter(e => !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(e.status))
    .reduce((s, e) => s + e.durationMin, 0)
  const availMin     = professionals.length * workDays * 720  // 12 h/day
  const occupancy    = availMin > 0 ? Math.min(100, Math.round(bookedMin / availMin * 100)) : 0

  return { totalCount, waitingCount, occupancy }
}

// ── Label helpers ────────────────────────────────────────────────────────────

function navLabel(view: ViewMode, date: Date): string {
  if (view === 'dia')    return format(date, "EEEE, d 'de' MMMM", { locale: ptBR })
  if (view === 'semana') {
    const mon = startOfWeek(date, { weekStartsOn: 1 })
    const sat = addDays(mon, 5)
    return `${format(mon, "d")} – ${format(sat, "d 'de' MMMM", { locale: ptBR })}`
  }
  return format(date, "MMMM 'de' yyyy", { locale: ptBR })
}

function isCurrent(view: ViewMode, date: Date): boolean {
  const now = new Date()
  if (view === 'dia')    return isSameDay(date, now)
  if (view === 'semana') {
    const mon = startOfWeek(date, { weekStartsOn: 1 })
    const sat = addDays(mon, 5)
    return now >= mon && now <= sat
  }
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function navigate(view: ViewMode, date: Date, dir: 1 | -1): Date {
  if (view === 'dia')    return dir === 1 ? addDays(date, 1) : subDays(date, 1)
  if (view === 'semana') return dir === 1 ? addWeeks(date, 1) : subWeeks(date, 1)
  return dir === 1 ? addMonths(date, 1) : subMonths(date, 1)
}

function todayDate(view: ViewMode): Date {
  return new Date()
}

// ── Component ────────────────────────────────────────────────────────────────

export function AgendaCalendar({
  branchId, branchName, slug, events, clients, procedures, professionals, rooms, canWrite, userRole,
}: AgendaCalendarProps) {
  const router = useRouter()

  const [view,          setView]          = useState<ViewMode>('dia')
  const [currentDate,   setCurrentDate]   = useState(new Date())
  const [showCreate,    setShowCreate]    = useState(false)
  const [defaultDate,   setDefaultDate]   = useState('')
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [dropError,     setDropError]     = useState<string | null>(null)

  const { totalCount, waitingCount, occupancy } = calcKPIs(events, professionals, view, currentDate)

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const handleDrop = useCallback(async (eventId: string, newStart: Date, newProfId: string) => {
    const formData = new FormData()
    formData.set('_appointmentId', eventId)
    formData.set('scheduled_at',   newStart.toISOString())
    formData.set('professional_id', newProfId)
    formData.set('_slug',          slug)

    const result = await rescheduleAppointment(undefined, formData)
    if (result?.error) {
      setDropError(result.error)
      setTimeout(() => setDropError(null), 4000)
    } else {
      router.refresh()
    }
  }, [slug, router])

  // ── Slot click (open create modal) ────────────────────────────────────────
  function handleSlotClick(date: Date, _profId?: string) {
    if (!canWrite) return
    setDefaultDate(toLocalDT(date))
    setShowCreate(true)
  }

  // ── Month day click → switch to day view ──────────────────────────────────
  function handleDayClick(date: Date) {
    setCurrentDate(date)
    setView('dia')
  }

  // ── View switcher button ──────────────────────────────────────────────────
  const viewLabel: Record<ViewMode, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês' }

  return (
    <>
      {/* Drop error toast */}
      {dropError && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#dc2626', color: '#fff', padding: '10px 20px',
          borderRadius: 10, fontWeight: 700, fontSize: 'var(--text-sm-sz)',
          boxShadow: '0 4px 20px rgba(0,0,0,.2)', pointerEvents: 'none',
        }}>
          {dropError}
        </div>
      )}

      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
            Agenda
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{totalCount}</span> atendimentos
            {' · '}
            <span style={{ fontWeight: 700, color: occupancy >= 80 ? 'var(--brand)' : 'var(--text)' }}>{occupancy}%</span> de ocupação
            {waitingCount > 0 && (
              <>
                {' · '}
                <span style={{ fontWeight: 700, color: '#d97706' }}>{waitingCount}</span> aguardando confirmação
              </>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View switcher */}
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {(['dia', 'semana', 'mes'] as ViewMode[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  padding: '8px 16px',
                  fontSize: 'var(--text-xs-sz)', fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  background: view === v ? 'var(--brand)' : 'transparent',
                  color:      view === v ? '#fff' : 'var(--text-muted)',
                  transition: 'background 0.12s, color 0.12s',
                }}
              >
                {viewLabel[v]}
              </button>
            ))}
          </div>

          {canWrite && (
            <button
              type="button"
              onClick={() => { setDefaultDate(''); setShowCreate(true) }}
              className="btn-primary"
            >
              <Plus size={15} />
              Agendar
            </button>
          )}
        </div>
      </div>

      {/* Calendar card */}
      <div className="card" style={{ padding: 'var(--card-pad-sm)', overflow: 'hidden' }}>
        {/* Navigation bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setCurrentDate(d => navigate(view, d, -1))}
              className="btn-ghost"
              style={{ padding: '6px 8px', lineHeight: 0 }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', minWidth: 200, textAlign: 'center' }}>
              {navLabel(view, currentDate)}
            </span>
            <button
              type="button"
              onClick={() => setCurrentDate(d => navigate(view, d, 1))}
              className="btn-ghost"
              style={{ padding: '6px 8px', lineHeight: 0 }}
            >
              <ChevronRight size={16} />
            </button>
            {!isCurrent(view, currentDate) && (
              <button
                type="button"
                onClick={() => setCurrentDate(todayDate(view))}
                style={{
                  fontSize: 'var(--text-xs-sz)', fontWeight: 700,
                  padding: '4px 10px', borderRadius: 20,
                  border: '1.5px solid var(--brand-soft-border)',
                  background: 'var(--brand-soft)', color: 'var(--brand)',
                  cursor: 'pointer',
                }}
              >
                {view === 'dia' ? 'Hoje' : view === 'semana' ? 'Esta semana' : 'Este mês'}
              </button>
            )}
          </div>

          {/* Legend (day view only) */}
          {view === 'dia' && (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {[
                { color: '#3f9b6f', label: 'Confirmado' },
                { color: '#c34d6b', label: 'Em atendimento' },
                { color: '#c4b4b8', label: 'Aguardando' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{l.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Week view: occupancy */}
          {view === 'semana' && totalCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {totalCount} atendimentos · {occupancy}% de ocupação
            </span>
          )}
        </div>

        {/* View content */}
        {view === 'dia' && (
          <AgendaDayView
            currentDate={currentDate}
            events={events}
            professionals={professionals}
            canWrite={canWrite}
            onEventClick={setSelectedEvent}
            onSlotClick={handleSlotClick}
            onDrop={handleDrop}
          />
        )}
        {view === 'semana' && (
          <AgendaWeekView
            currentDate={currentDate}
            events={events}
            professionals={professionals}
            canWrite={canWrite}
            onEventClick={setSelectedEvent}
            onSlotClick={handleSlotClick}
          />
        )}
        {view === 'mes' && (
          <AgendaMonthView
            currentDate={currentDate}
            events={events}
            onDayClick={handleDayClick}
          />
        )}
      </div>

      {showCreate && (
        <AppointmentModal
          branchId={branchId}
          slug={slug}
          clients={clients}
          procedures={procedures}
          professionals={professionals}
          rooms={rooms}
          defaultDate={defaultDate}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); router.refresh() }}
        />
      )}

      {selectedEvent && (
        <AppointmentSheet
          appointment={selectedEvent}
          slug={slug}
          userRole={userRole}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  )
}
