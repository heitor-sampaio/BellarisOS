'use client'

import { minutosDesenhados, ladoALado, liberouOHorario } from '@/lib/agenda/desenho'
import { iniciaisDoNome } from '@estetica-os/utils'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  format, isSameDay, isSameMonth,
  startOfWeek, endOfWeek, addDays,
  startOfMonth, endOfMonth, getDay,
  addMonths, subMonths, addWeeks, subWeeks,
  parseISO, getHours, getMinutes,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { SegSelect } from '@/components/shared/seg-select'
import { ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react'
import { AppointmentModal } from './appointment-modal'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { estenderJanela, rolagemDaGrade } from '@/lib/agenda/grade'
import { ocupacaoDoDia } from '@/lib/metrics/ocupacao'
import { blocosDosBloqueios, livresEntre } from '@/lib/agenda/horario-livre'
import { intervalosDoDia, diaDaSemana, forasDoHorario, janelaDoDia, type Horario, type BlocoOcupado } from '@/lib/agenda/horario'
import type { CalendarEvent } from './agenda-month-view'
import { SeloDoMenor } from '@/components/shared/selo-do-menor'
import { BotaoBloquearHorario, BlocoDoBloqueio } from '@/components/shared/bloqueio-da-agenda'
import { bloqueioNoDia, type BloqueioDaAgenda } from '@/lib/agenda/bloqueio'
import { useAgora } from '@/lib/use-agora'
import { useFuso } from '@/components/shared/fuso'
import { naParede, isoNaParede, fusoLocal } from '@/lib/datetime'

type ViewMode = 'dia' | 'semana' | 'mes'

const STATUS_COLORS: Record<string, {
  bg: string; border: string
  pill: { bg: string; color: string }
  dot: string; label: string
}> = {
  SCHEDULED:   { bg: 'var(--surface)', border: 'var(--border)',   pill: { bg: 'var(--bg-app)', color: 'var(--text-muted)' }, dot: 'var(--text-faint)',       label: 'Aguardando'       },
  CONFIRMED:   { bg: 'var(--surface)', border: 'var(--border)',   pill: { bg: 'var(--success-soft)', color: 'var(--success)' }, dot: 'var(--success)',        label: 'Confirmado'       },
  ARRIVED:     { bg: 'var(--surface)', border: 'var(--success)',  pill: { bg: 'var(--success-soft)', color: 'var(--success)' }, dot: 'var(--success)',        label: 'Chegou'           },
  IN_PROGRESS: { bg: 'var(--bg-app)',        border: 'var(--brand)',    pill: { bg: 'var(--brand-soft)', color: 'var(--brand)' }, dot: 'var(--brand)', label: 'Em atendimento'   },
  COMPLETED:   { bg: 'var(--bg-app)',  border: 'var(--hairline)', pill: { bg: 'var(--bg-app)', color: 'var(--text-faint)' }, dot: 'var(--text-faint)',       label: 'Concluído'        },
  NO_SHOW:     { bg: 'var(--bg-app)',  border: 'var(--hairline)', pill: { bg: 'var(--warning-soft)', color: 'var(--warning)' }, dot: 'var(--warning)',       label: 'Não compareceu'   },
  CANCELLED:   { bg: 'var(--bg-app)',  border: 'var(--hairline)', pill: { bg: 'var(--danger-soft)', color: 'var(--danger)' }, dot: 'var(--danger)',       label: 'Cancelado'        },
}

const PX_PER_HOUR = 80

function initials(name: string) {
  return iniciaisDoNome(name)
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
  /** O horário de funcionamento da unidade (horas cheias): a grade abre nele. */
  janela:           { inicio: number; fim: number }
  /** A ocupação de hoje (D11): o horário da unidade, o dela e o que ela tem em outra unidade. */
  horarioDaUnidade:      Horario | null
  horarioDaProfissional: Horario | null
  ocupadoFora:           BlocoOcupado[]
  /** O dia do `?date=` (AAAA-MM-DD), conferido pela página (J-33). */
  dataInicial?:          string | null
  /** Os bloqueios pontuais DELA (decisão 3 da 7ª). */
  bloqueios?:            BloqueioDaAgenda[]
  /** A agenda em Gerenciar: ela bloqueia o próprio horário (e desfaz). */
  podeBloquear?:         boolean
  /**
   * O agendar da "Minha agenda" (A25 da 8ª simulação, decidido pelo princípio 3):
   * com a Agenda em Gerenciar "só os meus", ela agenda — para ela. A lista de
   * profissionais é só ela, quando atende nesta unidade.
   */
  agendar?: { procedures: { id: string; name: string; category: string; duration_min: number; price: string | number }[]; rooms: { id: string; name: string }[]; professionals: { id: string; name: string }[] } | null
  /** A28 da 12ª: o atalho para as comissões dela (quem tem o Financeiro em Ver), no topo da agenda. */
  comissoesHref?: string | null
}

export function ProfessionalAgendaView({
  events: eventosDoServidor, slug, professionalName, branchName, professionalId, branchId, janela,
  horarioDaUnidade, horarioDaProfissional, ocupadoFora: ocupadoForaDoServidor, dataInicial = null, bloqueios: bloqueiosDoServidor = [], podeBloquear = false, agendar = null,
  comissoesHref = null,
}: Props) {
  const [agendando, setAgendando] = useState(false)
  const router = useRouter()
  // F62: a grade desenha no relógio da UNIDADE (os horários "de parede",
  // `naParede`), qualquer que seja o do navegador.
  const fuso = useFuso()
  const events = useMemo(() => eventosDoServidor.map(e => ({
    ...e, start: isoNaParede(e.start, fuso)!, end: isoNaParede(e.end, fuso)!,
    arrivedAt: isoNaParede(e.arrivedAt, fuso), completedAt: isoNaParede(e.completedAt, fuso),
  })), [eventosDoServidor, fuso])
  const bloqueios = useMemo(() => bloqueiosDoServidor.map(b => ({ ...b, inicio: isoNaParede(b.inicio, fuso)!, fim: isoNaParede(b.fim, fuso)! })), [bloqueiosDoServidor, fuso])
  const ocupadoFora = useMemo(() => ocupadoForaDoServidor.map(b => ({ ...b, inicio: isoNaParede(b.inicio, fuso)! })), [ocupadoForaDoServidor, fuso])
  const today  = useMemo(() => naParede(new Date(), fuso), [fuso])
  // A26 da 12ª: o "agora" do destaque anda com o relógio (de 30 em 30 s). A tela
  // aberta na véspera congelava o dia e a hora: às 00:3x ela ainda dizia
  // "Próximo atendimento 22:00". Antes de hidratar, a hora da abertura.
  const agoraDoRelogio = useAgora()
  const agora = useMemo(() => (agoraDoRelogio != null ? naParede(new Date(agoraDoRelogio), fuso) : today), [agoraDoRelogio, today, fuso])

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
  // O dia vem do `?date=` (J-33: o link do aviso ou da ficha abria sempre em
  // hoje) e volta para a URL quando muda — como a agenda da unidade.
  const [selectedDate, setSelected] = useState<Date>(() => dataInicial ? new Date(`${dataInicial}T12:00:00`) : today)
  const [weekBase,     setWeekBase] = useState<Date>(() => dataInicial ? new Date(`${dataInicial}T12:00:00`) : today)
  const [monthBase,    setMonthBase] = useState<Date>(() => dataInicial ? new Date(`${dataInicial}T12:00:00`) : today)
  const diaNaUrl = format(selectedDate, 'yyyy-MM-dd')
  const diaInicial = useRef(diaNaUrl)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('date') === diaNaUrl) return
    if (!url.searchParams.has('date') && diaNaUrl === diaInicial.current) return
    url.searchParams.set('date', diaNaUrl)
    window.history.replaceState(null, '', url)
  }, [diaNaUrl])

  // -- Lookup por dia --------------------------------------------------
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const key = format(parseISO(ev.start), 'yyyy-MM-dd') // parede
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
    eventsByDay.get(format(agora, 'yyyy-MM-dd')) ?? [],
    [eventsByDay, agora],
  )

  // -- KPIs ----------------------------------------------------------
  const heroEvent = useMemo(() => {
    const inProgress = todayEvents.find(e => e.status === 'IN_PROGRESS')
    if (inProgress) return { ev: inProgress, label: 'Em atendimento agora' }
    const now = agora.getTime()
    // A26 da 12ª (princípio 3): o horário que já começou e segue em aberto (sem
    // ninguém iniciar) é o que importa agora — "Atrasado: N min", não o próximo.
    const atrasado = todayEvents
      .filter(e => ['SCHEDULED', 'CONFIRMED', 'ARRIVED'].includes(e.status))
      .filter(e => { const ini = parseISO(e.start).getTime(); return ini <= now && now < ini + e.durationMin * 60_000 })
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())[0]
    if (atrasado) {
      const min = Math.max(0, Math.floor((now - parseISO(atrasado.start).getTime()) / 60_000))
      return { ev: atrasado, label: atrasado.status === 'ARRIVED' ? `Chegou · atrasado ${min} min` : `Atrasado: ${min} min` }
    }
    // O já concluído (atendido antes da hora) também sai: o destaque dizia
    // "Próximo atendimento" de quem já tinha ido embora (simulação, 2026-10-20).
    const next = todayEvents
      .filter(e => parseISO(e.start).getTime() > now && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(e.status))
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())[0]
    if (next) return { ev: next, label: 'Próximo atendimento' }
    return null
  }, [todayEvents, agora])

  // As horas marcadas hoje ("· 2h35" no cartão Hoje).
  const todayDuration = useMemo(() =>
    todayEvents.filter(e => !['CANCELLED', 'NO_SHOW'].includes(e.status)).reduce((s, e) => s + e.durationMin, 0), [todayEvents])

  // A conta de lib/metrics, a mesma da agenda da unidade e do dashboard
  // (§13.1): sobre o horário dela — era um dia fixo de 8 h, na tela (D11 da
  // simulação de 2026-10-29). Nulo = sem expediente hoje: a tela mostra "—".
  // O tempo que ela bloqueou sai da capacidade, como o de outra unidade (D15 da 8ª).
  // O dela em OUTRA unidade (decisão 2 da 8ª: `unidade` preenchida) é cartão
  // na grade, mas na ocupação desta unidade conta como "ocupado fora", como antes.
  const occupancyPct = useMemo(() => ocupacaoDoDia(todayEvents.filter(e => !e.unidade),
    { unidade: horarioDaUnidade, profissional: horarioDaProfissional, ocupadoFora: [
      ...ocupadoFora,
      ...todayEvents.filter(e => e.unidade && !['CANCELLED', 'NO_SHOW'].includes(e.status)).map(e => ({ inicio: e.start, minutos: e.durationMin })),
      ...blocosDosBloqueios(bloqueios),
    ] }, agora, fusoLocal()),
  [todayEvents, horarioDaUnidade, horarioDaProfissional, ocupadoFora, agora, bloqueios])

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
  // A grade é o horário DELA no dia (unidade ∩ ela — "Reforça", item 8 da 5ª
  // simulação: a Renata, de 07–12, via a unidade inteira livre), estendida
  // pelos atendimentos de fora dele (§9.1). No dia em que ela não atende, a
  // janela da unidade, toda sombreada.
  const intervalosDela = intervalosDoDia(horarioDaUnidade, horarioDaProfissional, diaDaSemana(format(selectedDate, 'yyyy-MM-dd')))
  const naoAtende = intervalosDela.length === 0
  const { inicio: DAY_START, fim: DAY_END } = estenderJanela(janelaDoDia(intervalosDela) ?? janela, dayEvents)
  const forasDela = forasDoHorario(intervalosDela, DAY_START * 60, DAY_END * 60)
  const gridHeight = (DAY_END - DAY_START) * PX_PER_HOUR
  const hourLines  = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => i + DAY_START)

  // A26 da 11ª: na clínica 24 h a "Minha agenda" abria às 00:00 — eram 12
  // telas até o meio-dia no celular. Hoje, a grade rola até uma hora antes de
  // agora; outro dia, até o primeiro atendimento ou o começo do horário dela
  // (`rolagemDaGrade`, a régua da agenda da unidade).
  const gradeRef = useRef<HTMLDivElement>(null)
  const diaDaGrade = format(selectedDate, 'yyyy-MM-dd')
  const ehHojeNaGrade = diaDaGrade === format(naParede(new Date(), fuso), 'yyyy-MM-dd')
  const primeiroDoDia = dayEvents.length
    ? Math.min(...dayEvents.map(e => { const d = parseISO(e.start); return getHours(d) * 60 + getMinutes(d) }))
    : null
  const comecoDela = intervalosDela.length
    ? Math.min(...intervalosDela.map(i => { const [h, m] = i.de.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0) }))
    : null
  useEffect(() => {
    if (!gradeRef.current) return
    gradeRef.current.scrollTop = rolagemDaGrade({
      ehHoje: ehHojeNaGrade, horaAgora: naParede(new Date(), fuso).getHours(), startHour: DAY_START, hourPx: PX_PER_HOUR,
      aberturaEmMin: comecoDela, primeiroEmMin: primeiroDoDia,
    })
    gradeRef.current.dataset.rolagem = 'pronta'
  }, [diaDaGrade, ehHojeNaGrade, DAY_START, comecoDela, primeiroDoDia, fuso])

  function evTop(ev: CalendarEvent) {
    const d = parseISO(ev.start)
    return Math.max(0, (getHours(d) - DAY_START + getMinutes(d) / 60) * PX_PER_HOUR)
  }
  // A17 da 14ª: até quando OCUPA (fimDaOcupacao, a régua da recusa) — o
  // concluído adiantado é desenhado até a conclusão, e o que ainda se cruza
  // na tela fica lado a lado (`ladoALado`).
  function evHeight(ev: CalendarEvent) {
    return Math.max(44, minutosDesenhados(ev) / 60 * PX_PER_HOUR)
  }
  const lados = ladoALado(dayEvents, evTop, evHeight)
  function evLados(ev: CalendarEvent): React.CSSProperties {
    const l = lados.get(ev.id)
    if (!l || l.total < 2) return { left: 58, right: 16 }
    return { left: `calc(58px + (100% - 74px) * ${l.col} / ${l.total})`, width: `calc((100% - 74px) / ${l.total} - 4px)` }
  }

  // Slots livres ≥ 30 min entre atendimentos — tirado o que ela BLOQUEOU (D15
  // da 8ª simulação: a Débora de férias via "Horário livre 02:45 – 04:00"
  // dentro do bloqueio). A régua é a de lib/agenda/horario-livre.
  const freeSlots = useMemo(() => {
    if (dayEvents.length < 2) return []
    return dayEvents.slice(0, -1).flatMap((ev, i) => {
      // A17 da 14ª: o concluído adiantado libera o resto (a mesma régua do desenho).
      const endMs  = parseISO(ev.start).getTime() + minutosDesenhados(ev) * 60000
      const nextMs = parseISO(dayEvents[i + 1]!.start).getTime()
      return livresEntre(endMs, nextMs, bloqueios).map(([de, ate]) => {
        const deDate  = new Date(de)
        const ateDate = new Date(ate)
        return {
          top:    (getHours(deDate) - DAY_START + getMinutes(deDate) / 60) * PX_PER_HOUR,
          height: (ate - de) / 3_600_000 * PX_PER_HOUR,
          label:  `${format(deDate, 'HH:mm')} – ${format(ateDate, 'HH:mm')}`,
        }
      })
    })
  }, [dayEvents, DAY_START, bloqueios])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {agendando && agendar && (
        <AppointmentModal
          branchId={branchId} slug={slug}
          procedures={agendar.procedures} professionals={agendar.professionals} rooms={agendar.rooms}
          defaultDate={!isSameDay(selectedDate, today) ? `${format(selectedDate, 'yyyy-MM-dd')}T09:00` : undefined}
          profissionalInicialId={professionalId}
          onClose={() => setAgendando(false)}
          onSuccess={() => { setAgendando(false); router.refresh() }}
        />
      )}

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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {comissoesHref && (
          <Link data-minhas-comissoes href={comissoesHref} className="btn-ghost" style={{ fontSize: 'var(--text-xs-sz)' }}>
            Minhas comissões
          </Link>
        )}
        {/* O bloqueio do próprio horário (decisão 3 da 7ª): o almoço, a folga. */}
        {podeBloquear && professionalId && (
          <BotaoBloquearHorario branchId={branchId} profissionais={[]} soEu={{ id: professionalId, name: professionalName || 'Você' }} dia={selectedDate} />
        )}
        {podeBloquear && agendar && agendar.professionals.length > 0 && (
          <button type="button" className="btn-primary" onClick={() => setAgendando(true)}>
            <Plus size={15} /> Agendar
          </button>
        )}
        {/* Switcher Dia / Semana / Mês */}
        <SegSelect
          options={[{ key: 'dia', label: 'Dia' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mês' }]}
          value={view}
          onSelect={(k) => setView(k as ViewMode)}
          ariaLabel="Modo de visualização"
        />
        </div>
      </div>

      {/* -- KPI strip ------------------------------------------------ */}
      <div className="kpi-grid" style={{ gap: 12 }}>

        {/* Card hero — A26 da 11ª: abre o atendimento, e o nome não sai cortado. */}
        <DestaqueQueAbre href={heroEvent ? `/${slug}/agenda/${heroEvent.ev.id}` : null} style={{
          borderRadius: 'var(--radius-card-token)', padding: '18px 20px',
          display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
          background: heroEvent ? 'var(--brand)' : 'var(--surface)',
          border: heroEvent ? 'none' : '1.5px solid var(--border)',
          boxShadow: heroEvent ? '0 2px 12px rgba(195,77,107,.22)' : 'none',
        }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
            background: heroEvent ? 'rgba(255,255,255,0.2)' : 'var(--bg-app)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: heroEvent ? 14 : 0, fontWeight: 800, color: 'var(--on-brand)',
          }}>
            {heroEvent
              ? initials(heroEvent.ev.clientName)
              : <Clock size={18} style={{ color: 'var(--text-faint)' }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: heroEvent ? 'rgba(255,255,255,0.65)' : 'var(--text-faint)', marginBottom: 3 }}>
              {heroEvent ? heroEvent.label : 'Hoje'}
            </p>
            {heroEvent ? (
              <>
                <p data-nome-do-destaque style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--on-brand)', letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>
                  {heroEvent.ev.clientName}
                </p>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'rgba(255,255,255,0.75)', marginTop: 2, overflowWrap: 'anywhere' }}>
                  {format(parseISO(heroEvent.ev.start) /* parede */, 'HH:mm')} · {heroEvent.ev.procedureName}
                </p>
              </>
            ) : (
              // A30 da 7ª: com o de hoje já passado (ou concluído), "Sem
              // atendimentos" contradizia o "Hoje 1 atendimento" ao lado.
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
                {todayEvents.some(e => !['CANCELLED', 'NO_SHOW'].includes(e.status)) ? 'Nenhum outro atendimento hoje' : 'Sem atendimentos'}
              </p>
            )}
          </div>
        </DestaqueQueAbre>

        {/* Hoje */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>Hoje</p>
          <p style={{ fontSize: 'var(--text-display)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1, marginBottom: 5 }}>
            {todayEvents.length}
          </p>
          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
            atendimento{todayEvents.length !== 1 ? 's' : ''}
            {todayDuration > 0 && ` · ${fmtDuration(todayDuration)}`}
          </p>
        </div>

        {/* Esta semana */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>Esta semana</p>
          <p style={{ fontSize: 'var(--text-display)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1, marginBottom: 5 }}>
            {weekCount}
          </p>
          <p style={{ fontSize: 'var(--text-2xs)', color: weekDelta > 0 ? 'var(--success)' : weekDelta < 0 ? 'var(--danger)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
            {weekDelta !== 0 && <span>{weekDelta > 0 ? '▲' : '▼'}</span>}
            {Math.abs(weekDelta)} vs. semana passada
          </p>
        </div>

        {/* Ocupação hoje */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>Ocupação hoje</p>
          <p style={{ fontSize: 'var(--text-display)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1, marginBottom: 10 }}>
            {occupancyPct === null ? '—' : `${occupancyPct}%`}
          </p>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, background: 'var(--brand)', width: `${occupancyPct ?? 0}%`, transition: 'width 0.4s' }} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          VIEW: DIA
      ══════════════════════════════════════════════════════════════ */}
      {view === 'dia' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

          {/* Nav de data */}
          {/* A28 da 12ª: no celular, a navegação e a legenda quebram a LINHA, não o título nem a legenda. */}
          <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', rowGap: 8, columnGap: 12, borderBottom: '1px solid var(--hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <button type="button" onClick={() => setSelected(d => addDays(d, -1))} className="btn-ghost" style={{ padding: '5px 8px' }} aria-label="Dia anterior">
                <ChevronLeft size={15} />
              </button>
              <span data-titulo-do-dia style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {/* No celular, o dia curto ("qua, 11 de nov"); no computador, por extenso. */}
                <span className="onde-no-computador">{format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}</span>
                <span className="onde-no-celular">{format(selectedDate, "EEE, d 'de' MMM", { locale: ptBR })}</span>
              </span>
              <button type="button" onClick={() => setSelected(d => addDays(d, 1))} className="btn-ghost" style={{ padding: '5px 8px' }} aria-label="Próximo dia">
                <ChevronRight size={15} />
              </button>
              {!isSameDay(selectedDate, today) && (
                <button type="button" onClick={() => setSelected(today)} style={{
                  fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                  border: '1.5px solid var(--brand)', color: 'var(--brand)',
                  background: 'transparent', cursor: 'pointer',
                }}>
                  Hoje
                </button>
              )}
            </div>

            {/* Legenda */}
            <div data-legenda-da-agenda style={{ display: 'flex', alignItems: 'center', columnGap: 14, rowGap: 4, flexWrap: 'wrap' }}>
              {[
                { dot: 'var(--success)',      label: 'Confirmado'      },
                { dot: 'var(--brand)', label: 'Em atendimento'  },
                { dot: 'var(--text-faint)',      label: 'Aguardando'      },
              ].map(({ dot, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Grade de horários */}
          <div ref={gradeRef} data-rolagem-minha-agenda style={{ overflowY: 'auto', maxHeight: 620 }}>
            <div data-grade-minha-agenda style={{ position: 'relative', height: gridHeight }}>

              {/* Linhas de hora */}
              {hourLines.map(h => (
                <div key={h} style={{
                  position: 'absolute', top: (h - DAY_START) * PX_PER_HOUR,
                  left: 0, right: 0, display: 'flex', alignItems: 'flex-start',
                  pointerEvents: 'none',
                }}>
                  <span style={{
                    width: 58, flexShrink: 0, textAlign: 'right', paddingRight: 12, paddingTop: 1,
                    fontSize: 'var(--text-2xs)', fontWeight: 600, color: 'var(--text-faint)', userSelect: 'none',
                  }}>
                    {h < DAY_END ? `${String(h).padStart(2, '0')}:00` : ''}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--hairline)', marginTop: 7 }} />
                </div>
              ))}

              {/* O fora do horário dela, sombreado (como a coluna da agenda da unidade). */}
              {forasDela.map(f => (
                <div key={f.de} data-fora-do-horario aria-hidden style={{
                  position: 'absolute', top: (f.de / 60 - DAY_START) * PX_PER_HOUR, height: (f.ate - f.de) / 60 * PX_PER_HOUR,
                  left: 58, right: 0, background: 'var(--bg-app)', pointerEvents: 'none',
                }} />
              ))}

              {/* Os bloqueios dela no dia (decisão 3 da 7ª). */}
              {bloqueios.map(b => {
                const noDia = bloqueioNoDia(b, selectedDate)
                if (!noDia) return null
                const top = Math.max(0, (noDia.de / 60 - DAY_START) * PX_PER_HOUR)
                const fim = Math.min(gridHeight, (noDia.ate / 60 - DAY_START) * PX_PER_HOUR)
                if (fim <= top) return null
                return <BlocoDoBloqueio key={b.id} bloqueio={b} top={top} height={fim - top} esquerda={58} rotulo={`Bloqueado · ${b.motivo}`} podeDesfazer={podeBloquear} />
              })}

              {/* Slots livres */}
              {freeSlots.map((slot, i) => (
                <div key={i} style={{
                  position: 'absolute', top: slot.top + 2, left: 58, right: 16,
                  height: slot.height - 4, minHeight: 28,
                  border: '1.5px dashed var(--brand-soft-border)', borderRadius: 8,
                  display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10,
                }}>
                  <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--brand)', opacity: 0.55 }}>{slot.label}</span>
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', fontWeight: 600 }}>Horário livre</span>
                </div>
              ))}

              {/* Cards de atendimento */}
              {dayEvents.map(ev => {
                const st     = STATUS_COLORS[ev.status] ?? STATUS_COLORS['SCHEDULED']!
                const top    = evTop(ev)
                const height = evHeight(ev)
                const time   = format(parseISO(ev.start), 'HH:mm') // parede
                const isIP   = ev.status === 'IN_PROGRESS'
                // A24 da 8ª: o cartão de menos de 1 h (até 72 px) não tinha altura para
                // as duas linhas com o avatar — o procedimento saía cortado no de 30 e
                // no de 40 min. Curto, ele é duas linhas: a hora e a cliente, o procedimento.
                if (height - 4 < 76) {
                  return (
                    <Link key={ev.id} href={`/${slug}/agenda/${ev.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                      <div data-cartao-minha-agenda={ev.id} data-liberou={ev.status === 'COMPLETED' && liberouOHorario(ev) ? '' : undefined} {...(ev.unidade ? { 'data-outra-unidade': ev.unidade } : {})}
                        title={[time, ev.clientName, ev.procedureName, `${ev.durationMin} min`, ev.unidade ? `Na unidade ${ev.unidade}` : null].filter(Boolean).join(' · ')}
                        style={{
                          position: 'absolute', top: top + 2, ...evLados(ev), height: height - 4,
                          borderRadius: 10, background: st.bg,
                          border: `1.5px solid ${isIP ? 'var(--brand)' : 'var(--border)'}`, borderLeft: `3.5px solid ${st.dot}`,
                          padding: '3px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                          cursor: 'pointer', overflow: 'hidden',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                          <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: isIP ? 'var(--brand)' : 'var(--text)', flexShrink: 0 }}>{time}</span>
                          {/* O nome da cliente nunca some (A8 da 13ª): cede por último. */}
                          <span data-cliente-do-cartao style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: '5em' }}>{ev.clientName}</span>
                          <span style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: st.pill.color, flexShrink: 0 }}>· {st.label}</span>
                          <SeloDoMenor menor={ev.menor} />
                        </div>
                        {/* A8 da 13ª: o selo da outra unidade vai para a linha do
                            procedimento e encolhe com reticências — na linha da
                            cliente, sem encolher, ele empurrava o nome para fora. */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0 }}>
                          {ev.unidade && <SeloDaOutraUnidade unidade={ev.unidade} />}
                          <p data-procedimento-do-cartao style={{ fontSize: 'var(--text-overline)', lineHeight: 1.25, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {ev.procedureName} · {ev.durationMin}min
                          </p>
                        </div>
                      </div>
                    </Link>
                  )
                }
                return (
                  <Link key={ev.id} href={`/${slug}/agenda/${ev.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div data-cartao-minha-agenda={ev.id} data-liberou={ev.status === 'COMPLETED' && liberouOHorario(ev) ? '' : undefined} {...(ev.unidade ? { 'data-outra-unidade': ev.unidade } : {})} style={{
                      position: 'absolute', top: top + 2, ...evLados(ev), height: height - 4,
                      borderRadius: 10,
                      background: st.bg,
                      border: `1.5px solid ${isIP ? 'var(--brand)' : 'var(--border)'}`,
                      borderLeft: `3.5px solid ${st.dot}`,
                      padding: '10px 14px',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      cursor: 'pointer', overflow: 'hidden',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isIP ? 'var(--brand-soft)' : 'var(--bg-app)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = st.bg }}
                    >
                      {/* Linha superior: hora + duração + status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: isIP ? 'var(--brand)' : 'var(--text)', letterSpacing: '-0.01em' }}>
                          {time}
                        </span>
                        <span style={{ fontSize: 'var(--text-overline)', fontWeight: 600, color: 'var(--text-faint)' }}>
                          · {ev.durationMin}min
                        </span>
                        <span style={{
                          fontSize: 'var(--text-overline)', fontWeight: 700, padding: '2px 9px', borderRadius: 'var(--radius-chip-token)',
                          background: st.pill.bg, color: st.pill.color,
                        }}>
                          {st.label}
                        </span>
                        {/* A menor de idade (decisão 2 da 7ª; sobra da F29): a marca e o responsável na dica. */}
                        <SeloDoMenor menor={ev.menor} />
                        {/* O dela numa outra unidade em que atende (decisão 2 da 8ª). */}
                        {ev.unidade && <SeloDaOutraUnidade unidade={ev.unidade} />}
                      </div>
                      {/* Linha inferior: avatar + nome + procedimento */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                          background: isIP ? 'var(--brand)' : 'var(--brand-soft)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 'var(--text-overline)', fontWeight: 800, color: isIP ? 'var(--on-brand)' : 'var(--brand)',
                        }}>
                          {initials(ev.clientName)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p data-cliente-do-cartao style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                            {ev.clientName}
                          </p>
                          <p data-procedimento-do-cartao style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                            {ev.procedureName}
                          </p>
                          {/* A linha do responsável, quando o bloco tem altura para ela. */}
                          {ev.menor && height >= 96 && (
                            <p data-responsavel-do-agendamento style={{ fontSize: 'var(--text-2xs)', color: ev.menor.responsavel ? 'var(--text-muted)' : 'var(--warning)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                              {ev.menor.responsavel ?? 'Menor de idade, sem responsável legal no cadastro'}
                            </p>
                          )}
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
                  <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>{naoAtende ? 'Você não atende neste dia' : 'Dia livre'}</p>
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', marginTop: 4 }}>Nenhum atendimento agendado.</p>
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
            <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>
              {format(weekDays[0]!, "d 'de' MMM", { locale: ptBR })} – {format(weekDays[6]!, "d 'de' MMM yyyy", { locale: ptBR })}
            </span>
            <button type="button" onClick={() => setWeekBase(w => addWeeks(w, 1))} className="btn-ghost" style={{ padding: '5px 10px' }}>
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="agenda-week-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
            {weekDays.map(day => {
              const key    = format(day, 'yyyy-MM-dd')
              const dayEvs = eventsByDay.get(key) ?? []
              const isToday = isSameDay(day, today)
              const isSel   = isSameDay(day, selectedDate)
              return (
                <button key={key} type="button" onClick={() => selectDay(day)} style={{
                  padding: '12px 8px 10px', borderRadius: 'var(--radius-field-token)',
                  border: isSel ? '1.5px solid var(--brand)' : isToday ? '1.5px solid var(--brand-soft-border)' : '1.5px solid var(--border)',
                  background: isSel ? 'var(--brand)' : isToday ? 'var(--bg-app)' : 'var(--bg-app)',
                  cursor: 'pointer', textAlign: 'center',
                }}>
                  <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: isSel ? 'rgba(255,255,255,0.7)' : 'var(--text-faint)', marginBottom: 4 }}>
                    {format(day, 'EEE', { locale: ptBR }).replace('.', '')}
                  </p>
                  <p style={{ fontSize: 'var(--text-name)', fontWeight: 800, letterSpacing: '-0.02em', color: isSel ? 'var(--on-brand)' : isToday ? 'var(--brand)' : 'var(--text)', marginBottom: 8, lineHeight: 1 }}>
                    {format(day, 'd')}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 16 }}>
                    {dayEvs.slice(0, 4).map(ev => (
                      <div key={ev.id} style={{ height: 3, borderRadius: 2, background: isSel ? 'rgba(255,255,255,0.55)' : (STATUS_COLORS[ev.status]?.dot ?? 'var(--brand)') }} />
                    ))}
                    {dayEvs.length > 4 && <p style={{ fontSize: 'var(--text-overline)', color: isSel ? 'rgba(255,255,255,0.65)' : 'var(--text-faint)', marginTop: 1 }}>+{dayEvs.length - 4}</p>}
                  </div>
                  {/* O bloqueio dela no dia (sobra da F30): a semana também o diz; o dia o desenha. */}
                  {bloqueios.some(b => bloqueioNoDia(b, day)) && (
                    <span data-bloqueado-no-dia style={{ display: 'block', marginTop: 6, fontSize: 'var(--text-overline)', fontWeight: 700, color: isSel ? 'var(--on-brand)' : 'var(--warning)' }}>
                      Bloqueado
                    </span>
                  )}
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
            <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>
              {format(monthBase, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button type="button" onClick={() => setMonthBase(m => addMonths(m, 1))} className="btn-ghost" style={{ padding: '5px 10px' }}>
              <ChevronRight size={15} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-faint)', padding: '4px 0' }}>
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
                  background: isSel ? 'var(--brand)' : isToday ? 'var(--bg-app)' : 'transparent',
                  cursor: inMonth ? 'pointer' : 'default', textAlign: 'center',
                  opacity: inMonth ? 1 : 0.25,
                }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: isSel || isToday ? 800 : 500, color: isSel ? 'var(--on-brand)' : isToday ? 'var(--brand)' : 'var(--text)', lineHeight: 1, marginBottom: 4 }}>
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

/**
 * O destaque de hoje (o próximo atendimento): com atendimento, é um LINK para
 * a tela dele (A26 da 11ª: o cartão não abria nada); sem, a caixa de sempre.
 */
function DestaqueQueAbre({ href, style, children }: { href: string | null; style: React.CSSProperties; children: React.ReactNode }) {
  if (!href) return <div data-destaque-de-hoje style={style}>{children}</div>
  return <Link data-destaque-de-hoje href={href} style={style}>{children}</Link>
}

/**
 * "Na unidade X" no cartão da Minha agenda (decisão 2 da 8ª: o dela numa outra
 * unidade em que atende). Encolhe com reticências, com o nome inteiro na dica
 * (A8 da 13ª: no celular, o nome longo da unidade não cabia).
 */
function SeloDaOutraUnidade({ unidade }: { unidade: string }) {
  return (
    <span data-unidade-do-cartao className="chip chip-info" title={`Na unidade ${unidade}`}
      style={{ fontSize: 'var(--text-overline)', flex: '0 1 auto', minWidth: 0, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
      Na unidade {unidade}
    </span>
  )
}
