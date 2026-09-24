'use client'

import { addDays, startOfWeek, isSameDay, format } from 'date-fns'
import type { CalendarEvent } from './agenda-month-view'

interface Professional { id: string; name: string }

interface Props {
  currentDate:   Date
  events:        CalendarEvent[]
  professionals: Professional[]
  onEventClick:  (ev: CalendarEvent) => void
  onSlotClick:   (date: Date, profId?: string) => void
  canWrite:      boolean
}

const WEEKDAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']

const PROF_COLORS = [
  { bg: 'var(--brand-soft)', text: 'var(--brand)' },
  { bg: 'var(--info-soft)', text: 'var(--info)' },
  { bg: 'var(--success-soft)', text: 'var(--success)' },
  { bg: 'var(--cat-4-soft)', text: 'var(--cat-4)' },
  { bg: 'var(--cat-5-soft)', text: 'var(--cat-5)' },
  { bg: 'var(--cat-6-soft)', text: 'var(--cat-6)' },
]

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function shortName(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0] ?? name
  return `${parts[0] ?? ''} ${(parts[parts.length - 1] ?? '')[0] ?? ''}.`
}

function EventCard({ ev, onClick }: { ev: CalendarEvent; onClick: () => void }) {
  const time        = format(new Date(ev.start), 'HH:mm')
  const isProgress  = ev.status === 'IN_PROGRESS'
  const isConfirmed = ev.status === 'CONFIRMED'
  const isScheduled = ev.status === 'SCHEDULED'

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        padding:     '6px 8px',
        borderRadius: 8,
        marginBottom: 4,
        cursor:      'pointer',
        background:  isProgress ? 'var(--brand-soft)' : 'var(--surface)',
        border:      isScheduled
          ? '1.5px dashed var(--text-faint)'
          : `1px solid ${isProgress ? 'var(--brand-3)' : 'var(--border)'}`,
        borderLeft:  isProgress
          ? '3px solid var(--brand)'
          : isConfirmed
          ? '3px solid var(--success)'
          : '3px dashed var(--text-faint)',
        opacity: isScheduled ? 0.75 : 1,
        transition: 'box-shadow 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(34,22,25,.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--success)' }}>{time}</div>
      <div style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shortName(ev.clientName)}
      </div>
      <div style={{ fontSize: 'var(--text-overline)', color: isProgress ? 'var(--brand)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ev.isEvaluation ? 'Avaliação' : ev.procedureName}
      </div>
    </div>
  )
}

export function AgendaWeekView({ currentDate, events, professionals, onEventClick, onSlotClick, canWrite }: Props) {
  const monday   = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(monday, i))
  const today    = new Date()

  if (professionals.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
        Nenhum profissional cadastrado nesta filial.
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 148 }} />
          {weekDays.map((_, i) => <col key={i} />)}
        </colgroup>

        <thead>
          <tr>
            <th style={{ padding: '0 0 12px', borderBottom: '1px solid var(--border)' }} />
            {weekDays.map((day, i) => {
              const isToday = isSameDay(day, today)
              return (
                <th key={i} style={{ padding: '0 6px 12px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 4 }}>
                    {WEEKDAYS[i]}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: isToday ? 'var(--brand)' : 'var(--text)' }}>
                    {format(day, 'd')}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {professionals.map((pro, pi) => {
            const clr = PROF_COLORS[pi % PROF_COLORS.length]!
            return (
              <tr key={pro.id}>
                {/* Professional cell */}
                <td style={{
                  padding: '12px 10px',
                  borderBottom: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  verticalAlign: 'top',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: clr.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 'var(--text-2xs)', fontWeight: 800, color: clr.text,
                    }}>
                      {getInitials(pro.name)}
                    </div>
                    <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
                      {pro.name}
                    </span>
                  </div>
                </td>

                {/* Day cells */}
                {weekDays.map((day, di) => {
                  const dayEvs = events.filter(
                    e => e.professionalId === pro.id && isSameDay(new Date(e.start), day),
                  )
                  const isToday = isSameDay(day, today)

                  return (
                    <td
                      key={di}
                      style={{
                        padding: '8px 6px',
                        borderBottom: '1px solid var(--border)',
                        borderRight: di < 5 ? '1px solid var(--border)' : 'none',
                        verticalAlign: 'top',
                        minWidth: 110,
                        background: isToday ? 'rgba(195,77,107,0.025)' : undefined,
                        cursor: canWrite ? 'pointer' : 'default',
                      }}
                      onClick={() => canWrite && onSlotClick(day, pro.id)}
                    >
                      {dayEvs
                        .sort((a, b) => a.start.localeCompare(b.start))
                        .map(ev => (
                          <EventCard key={ev.id} ev={ev} onClick={() => onEventClick(ev)} />
                        ))}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
