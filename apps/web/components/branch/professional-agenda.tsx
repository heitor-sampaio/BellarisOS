'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  format, isSameDay, isSameMonth,
  startOfWeek, endOfWeek, addDays,
  startOfMonth, endOfMonth, getDay,
  addMonths, subMonths, addWeeks, subWeeks,
  parseISO, getHours, getMinutes,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { CalendarEvent } from './agenda-month-view'

type ViewMode = 'dia' | 'semana' | 'mes'

const STATUS_COLORS: Record<string, {
  bg: string; border: string
  pill: { bg: string; color: string }
  dot: string; label: string
}> = {
  SCHEDULED:   { bg: 'var(--surface)', border: 'var(--border)',   pill: { bg: '#f3f4f6', color: '#6b7280' }, dot: '#9ca3af',       label: 'Aguardando'       },
  CONFIRMED:   { bg: 'var(--surface)', border: 'var(--border)',   pill: { bg: '#dcfce7', color: '#16a34a' }, dot: '#22c55e',        label: 'Confirmado'       },
  IN_PROGRESS: { bg: '#fff0f4',        border: 'var(--brand)',    pill: { bg: 'var(--brand-soft)', color: 'var(--brand)' }, dot: 'var(--brand)', label: 'Em atendimento'   },
  COMPLETED:   { bg: 'var(--bg-app)',  border: 'var(--hairline)', pill: { bg: '#f3f4f6', color: '#9ca3af' }, dot: '#9ca3af',       label: 'Concluído'        },
  NO_SHOW:     { bg: 'var(--bg-app)',  border: 'var(--hairline)', pill: { bg: '#fef3c7', color: '#d97706' }, dot: '#d97706',       label: 'Não compareceu'   },
  CANCELLED:   { bg: 'var(--bg-app)',  border: 'var(--hairline)', pill: { bg: '#fee2e2', color: '#dc2626' }, dot: '#dc2626',       label: 'Cancelado'        },
}

const PX_PER_HOUR = 80
const DAY_START   = 7
const DAY_END     = 21
const WORK_MIN    = 8 * 60

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60
  if (h === 0) return `${m}min`
  return m > 0 ? `${h}h${m}` : `${h}h`
}

interface Props {
  events:           CalendarEvent[]
  slug:             string
  professionalName: string
  branchName:       string
  professionalId:   string
  branchId:         string
}

export function ProfessionalAgendaView({ events, slug, professionalName, branchName, professionalId, branchId }: Props) {
  const router = useRouter()
  const today  = useMemo(() => new Date(), [])

  // Realtime: atualiza a agenda ao receber qualquer mudança nos agendamentos deste profissional
  useEffect(() => {
    if (!professionalId) return
    const supabase = createClient()
    const channel  = supabase
      .channel(`agenda-prof-${professionalId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'appointments',
          filter: `professional_id=eq.${professionalId}`,
        },
        () => router.refresh(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [professionalId, router])

  const [view,         setView]    = useState<ViewMode>('dia')
  const [selectedDate, setSelected] = useState<Date>(today)
  const [weekBase,     setWeekBase] = useState<Date>(today)
  const [monthBase,    setMonthBase] = useState<Date>(today)

  // -- Lookup por dia --------------------------------------------------
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const key = format(parseISO(ev.start), 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [events])

  const dayEvents = useMemo(() =>
    (eventsByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? [])
      .slice()
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime()),
    [eventsByDay, selectedDate],
  )

  const todayEvents = useMemo(() =>
    eventsByDay.get(format(today, 'yyyy-MM-dd')) ?? [],
    [eventsByDay, today],
  )

  // -- KPIs ----------------------------------------------------------
  const heroEvent = useMemo(() => {
    const inProgress = todayEvents.find(e => e.status === 'IN_PROGRESS')
    if (inProgress) return { ev: inProgress, label: 'Em atendimento agora' }
    const now = Date.now()
    const next = todayEvents
      .filter(e => parseISO(e.start).getTime() > now && e.status !== 'CANCELLED' && e.status !== 'NO_SHOW')
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())[0]
    if (next) return { ev: next, label: 'Próximo atendimento' }
    return null
  }, [todayEvents])

  const todayDuration = useMemo(() =>
    todayEvents.reduce((s, e) => s + e.durationMin, 0), [todayEvents])

  const occupancyPct = Math.min(100, Math.round(todayDuration / WORK_MIN * 100))

  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(today, { weekStartsOn: 1 })
  const prevStart = addDays(weekStart, -7)
  const prevEnd   = addDays(weekEnd,   -7)

  const weekCount = useMemo(() =>
    events.filter(e => { const d = parseISO(e.start); return d >= weekStart && d <= weekEnd }).length,
    [events, weekStart, weekEnd],
  )
  const prevWeekCount = useMemo(() =>
    events.filter(e => { const d = parseISO(e.start); return d >= prevStart && d <= prevEnd }).length,
    [events, prevStart, prevEnd],
  )
  const weekDelta = weekCount - prevWeekCount

  function selectDay(d: Date) { setSelected(d); setWeekBase(d); setMonthBase(d); setView('dia') }

  // -- Semana (nav) --------------------------------------------------
  const navWeekStart = startOfWeek(weekBase, { weekStartsOn: 1 })
  const weekDays     = Array.from({ length: 7 }, (_, i) => addDays(navWeekStart, i))

  // -- Mês (grid) ----------------------------------------------------
  const mStart    = startOfMonth(monthBase)
  const mEnd      = endOfMonth(monthBase)
  const firstDow  = getDay(mStart) === 0 ? 6 : getDay(mStart) - 1
  const totalCell = Math.ceil((firstDow + mEnd.getDate()) / 7) * 7
  const monthCells = Array.from({ length: totalCell }, (_, i) => addDays(mStart, i - firstDow))

  // -- Time grid (dia) -----------------------------------------------
  const gridHeight = (DAY_END - DAY_START) * PX_PER_HOUR
  const hourLines  = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => i + DAY_START)

  function evTop(ev: CalendarEvent) {
    const d = parseISO(ev.start)
    return Math.max(0, (getHours(d) - DAY_START + getMinutes(d) / 60) * PX_PER_HOUR)
  }
  function evHeight(ev: CalendarEvent) {
    return Math.max(44, ev.durationMin / 60 * PX_PER_HOUR)
  }

  // Slots livres ≥ 30 min entre atendimentos
  const freeSlots = useMemo(() => {
    if (dayEvents.length < 2) return []
    return dayEvents.slice(0, -1).flatMap((ev, i) => {
      const endMs  = parseISO(ev.start).getTime() + ev.durationMin * 60000
      const nextMs = parseISO(dayEvents[i + 1]!.start).getTime()
      const gapMin = (nextMs - endMs) / 60000
      if (gapMin < 30) return []
      const endDate  = new Date(endMs)
      const nextDate = new Date(nextMs)
      const top      = (getHours(endDate) - DAY_START + getMinutes(endDate) / 60) * PX_PER_HOUR
      const height   = gapMin / 60 * PX_PER_HOUR
      return [{
        top, height,
        label: `${format(endDate, 'HH:mm')} – ${format(nextDate, 'HH:mm')}`,
      }]
    })
  }, [dayEvents])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* -- Header --------------------------------------------------- */}
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Minha agenda
          </h1>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 3 }}>
            {professionalName}{professionalName && ' · '}Unidade {branchName}
          </p>
        </div>

        {/* Switcher Dia / Semana / Mês */}
        <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
          {(['dia', 'semana', 'mes'] as ViewMode[]).map(v => (
            <button key={v} type="button" onClick={() => setView(v)} style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 700,
              border: 'none', cursor: 'pointer',
              background: view === v ? 'var(--brand)' : 'transparent',
              color: view === v ? '#fff' : 'var(--text-muted)',
              textTransform: 'capitalize',
              boxShadow: view === v ? '0 1px 6px rgba(195,77,107,.28)' : 'none',
              transition: 'all 0.15s',
            }}>
              {v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </div>

      {/* -- KPI strip ------------------------------------------------ */}
      <div className="kpi-grid" style={{ gap: 12 }}>

        {/* Card hero */}
        <div style={{
          borderRadius: 14, padding: '18px 20px',
          display: 'flex', alignItems: 'center', gap: 14,
          background: heroEvent ? 'var(--brand)' : 'var(--surface)',
          border: heroEvent ? 'none' : '1.5px solid var(--border)',
          boxShadow: heroEvent ? '0 2px 12px rgba(195,77,107,.22)' : 'none',
        }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
            background: heroEvent ? 'rgba(255,255,255,0.2)' : 'var(--bg-app)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: heroEvent ? 14 : 0, fontWeight: 800, color: '#fff',
          }}>
            {heroEvent
              ? initials(heroEvent.ev.clientName)
              : <Clock size={18} style={{ color: 'var(--text-faint)' }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: heroEvent ? 'rgba(255,255,255,0.65)' : 'var(--text-faint)', marginBottom: 3 }}>
              {heroEvent ? heroEvent.label : 'Hoje'}
            </p>
            {heroEvent ? (
              <>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {heroEvent.ev.clientName}
                </p>
                <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {format(parseISO(heroEvent.ev.start), 'HH:mm')} · {heroEvent.ev.isEvaluation ? 'Avaliação' : heroEvent.ev.procedureName}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Sem atendimentos</p>
            )}
          </div>
        </div>

        {/* Hoje */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>Hoje</p>
          <p style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1, marginBottom: 5 }}>
            {todayEvents.length}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            atendimento{todayEvents.length !== 1 ? 's' : ''}
            {todayDuration > 0 && ` · ${fmtDuration(todayDuration)}`}
          </p>
        </div>

        {/* Esta semana */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>Esta semana</p>
          <p style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1, marginBottom: 5 }}>
            {weekCount}
          </p>
          <p style={{ fontSize: 11, color: weekDelta > 0 ? '#16a34a' : weekDelta < 0 ? '#dc2626' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
            {weekDelta !== 0 && <span>{weekDelta > 0 ? '▲' : '▼'}</span>}
            {Math.abs(weekDelta)} vs. semana passada
          </p>
        </div>

        {/* Ocupação hoje */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>Ocupação hoje</p>
          <p style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1, marginBottom: 10 }}>
            {occupancyPct}%
          </p>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, background: 'var(--brand)', width: `${occupancyPct}%`, transition: 'width 0.4s' }} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          VIEW: DIA
      ══════════════════════════════════════════════════════════════ */}
      {view === 'dia' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

          {/* Nav de data */}
          <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" onClick={() => setSelected(d => addDays(d, -1))} className="btn-ghost" style={{ padding: '5px 8px' }}>
                <ChevronLeft size={15} />
              </button>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)', textTransform: 'capitalize' }}>
                {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </span>
              <button type="button" onClick={() => setSelected(d => addDays(d, 1))} className="btn-ghost" style={{ padding: '5px 8px' }}>
                <ChevronRight size={15} />
              </button>
              {!isSameDay(selectedDate, today) && (
                <button type="button" onClick={() => setSelected(today)} style={{
                  fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                  border: '1.5px solid var(--brand)', color: 'var(--brand)',
                  background: 'transparent', cursor: 'pointer',
                }}>
                  Hoje
                </button>
              )}
            </div>

            {/* Legenda */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {[
                { dot: '#22c55e',      label: 'Confirmado'      },
                { dot: 'var(--brand)', label: 'Em atendimento'  },
                { dot: '#9ca3af',      label: 'Aguardando'      },
              ].map(({ dot, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Grade de horários */}
          <div style={{ overflowY: 'auto', maxHeight: 620 }}>
            <div style={{ position: 'relative', height: gridHeight }}>

              {/* Linhas de hora */}
              {hourLines.map(h => (
                <div key={h} style={{
                  position: 'absolute', top: (h - DAY_START) * PX_PER_HOUR,
                  left: 0, right: 0, display: 'flex', alignItems: 'flex-start',
                  pointerEvents: 'none',
                }}>
                  <span style={{
                    width: 58, flexShrink: 0, textAlign: 'right', paddingRight: 12, paddingTop: 1,
                    fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', userSelect: 'none',
                  }}>
                    {h < DAY_END ? `${String(h).padStart(2, '0')}:00` : ''}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--hairline)', marginTop: 7 }} />
                </div>
              ))}

              {/* Slots livres */}
              {freeSlots.map((slot, i) => (
                <div key={i} style={{
                  position: 'absolute', top: slot.top + 2, left: 58, right: 16,
                  height: slot.height - 4, minHeight: 28,
                  border: '1.5px dashed #e2d4d8', borderRadius: 8,
                  display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10,
                }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--brand)', opacity: 0.55 }}>{slot.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>Horário livre</span>
                </div>
              ))}

              {/* Cards de atendimento */}
              {dayEvents.map(ev => {
                const st     = STATUS_COLORS[ev.status] ?? STATUS_COLORS['SCHEDULED']!
                const top    = evTop(ev)
                const height = evHeight(ev)
                const time   = format(parseISO(ev.start), 'HH:mm')
                const isIP   = ev.status === 'IN_PROGRESS'
                return (
                  <Link key={ev.id} href={`/${slug}/agenda/${ev.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{
                      position: 'absolute', top: top + 2, left: 58, right: 16, height: height - 4,
                      borderRadius: 10,
                      background: st.bg,
                      border: `1.5px solid ${isIP ? 'var(--brand)' : 'var(--border)'}`,
                      borderLeft: `3.5px solid ${st.dot}`,
                      padding: '10px 14px',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      cursor: 'pointer', overflow: 'hidden',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isIP ? '#fde4ec' : 'var(--bg-app)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = st.bg }}
                    >
                      {/* Linha superior: hora + duração + status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: isIP ? 'var(--brand)' : 'var(--text)', letterSpacing: '-0.01em' }}>
                          {time}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-faint)' }}>
                          · {ev.durationMin}min
                        </span>
                        <span style={{
                          fontSize: 9.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                          background: st.pill.bg, color: st.pill.color,
                        }}>
                          {st.label}
                        </span>
                      </div>
                      {/* Linha inferior: avatar + nome + procedimento */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                          background: isIP ? 'var(--brand)' : 'var(--brand-soft)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9.5, fontWeight: 800, color: isIP ? '#fff' : 'var(--brand)',
                        }}>
                          {initials(ev.clientName)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                            {ev.clientName}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                            {ev.isEvaluation ? 'Avaliação' : ev.procedureName}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}

              {/* Empty state (sem eventos — ainda renderiza a grade) */}
              {dayEvents.length === 0 && (
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  textAlign: 'center', pointerEvents: 'none',
                }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>Dia livre</p>
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>Nenhum atendimento agendado.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          VIEW: SEMANA
      ══════════════════════════════════════════════════════════════ */}
      {view === 'semana' && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <button type="button" onClick={() => setWeekBase(w => subWeeks(w, 1))} className="btn-ghost" style={{ padding: '5px 10px' }}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {format(weekDays[0]!, "d 'de' MMM", { locale: ptBR })} – {format(weekDays[6]!, "d 'de' MMM yyyy", { locale: ptBR })}
            </span>
            <button type="button" onClick={() => setWeekBase(w => addWeeks(w, 1))} className="btn-ghost" style={{ padding: '5px 10px' }}>
              <ChevronRight size={15} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
            {weekDays.map(day => {
              const key    = format(day, 'yyyy-MM-dd')
              const dayEvs = eventsByDay.get(key) ?? []
              const isToday = isSameDay(day, today)
              const isSel   = isSameDay(day, selectedDate)
              return (
                <button key={key} type="button" onClick={() => selectDay(day)} style={{
                  padding: '12px 8px 10px', borderRadius: 12,
                  border: isSel ? '1.5px solid var(--brand)' : isToday ? '1.5px solid #f4c0cb' : '1.5px solid var(--border)',
                  background: isSel ? 'var(--brand)' : isToday ? '#fef0f3' : 'var(--bg-app)',
                  cursor: 'pointer', textAlign: 'center',
                }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: isSel ? 'rgba(255,255,255,0.7)' : 'var(--text-faint)', marginBottom: 4 }}>
                    {format(day, 'EEE', { locale: ptBR }).replace('.', '')}
                  </p>
                  <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: isSel ? '#fff' : isToday ? 'var(--brand)' : 'var(--text)', marginBottom: 8, lineHeight: 1 }}>
                    {format(day, 'd')}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 16 }}>
                    {dayEvs.slice(0, 4).map(ev => (
                      <div key={ev.id} style={{ height: 3, borderRadius: 2, background: isSel ? 'rgba(255,255,255,0.55)' : (STATUS_COLORS[ev.status]?.dot ?? 'var(--brand)') }} />
                    ))}
                    {dayEvs.length > 4 && <p style={{ fontSize: 9, color: isSel ? 'rgba(255,255,255,0.65)' : 'var(--text-faint)', marginTop: 1 }}>+{dayEvs.length - 4}</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          VIEW: MÊS
      ══════════════════════════════════════════════════════════════ */}
      {view === 'mes' && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button type="button" onClick={() => setMonthBase(m => subMonths(m, 1))} className="btn-ghost" style={{ padding: '5px 10px' }}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>
              {format(monthBase, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button type="button" onClick={() => setMonthBase(m => addMonths(m, 1))} className="btn-ghost" style={{ padding: '5px 10px' }}>
              <ChevronRight size={15} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-faint)', padding: '4px 0' }}>
                {d}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {monthCells.map((day, i) => {
              const key     = format(day, 'yyyy-MM-dd')
              const dayEvs  = eventsByDay.get(key) ?? []
              const inMonth = isSameMonth(day, monthBase)
              const isToday = isSameDay(day, today)
              const isSel   = isSameDay(day, selectedDate)
              return (
                <button key={i} type="button" onClick={() => inMonth && selectDay(day)} style={{
                  padding: '7px 4px 6px', borderRadius: 8, border: 'none',
                  background: isSel ? 'var(--brand)' : isToday ? '#fef0f3' : 'transparent',
                  cursor: inMonth ? 'pointer' : 'default', textAlign: 'center',
                  opacity: inMonth ? 1 : 0.25,
                }}>
                  <p style={{ fontSize: 12.5, fontWeight: isSel || isToday ? 800 : 500, color: isSel ? '#fff' : isToday ? 'var(--brand)' : 'var(--text)', lineHeight: 1, marginBottom: 4 }}>
                    {format(day, 'd')}
                  </p>
                  {dayEvs.length > 0 && inMonth && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                      {dayEvs.slice(0, 3).map((_, j) => (
                        <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: isSel ? 'rgba(255,255,255,0.7)' : 'var(--brand)' }} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
