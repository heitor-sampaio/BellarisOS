'use client'

import { createContext, useContext, useRef, useState } from 'react'
import { isSameDay, format } from 'date-fns'
import type { CalendarEvent } from './agenda-month-view'
import { SeloDaFicha } from '@/components/shared/selo-da-ficha'

interface Professional { id: string; name: string }

interface Props {
  currentDate:   Date
  events:        CalendarEvent[]
  professionals: Professional[]
  canWrite:      boolean
  onEventClick:  (ev: CalendarEvent) => void
  onSlotClick:   (date: Date, profId?: string) => void
  onDrop:        (eventId: string, newStart: Date, newProfId: string) => Promise<void>
  /** As horas da grade (o horário de funcionamento da unidade); sem ela, 07–21. */
  janela?:       { inicio: number; fim: number }
}

// A janela da grade vem do horário de funcionamento (prop `janela`); o
// padrão, sem ela, é o de antes. As funções abaixo a recebem.
const START_PADRAO = 7
const END_PADRAO   = 21
const HOUR_PX    = 80

interface Grade { START_HOUR: number; END_HOUR: number; TOTAL_PX: number; HOURS: number[] }
function gradeDe(inicio: number, fim: number): Grade {
  return { START_HOUR: inicio, END_HOUR: fim, TOTAL_PX: (fim - inicio) * HOUR_PX, HOURS: Array.from({ length: fim - inicio }, (_, i) => inicio + i) }
}
const GradeCtx = createContext<Grade>(gradeDe(START_PADRAO, END_PADRAO))
const TIME_COL_W = 60

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

function timeToY(isoStr: string, g: Grade): number {
  const d = new Date(isoStr)
  return (d.getHours() + d.getMinutes() / 60 - g.START_HOUR) * HOUR_PX
}

function yToTime(y: number, baseDate: Date, g: Grade): Date {
  const totalMin  = g.START_HOUR * 60 + Math.round(y / HOUR_PX * 60 / 15) * 15
  const clamped   = Math.max(g.START_HOUR * 60, Math.min((g.END_HOUR - 0.25) * 60, totalMin))
  const result    = new Date(baseDate)
  result.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0)
  return result
}

interface ColProps {
  pro:          Professional
  profColor:    { bg: string; text: string }
  events:       CalendarEvent[]
  currentDate:  Date
  isFirst:      boolean
  canWrite:     boolean
  draggingId:   string | null
  dropPreviewY: number | null
  onEventClick: (ev: CalendarEvent) => void
  onSlotClick:  (date: Date) => void
  onDragStart:  (e: React.DragEvent, id: string) => void
  onDragEnd:    () => void
  onDragOver:   (e: React.DragEvent, el: HTMLElement) => void
  onDrop:       (e: React.DragEvent, el: HTMLElement) => Promise<void>
}

function ProfColumn({
  events, currentDate, isFirst, canWrite,
  draggingId, dropPreviewY,
  onEventClick, onSlotClick, onDragStart, onDragEnd, onDragOver, onDrop,
}: ColProps) {
  const colRef = useRef<HTMLDivElement>(null)
  const g = useContext(GradeCtx)

  return (
    <div
      ref={colRef}
      style={{
        flex: 1, minWidth: 160, position: 'relative', height: g.TOTAL_PX,
        borderLeft: isFirst ? 'none' : '1px solid var(--border)',
        background: dropPreviewY !== null ? 'rgba(195,77,107,0.025)' : undefined,
        cursor: canWrite ? 'crosshair' : 'default',
      }}
      onDragOver={canWrite ? e => colRef.current && onDragOver(e, colRef.current) : undefined}
      onDrop={canWrite ? e => colRef.current && onDrop(e, colRef.current) : undefined}
      onClick={e => {
        if (!canWrite || draggingId) return
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        onSlotClick(yToTime(e.clientY - rect.top, currentDate, g))
      }}
    >
      {/* Hour grid lines */}
      {g.HOURS.map(h => (
        <div key={h} style={{
          position: 'absolute', top: (h - g.START_HOUR) * HOUR_PX,
          left: 0, right: 0, borderTop: '1px solid var(--border)', pointerEvents: 'none',
        }} />
      ))}

      {/* Half-hour lines */}
      {g.HOURS.map(h => (
        <div key={`h${h}`} style={{
          position: 'absolute', top: (h - g.START_HOUR) * HOUR_PX + HOUR_PX / 2,
          left: 0, right: 0, borderTop: '1px dashed var(--hairline)', pointerEvents: 'none',
        }} />
      ))}

      {/* Drop indicator */}
      {dropPreviewY !== null && (
        <div style={{ position: 'absolute', top: dropPreviewY, left: 0, right: 0, zIndex: 10, pointerEvents: 'none' }}>
          <div style={{ height: 2, background: 'var(--brand)', position: 'relative' }}>
            <div style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--brand)' }} />
          </div>
        </div>
      )}

      {/* Events */}
      {events.map(ev => {
        const top       = Math.max(0, timeToY(ev.start, g))
        const height    = Math.max(32, (ev.durationMin / 60) * HOUR_PX - 4)
        const isDragging = draggingId === ev.id
        const isProgress  = ev.status === 'IN_PROGRESS'
        const isConfirmed = ev.status === 'CONFIRMED' || ev.status === 'ARRIVED'
        const isArrived   = ev.status === 'ARRIVED'
        const isScheduled = ev.status === 'SCHEDULED'
        const isCompleted = ev.status === 'COMPLETED'
        const timeStr   = format(new Date(ev.start), 'HH:mm')
        const isDraggable = canWrite && !isCompleted

        return (
          <div
            key={ev.id}
            data-agendamento={ev.id}
            draggable={isDraggable}
            onDragStart={isDraggable ? e => { e.stopPropagation(); onDragStart(e, ev.id) } : undefined}
            onDragEnd={isDraggable ? onDragEnd : undefined}
            onClick={e => { e.stopPropagation(); onEventClick(ev) }}
            style={{
              position:   'absolute',
              top:        top + 2,
              left:       4, right: 4,
              height,
              borderRadius: 8,
              padding:    '5px 8px',
              overflow:   'hidden',
              cursor:     isDraggable ? 'grab' : 'pointer',
              userSelect: 'none',
              zIndex:     isDragging ? 1 : 2,
              opacity:    isDragging ? 0.3 : 1,
              transition: 'opacity 0.1s, box-shadow 0.1s',

              background:  isProgress ? 'var(--brand-soft)' : isCompleted ? 'var(--bg-app)' : 'var(--surface)',
              border:      isScheduled
                ? '1.5px dashed var(--text-faint)'
                : `1px solid ${isProgress ? 'var(--brand-3)' : 'var(--border)'}`,
              borderLeft:  isProgress
                ? '3.5px solid var(--brand)'
                : isConfirmed
                ? '3.5px solid var(--success)'
                : isCompleted
                ? '3.5px solid var(--text-faint)'
                : '3px dashed var(--text-faint)',
            }}
            onMouseEnter={e => {
              if (!isDragging) (e.currentTarget as HTMLElement).style.boxShadow = '0 3px 12px rgba(34,22,25,.10)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = 'none'
            }}
          >
            <div style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: isCompleted ? 'var(--text-faint)' : 'var(--success)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span>{timeStr} · {ev.durationMin}min</span>
              <SeloDaFicha estado={ev.fichaDeSaude} />
              {isProgress && <span style={{ color: 'var(--brand)' }}>· em atend.</span>}
              {isArrived && <span>· Chegou{ev.arrivedAt ? ` ${format(new Date(ev.arrivedAt), 'HH:mm')}` : ''}</span>}
              {isCompleted && <span style={{ color: 'var(--text-faint)' }}>· concluído</span>}
            </div>
            {height > 42 && (
              <div style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: isCompleted ? 'var(--text-muted)' : 'var(--text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.clientName}
              </div>
            )}
            {height > 64 && (
              <div style={{ fontSize: 'var(--text-overline)', color: isProgress ? 'var(--brand)' : isConfirmed ? 'var(--success)' : 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.procedureName}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function AgendaDayView({ currentDate, events, professionals, canWrite, onEventClick, onSlotClick, onDrop, janela }: Props) {
  const [draggingId,   setDraggingId]   = useState<string | null>(null)
  const [dropTarget,   setDropTarget]   = useState<{ profId: string; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const todayEvents = events.filter(e => isSameDay(new Date(e.start), currentDate))
  // A grade do horário da unidade, estendida pelos agendamentos do dia que
  // caem fora dele (um encaixe às 21 h não pode sumir da tela).
  let inicio = janela?.inicio ?? START_PADRAO, fim = janela?.fim ?? END_PADRAO
  for (const ev of todayEvents) {
    const a = new Date(ev.start), b = new Date(a.getTime() + ev.durationMin * 60000)
    inicio = Math.min(inicio, a.getHours())
    fim    = Math.max(fim, b.getHours() + (b.getMinutes() > 0 ? 1 : 0))
  }
  const g = gradeDe(inicio, Math.min(24, Math.max(fim, inicio + 1)))

  function getRelY(e: React.DragEvent, colEl: HTMLElement): number {
    const rect      = colEl.getBoundingClientRect()
    const scrollTop = scrollRef.current?.scrollTop ?? 0
    return Math.max(0, e.clientY - rect.top + scrollTop)
  }

  function handleDragOver(e: React.DragEvent, colEl: HTMLElement, profId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ profId, y: Math.min(g.TOTAL_PX - 2, getRelY(e, colEl)) })
  }

  async function handleDrop(e: React.DragEvent, colEl: HTMLElement, profId: string) {
    e.preventDefault()
    if (!draggingId) return
    const newStart = yToTime(getRelY(e, colEl), currentDate, g)
    setDraggingId(null)
    setDropTarget(null)
    await onDrop(draggingId, newStart, profId)
  }

  if (professionals.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
        Nenhum profissional cadastrado nesta filial.
      </div>
    )
  }

  return (
    <GradeCtx.Provider value={g}>
    <div className="table-wrap">
    <div ref={scrollRef} style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 320px)', minWidth: 500 }}>
      {/* Sticky professional headers — dentro do scroll para largura idêntica à do grid */}
      <div style={{
        display: 'flex', position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ width: TIME_COL_W, flexShrink: 0 }} />
        {professionals.map((pro, i) => {
          const clr    = PROF_COLORS[i % PROF_COLORS.length]!
          const proEvs = todayEvents.filter(e => e.professionalId === pro.id)
          return (
            <div key={pro.id} style={{
              flex: 1, minWidth: 160, padding: '12px 14px',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
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
                <div>
                  <div style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{pro.name}</div>
                  <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 1 }}>
                    {proEvs.length} atendimento{proEvs.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Grid */}
      <div style={{ display: 'flex', minHeight: g.TOTAL_PX }}>
        {/* Time labels */}
        <div style={{ width: TIME_COL_W, flexShrink: 0, position: 'relative' }}>
          {g.HOURS.map(h => (
            <div key={h} style={{
              position: 'absolute',
              top: (h - g.START_HOUR) * HOUR_PX - 7,
              right: 8,
              fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', userSelect: 'none',
            }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Professional columns */}
        {professionals.map((pro, i) => {
          const proEvs       = todayEvents.filter(e => e.professionalId === pro.id)
          const isDropTarget = dropTarget?.profId === pro.id

          return (
            <ProfColumn
              key={pro.id}
              pro={pro}
              profColor={PROF_COLORS[i % PROF_COLORS.length]!}
              events={proEvs}
              currentDate={currentDate}
              isFirst={i === 0}
              canWrite={canWrite}
              draggingId={draggingId}
              dropPreviewY={isDropTarget ? (dropTarget?.y ?? null) : null}
              onEventClick={onEventClick}
              onSlotClick={date => onSlotClick(date, pro.id)}
              onDragStart={(e, id) => setDraggingId(id)}
              onDragEnd={() => { setDraggingId(null); setDropTarget(null) }}
              onDragOver={(e, el) => handleDragOver(e, el, pro.id)}
              onDrop={(e, el) => handleDrop(e, el, pro.id)}
            />
          )
        })}
      </div>
    </div>
    </div>
    </GradeCtx.Provider>
  )
}
