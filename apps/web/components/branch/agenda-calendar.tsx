'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths,
  startOfWeek, startOfMonth, endOfMonth, isSameDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { SegSelect } from '@/components/shared/seg-select'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

import { AppointmentModal } from './appointment-modal'
import { useNovoAgendamentoDaUrl } from '@/components/shared/novo-agendamento-da-url'
import { AppointmentSheet } from './appointment-sheet'
import { AgendaDayView } from './agenda-day-view'
import { AgendaWeekView } from './agenda-week-view'
import { AgendaMonthView } from './agenda-month-view'
import { rescheduleAppointment } from '@/actions/appointments'
import type { CalendarEvent } from './agenda-month-view'
import { ocupacaoEmPct, janelaDaGrade, type Horario } from '@/lib/agenda/horario'

type ViewMode = 'dia' | 'semana' | 'mes'

function toLocalDT(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface Procedure   { id: string; name: string; category: string; duration_min: number; price: string | number }
interface Professional { id: string; name: string }
interface Room        { id: string; name: string }

interface AgendaCalendarProps {
  branchId:      string
  branchName:    string
  slug:          string
  events:        CalendarEvent[]
  procedures:    Procedure[]
  professionals: Professional[]
  rooms:         Room[]
  canWrite:      boolean
  userRole:      string
  /** O horário de funcionamento da unidade e de cada profissional (nulo = o padrão / segue a unidade). */
  horarioDaUnidade?:          Horario | null
  horariosDosProfissionais?:  Record<string, Horario | null>
  /** O dia da URL (`?date=AAAA-MM-DD`); sem ele, hoje. */
  dataInicial?:  string | null
  /** `?cancelados=1`: a grade traz os cancelados e as faltas, apagados. */
  comCancelados?: boolean
}

// -- KPI helpers -------------------------------------------------------------

function calcKPIs(
  events: CalendarEvent[],
  professionals: Professional[],
  view: ViewMode,
  date: Date,
  horarioDaUnidade: Horario | null,
  horariosDosProfissionais: Record<string, Horario | null>,
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
  // A MESMA conta do dashboard (lib/agenda/horario): minutos agendados — os
  // concluídos contam — ÷ a capacidade do horário. Era 12 h por profissional
  // aqui e 8 h lá, sem os concluídos aqui: as duas telas davam números
  // diferentes (D12 da simulação de 2026-10-20).
  void workDays
  const bookedMin    = windowEvs
    .filter(e => !['CANCELLED', 'NO_SHOW'].includes(e.status))
    .reduce((s, e) => s + e.durationMin, 0)
  const occupancy    = ocupacaoEmPct(bookedMin, horarioDaUnidade,
    professionals.map(p => horariosDosProfissionais[p.id] ?? null), from, to) ?? 0

  return { totalCount, waitingCount, occupancy }
}

// -- Label helpers ------------------------------------------------------------

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

function todayDate(): Date {
  return new Date()
}

// -- Component ----------------------------------------------------------------

export function AgendaCalendar({
  branchId, slug, events, procedures, professionals, rooms, canWrite, userRole,
  horarioDaUnidade = null, horariosDosProfissionais = {}, dataInicial = null, comCancelados = false,
}: AgendaCalendarProps) {
  const router = useRouter()

  // Liga e desliga pela URL: quem traz os cancelados é o servidor (a consulta
  // da agenda os deixa de fora). O dia aberto vai junto, já na URL.
  function alternarCancelados() {
    const url = new URL(window.location.href)
    if (comCancelados) url.searchParams.delete('cancelados')
    else url.searchParams.set('cancelados', '1')
    router.replace(url.pathname + url.search, { scroll: false })
  }

  const [view,          setView]          = useState<ViewMode>('dia')
  const [currentDate,   setCurrentDateState] = useState(() => dataInicial ? new Date(`${dataInicial}T12:00:00`) : new Date())
  // O dia aberto vai para a URL sem nova navegação (o servidor já trouxe a janela).
  const setCurrentDate = useCallback((v: Date | ((d: Date) => Date)) => {
    setCurrentDateState(prev => {
      const prox = typeof v === 'function' ? v(prev) : v
      const url = new URL(window.location.href)
      url.searchParams.set('date', format(prox, 'yyyy-MM-dd'))
      window.history.replaceState(null, '', url)
      return prox
    })
  }, [])
  const [showCreate,    setShowCreate]    = useState(false)
  const [defaultDate,   setDefaultDate]   = useState('')
  const [clienteInicial, setClienteInicial] = useState<string | null>(null)
  // `?novo=1&cliente=`: a busca universal e a ficha abrem o modal por aqui.
  useNovoAgendamentoDaUrl(canWrite, cliente => { setDefaultDate(''); setClienteInicial(cliente); setShowCreate(true) })
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [dropError,     setDropError]     = useState<string | null>(null)

  const { totalCount, waitingCount, occupancy } = calcKPIs(events, professionals, view, currentDate, horarioDaUnidade, horariosDosProfissionais)

  // -- Drag-and-drop ----------------------------------------------------------
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

  // -- Slot click (open create modal) ----------------------------------------
  function handleSlotClick(date: Date) {
    if (!canWrite) return
    setDefaultDate(toLocalDT(date))
    setShowCreate(true)
  }

  // -- Month day click → switch to day view ----------------------------------
  function handleDayClick(date: Date) {
    setCurrentDate(date)
    setView('dia')
  }

  // -- View switcher button --------------------------------------------------
  const viewLabel: Record<ViewMode, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês' }

  return (
    <>
      {/* Drop error toast */}
      {dropError && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: 'var(--danger)', color: 'var(--surface)', padding: '10px 20px',
          borderRadius: 10, fontWeight: 700, fontSize: 'var(--text-sm-sz)',
          boxShadow: 'var(--shadow-popover)', pointerEvents: 'none',
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
                <span style={{ fontWeight: 700, color: 'var(--warning)' }}>{waitingCount}</span> aguardando confirmação
              </>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={alternarCancelados} aria-pressed={comCancelados}
            className={comCancelados ? 'filtro-toggle is-ativo' : 'filtro-toggle'}>
            {comCancelados ? 'Esconder cancelados' : 'Mostrar cancelados'}
          </button>
          {/* View switcher */}
          <SegSelect
            options={(['dia', 'semana', 'mes'] as ViewMode[]).map(v => ({ key: v, label: viewLabel[v] }))}
            value={view}
            onSelect={(k) => setView(k as ViewMode)}
            ariaLabel="Modo de visualização"
          />

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
              aria-label={view === 'dia' ? 'Dia anterior' : view === 'semana' ? 'Semana anterior' : 'Mês anterior'}
              className="btn-ghost"
              style={{ padding: '6px 8px', lineHeight: 0 }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', minWidth: 200, textAlign: 'center' }}>
              {navLabel(view, currentDate)}
            </span>
            <button
              type="button"
              onClick={() => setCurrentDate(d => navigate(view, d, 1))}
              aria-label={view === 'dia' ? 'Próximo dia' : view === 'semana' ? 'Próxima semana' : 'Próximo mês'}
              className="btn-ghost"
              style={{ padding: '6px 8px', lineHeight: 0 }}
            >
              <ChevronRight size={16} />
            </button>
            {!isCurrent(view, currentDate) && (
              <button
                type="button"
                onClick={() => setCurrentDate(todayDate())}
                style={{
                  fontSize: 'var(--text-xs-sz)', fontWeight: 700,
                  padding: '4px 10px', borderRadius: 'var(--radius-chip-token)',
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
                { color: 'var(--success)', label: 'Confirmado' },
                { color: 'var(--brand)', label: 'Em atendimento' },
                { color: 'var(--text-faint)', label: 'Aguardando' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 600 }}>{l.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Week view: occupancy */}
          {view === 'semana' && totalCount > 0 && (
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', fontWeight: 600 }}>
              {totalCount} atendimentos · {occupancy}% de ocupação
            </span>
          )}
        </div>

        {/* View content */}
        {view === 'dia' && (
          <AgendaDayView
            janela={janelaDaGrade([horarioDaUnidade])}
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
          procedures={procedures}
          professionals={professionals}
          rooms={rooms}
          defaultDate={defaultDate}
          clienteInicialId={clienteInicial}
          onClose={() => { setShowCreate(false); setClienteInicial(null) }}
          onSuccess={() => { setShowCreate(false); setClienteInicial(null); router.refresh() }}
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
