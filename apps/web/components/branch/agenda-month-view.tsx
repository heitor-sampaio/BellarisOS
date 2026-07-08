'use client'

import {
  addDays, startOfWeek, startOfMonth, endOfMonth,
  isSameDay, isSameMonth, format,
} from 'date-fns'

export interface CalendarEvent {
  id:              string
  start:           string
  end:             string
  durationMin:     number
  status:          string
  clientName:      string
  procedureName:   string
  isEvaluation:    boolean
  professionalId:  string
  professionalName: string
  price:           string
}

interface Props {
  currentDate: Date
  events:      CalendarEvent[]
  onDayClick:  (date: Date) => void
}

const WEEKDAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']

function getMonthGrid(date: Date): Date[] {
  const firstDay  = startOfMonth(date)
  const lastDay   = endOfMonth(date)
  const gridStart = startOfWeek(firstDay, { weekStartsOn: 1 })
  let gridEnd     = startOfWeek(addDays(lastDay, 6), { weekStartsOn: 1 })
  gridEnd         = addDays(gridEnd, 6)

  const days: Date[] = []
  let curr = new Date(gridStart)
  while (curr <= gridEnd) {
    days.push(new Date(curr))
    curr = addDays(curr, 1)
  }
  return days
}

function barColor(count: number): string {
  if (count === 0)  return 'transparent'
  if (count < 6)   return '#fcd5de'
  if (count < 11)  return '#e07a93'
  return '#c34d6b'
}

export function AgendaMonthView({ currentDate, events, onDayClick }: Props) {
  const days  = getMonthGrid(currentDate)
  const today = new Date()

  const counts = days.map(d =>
    events.filter(e => !['CANCELLED', 'NO_SHOW'].includes(e.status) && isSameDay(new Date(e.start), d)).length,
  )
  const maxCount = Math.max(1, ...counts)

  return (
    <div>
      {/* Day-of-week headers */}
      <div className="agenda-month-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, padding: '0 2px', marginBottom: 4 }}>
        {WEEKDAYS.map(d => (
          <div key={d} style={{
            textAlign: 'center', fontSize: 10, fontWeight: 700,
            color: 'var(--text-faint)', letterSpacing: '0.06em', padding: '6px 0',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="agenda-month-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, padding: '0 2px' }}>
        {days.map((day, i) => {
          const count      = counts[i] ?? 0
          const inMonth    = isSameMonth(day, currentDate)
          const isToday    = isSameDay(day, today)
          const barW       = count === 0 ? 0 : Math.round(Math.min(100, (count / Math.max(maxCount, 10)) * 100))
          const bColor     = barColor(count)

          return (
            <div
              key={i}
              onClick={() => inMonth && onDayClick(day)}
              className="agenda-month-cell"
              style={{
                background:   'var(--surface)',
                border:       isToday ? '2px solid var(--brand)' : '1px solid var(--border)',
                borderRadius: 10,
                padding:      '10px 12px 12px',
                minHeight:    86,
                cursor:       inMonth ? 'pointer' : 'default',
                opacity:      inMonth ? 1 : 0.3,
                display:      'flex', flexDirection: 'column', gap: 4,
                transition:   'border-color 0.12s',
              }}
              onMouseEnter={e => { if (inMonth && !isToday) e.currentTarget.style.borderColor = 'var(--brand-soft-border)' }}
              onMouseLeave={e => { if (!isToday) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <span style={{
                fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em',
                color: isToday ? 'var(--brand)' : 'var(--text)',
              }}>
                {format(day, 'd')}
              </span>

              {count > 0 ? (
                <>
                  <span className="agenda-cell-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                    {count} atend.
                  </span>
                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-app)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${barW}%`, height: '100%',
                        background: bColor, borderRadius: 2,
                      }} />
                    </div>
                  </div>
                </>
              ) : (
                inMonth && (
                  <span className="agenda-cell-label" style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>
                    Sem agenda
                  </span>
                )
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, justifyContent: 'flex-end', paddingRight: 4 }}>
        {[
          { label: 'Leve', color: '#fcd5de' },
          { label: 'Médio', color: '#e07a93' },
          { label: 'Cheio', color: '#c34d6b' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
