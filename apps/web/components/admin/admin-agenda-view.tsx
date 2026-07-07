'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// -- Tipos ---------------------------------------------------------------------
type AgendaView = 'day' | 'week'

interface Branch      { id: string; name: string; slug: string }
interface Appointment {
  id:              string
  scheduled_at:    string
  started_at:      string | null
  completed_at:    string | null
  status:          string
  branch_id:       string
  price:           number | null
  procedures:      { name: string } | null
  clients:         { name: string } | null
  users:           { name: string } | null
}

interface Props {
  view:         AgendaView
  selectedDate: string       // 'YYYY-MM-DD'
  todayStr:     string       // 'YYYY-MM-DD'
  branches:     Branch[]
  appointments: Appointment[]
}

// -- Constantes visuais --------------------------------------------------------
const GRID_START = 7    // 07:00
const GRID_END   = 21   // 21:00
const HOUR_H     = 72   // px por hora
const HOURS      = Array.from({ length: GRID_END - GRID_START }, (_, i) => i + GRID_START)
const GRID_H     = HOURS.length * HOUR_H

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  SCHEDULED:   { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', label: 'Agendado'      },
  CONFIRMED:   { bg: '#f5f3ff', border: '#c4b5fd', text: '#5b21b6', label: 'Confirmado'     },
  IN_PROGRESS: { bg: '#fffbeb', border: '#fcd34d', text: '#b45309', label: 'Em atendimento' },
  COMPLETED:   { bg: '#f0fdf4', border: '#86efac', text: '#15803d', label: 'Concluído'      },
  CANCELLED:   { bg: '#f9fafb', border: '#d1d5db', text: '#9ca3af', label: 'Cancelado'      },
  NO_SHOW:     { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', label: 'Não compareceu' },
}

// -- Helpers de data -----------------------------------------------------------
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function getMondayOf(dateStr: string): string {
  const d   = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return d.toISOString().slice(0, 10)
}

function fmtWeekday(dateStr: string, fmt: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' }) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', fmt)
}

function fmtDayFull(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtMonthYear(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', {
    month: 'long', year: 'numeric',
  })
}

// Duração do agendamento em minutos
function apptDuration(a: Appointment): number {
  if (a.started_at && a.completed_at) {
    const d = (new Date(a.completed_at).getTime() - new Date(a.started_at).getTime()) / 60000
    if (d > 5 && d <= 480) return d
  }
  return 60
}

// Top/height em px para o grid de dia
function apptTop(a: Appointment): number {
  const d = new Date(a.scheduled_at)
  const h = d.getHours() + d.getMinutes() / 60
  return Math.max(0, (h - GRID_START) * HOUR_H)
}

function apptHeight(a: Appointment): number {
  return Math.max(58, (apptDuration(a) / 60) * HOUR_H)
}

// -- View Dia -----------------------------------------------------------------
function DayGrid({ branches, appointments }: { branches: Branch[]; appointments: Appointment[] }) {
  const byBranch: Record<string, Appointment[]> = {}
  for (const b of branches) byBranch[b.id] = []
  for (const a of appointments) {
    const h = new Date(a.scheduled_at).getHours()
    if (h >= GRID_START && h < GRID_END) {
      byBranch[a.branch_id]?.push(a)
    }
  }

  const TIME_COL = 52  // px
  const MIN_COL  = 180 // px mínimo por filial

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh', borderRadius: 12, border: '1px solid var(--border)' }}>
      <div style={{ minWidth: TIME_COL + branches.length * MIN_COL }}>

        {/* Cabeçalho com nomes das filiais */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${TIME_COL}px repeat(${branches.length}, 1fr)`,
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div />
          {branches.map(b => (
            <div key={b.id} style={{
              padding: '10px 12px',
              fontSize: 11, fontWeight: 700, color: 'var(--text)',
              textAlign: 'center',
              borderLeft: '1px solid var(--hairline)',
              letterSpacing: '0.02em',
            }}>
              {b.name}
            </div>
          ))}
        </div>

        {/* Grade de horários */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${TIME_COL}px repeat(${branches.length}, 1fr)`,
          background: '#fff',
        }}>

          {/* Coluna de horas */}
          <div>
            {HOURS.map(h => (
              <div key={h} style={{
                height: HOUR_H,
                display: 'flex', alignItems: 'flex-start',
                paddingTop: 6,
                paddingRight: 8,
                justifyContent: 'flex-end',
                fontSize: 10, fontWeight: 600,
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
                borderTop: '1px solid var(--hairline)',
              }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Colunas por filial */}
          {branches.map(b => {
            const appts = byBranch[b.id] ?? []

            // Detecção simples de sobreposição: agrupamos por slots sobrepostos
            // e dividimos a largura
            const positioned: { appt: Appointment; col: number; totalCols: number }[] = []
            for (const a of appts) {
              const aStart = apptTop(a)
              const aEnd   = aStart + apptHeight(a)
              // Encontra quantos outros agendamentos sobrepõem este
              const overlaps = appts.filter(other => {
                if (other.id === a.id) return false
                const oStart = apptTop(other)
                const oEnd   = oStart + apptHeight(other)
                return aStart < oEnd && aEnd > oStart
              })
              const col       = overlaps.filter(o => apptTop(o) < apptTop(a) || (apptTop(o) === apptTop(a) && o.id < a.id)).length
              const totalCols = overlaps.length + 1
              positioned.push({ appt: a, col, totalCols })
            }

            return (
              <div key={b.id} style={{
                position: 'relative',
                height: GRID_H,
                borderLeft: '1px solid var(--hairline)',
              }}>
                {/* Linhas de hora */}
                {HOURS.map((_, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: 0, right: 0,
                    top: i * HOUR_H,
                    borderTop: '1px solid var(--hairline)',
                    pointerEvents: 'none',
                  }} />
                ))}

                {/* Linha de meia-hora */}
                {HOURS.map((_, i) => (
                  <div key={`h-${i}`} style={{
                    position: 'absolute', left: 0, right: 0,
                    top: i * HOUR_H + HOUR_H / 2,
                    borderTop: '1px dashed var(--hairline)',
                    pointerEvents: 'none',
                    opacity: 0.5,
                  }} />
                ))}

                {/* Agendamentos */}
                {positioned.map(({ appt: a, col, totalCols }) => {
                  const st  = STATUS_STYLE[a.status] ?? STATUS_STYLE.SCHEDULED!
                  const top = apptTop(a)
                  const h   = apptHeight(a)
                  const w   = `calc(${100 / totalCols}% - 6px)`
                  const l   = `calc(${(col / totalCols) * 100}% + 3px)`

                  return (
                    <div
                      key={a.id}
                      title={`${a.procedures?.name ?? '—'} · ${a.clients?.name ?? '—'} · ${a.users?.name ?? '—'}`}
                      style={{
                        position: 'absolute',
                        top:    top + 1,
                        left:   l,
                        width:  w,
                        height: h - 2,
                        background:   st.bg,
                        borderLeft:   `3px solid ${st.border}`,
                        borderRadius: 6,
                        padding:      '4px 6px',
                        overflow:     'hidden',
                        cursor:       'pointer',
                        zIndex:       1,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: st.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.procedures?.name ?? '—'}
                      </div>
                      <div style={{ fontSize: 10, color: st.text, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                        {a.clients?.name ?? '—'}
                      </div>
                      <div style={{ fontSize: 10, color: st.text, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                        {a.users?.name ?? '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// -- View Semana ---------------------------------------------------------------
function WeekGrid({
  mondayStr, todayStr, branches, appointments, onDayClick,
}: {
  mondayStr:   string
  todayStr:    string
  branches:    Branch[]
  appointments: Appointment[]
  onDayClick:  (dateStr: string) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i))

  const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

  const STATUS_DOT: Record<string, string> = {
    SCHEDULED:   '#3b82f6',
    CONFIRMED:   '#7c3aed',
    IN_PROGRESS: '#d97706',
    COMPLETED:   '#16a34a',
    CANCELLED:   '#9ca3af',
    NO_SHOW:     '#dc2626',
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)', background: '#fff' }}>
      <div style={{ minWidth: 700, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>

        {/* Cabeçalho dos dias */}
        {days.map((d, i) => {
          const isToday = d === todayStr
          const dayAppts = appointments.filter(a => a.scheduled_at.slice(0, 10) === d)
          return (
            <div
              key={d}
              onClick={() => onDayClick(d)}
              style={{
                padding: '10px 12px 8px',
                borderRight: i < 6 ? '1px solid var(--hairline)' : 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: isToday ? '#fdf2f4' : 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {DAY_NAMES[i]}
                </span>
                <span style={{
                  fontSize: 16, fontWeight: 800,
                  color: isToday ? 'var(--brand)' : 'var(--text)',
                  letterSpacing: '-0.02em',
                }}>
                  {new Date(d + 'T00:00:00').getDate()}
                </span>
              </div>
              {dayAppts.length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {dayAppts.length} horário{dayAppts.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )
        })}

        {/* Células com agendamentos */}
        {days.map((d, i) => {
          const dayAppts = appointments.filter(a => a.scheduled_at.slice(0, 10) === d)
          const isToday  = d === todayStr

          return (
            <div
              key={d}
              onClick={() => onDayClick(d)}
              style={{
                minHeight: 200,
                borderRight: i < 6 ? '1px solid var(--hairline)' : 'none',
                padding: '8px 6px',
                background: isToday ? '#fffbfb' : '#fff',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}
            >
              {dayAppts.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '8px 4px' }}>—</div>
              ) : dayAppts.map(a => {
                const st  = STATUS_STYLE[a.status] ?? STATUS_STYLE.SCHEDULED!
                const t   = new Date(a.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div
                    key={a.id}
                    title={`${t} · ${a.procedures?.name ?? '—'} · ${a.clients?.name ?? '—'} · ${a.users?.name ?? '—'}`}
                    style={{
                      background:   st.bg,
                      borderLeft:   `3px solid ${st.border}`,
                      borderRadius: 5,
                      padding:      '4px 6px',
                      overflow:     'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: st.text }}>{t}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {branches.find(b => b.id === a.branch_id)?.name ?? ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: st.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.procedures?.name ?? '—'}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: st.text, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                      {a.clients?.name ?? '—'}
                    </div>
                    <div style={{ fontSize: 10, color: st.text, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                      {a.users?.name ?? '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

      </div>
    </div>
  )
}

// -- Legenda de status ---------------------------------------------------------
function StatusLegend() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {Object.entries(STATUS_STYLE).map(([, st]) => (
        <div key={st.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: st.bg, border: `1px solid ${st.border}` }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{st.label}</span>
        </div>
      ))}
    </div>
  )
}

// -- Componente principal ------------------------------------------------------
export function AdminAgendaView({ view, selectedDate, todayStr, branches, appointments }: Props) {
  const router = useRouter()

  const mondayStr = getMondayOf(selectedDate)

  const navigate = (dateStr: string, v: AgendaView = view) => {
    router.push(`/admin/agenda?view=${v}&date=${dateStr}`)
  }

  const prevDate = view === 'week'
    ? addDays(mondayStr, -7)
    : addDays(selectedDate, -1)

  const nextDate = view === 'week'
    ? addDays(mondayStr, 7)
    : addDays(selectedDate, 1)

  // Label do período visível
  const periodLabel = view === 'day'
    ? fmtDayFull(selectedDate).replace(/^\w/, c => c.toUpperCase())
    : (() => {
        const sunday = addDays(mondayStr, 6)
        const mDate  = new Date(mondayStr + 'T00:00:00')
        const sDate  = new Date(sunday    + 'T00:00:00')
        if (mDate.getMonth() === sDate.getMonth()) {
          return `${mDate.getDate()} – ${sDate.getDate()} de ${sDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`
        }
        return `${mDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${sDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      })()

  const total     = appointments.length
  const completed = appointments.filter(a => a.status === 'COMPLETED').length
  const inProg    = appointments.filter(a => a.status === 'IN_PROGRESS').length
  const confirmed = appointments.filter(a => a.status === 'CONFIRMED').length
  const cancelled = appointments.filter(a => a.status === 'CANCELLED' || a.status === 'NO_SHOW').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Cabeçalho */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
          ✦ Rede
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
          Agenda
        </h1>
      </div>

      {/* Barra de controles */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>

        {/* Navegação de data */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate(prevDate)}
            className="btn-ghost"
            style={{ padding: '6px 8px' }}
            title="Anterior"
          >
            <ChevronLeft size={16} />
          </button>

          <div style={{ textAlign: 'center', minWidth: 220 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {periodLabel}
            </span>
          </div>

          <button
            onClick={() => navigate(nextDate)}
            className="btn-ghost"
            style={{ padding: '6px 8px' }}
            title="Próximo"
          >
            <ChevronRight size={16} />
          </button>

          {selectedDate !== todayStr && (
            <button
              onClick={() => navigate(todayStr)}
              className="btn-ghost"
              style={{ fontSize: 12, padding: '5px 12px', fontWeight: 600 }}
            >
              Hoje
            </button>
          )}
        </div>

        {/* Toggle de view */}
        <div style={{
          display: 'flex', gap: 3,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10, padding: 3,
        }}>
          {(['day', 'week'] as AgendaView[]).map(v => (
            <button
              key={v}
              onClick={() => navigate(selectedDate, v)}
              style={{
                padding: '6px 16px', borderRadius: 7, border: 'none',
                fontSize: 12, fontWeight: view === v ? 700 : 500, cursor: 'pointer',
                transition: 'all .15s',
                background: view === v ? 'var(--brand)' : 'transparent',
                color:      view === v ? '#fff' : 'var(--text-muted)',
              }}
            >
              {v === 'day' ? 'Dia' : 'Semana'}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs compactos */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Total',          value: total,     color: 'var(--brand)' },
          { label: 'Confirmados',    value: confirmed, color: '#7c3aed' },
          { label: 'Em atendimento', value: inProg,    color: '#d97706' },
          { label: 'Concluídos',     value: completed, color: '#16a34a' },
          { label: 'Cancelamentos',  value: cancelled, color: '#dc2626' },
        ].map(k => (
          <div key={k.label} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px',
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 8,
            flex: '1 1 100px',
          }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* Grade principal */}
      {view === 'day' ? (
        <DayGrid branches={branches} appointments={appointments} />
      ) : (
        <WeekGrid
          mondayStr={mondayStr}
          todayStr={todayStr}
          branches={branches}
          appointments={appointments}
          onDayClick={d => navigate(d, 'day')}
        />
      )}

      {/* Legenda */}
      <StatusLegend />

    </div>
  )
}
