'use client'

import { minutosDesenhados, ladoALado, liberouOHorario } from '@/lib/agenda/desenho'
import { rotulosDaMinhaAgenda, semanaEmLista, destaqueDaMinhaAgenda } from '@/lib/agenda/minha-agenda'
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
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import Link from 'next/link'
import { useSinais } from '@/components/shared/realtime-refresher'
import { estenderJanela, rolagemDaGrade } from '@/lib/agenda/grade'
import { agendamentosNoDia, janelaComOsTrechos, textoDoQueContinua } from '@/lib/agenda/trecho-do-agendamento'
import { ocupacaoDoDia, minutosAgendadosNoPeriodo } from '@/lib/metrics/ocupacao'
import { blocosDosBloqueios, livresEntre } from '@/lib/agenda/horario-livre'
import { intervalosDoDia, diaDaSemana, forasDoHorario, janelaDoDia, type Horario, type BlocoOcupado } from '@/lib/agenda/horario'
import type { CalendarEvent } from './agenda-month-view'
import { SeloDoMenor } from '@/components/shared/selo-do-menor'
import { BlocoDoBloqueio } from '@/components/shared/bloqueio-da-agenda'
import { bloqueioNoDia, type BloqueioDaAgenda } from '@/lib/agenda/bloqueio'
import { useAgora } from '@/lib/use-agora'
import { useFuso } from '@/components/shared/fuso'
import { naParede, isoNaParede, fusoLocal, startOfDayTZ, endOfDayTZ } from '@/lib/datetime'
import { horaNaUnidadeDele, comORelogio } from '@/lib/unidades/hora-da-unidade'
import { ROTULO_DO_STATUS } from '@/lib/agenda/rotulo-do-status'
import { fimDaOcupacao } from '@/lib/appointments/ocupacao'
import { LEGENDA_DA_AGENDA } from '@/lib/agenda/legenda'

type ViewMode = 'dia' | 'semana' | 'mes'

const STATUS_COLORS: Record<string, {
  bg: string; border: string
  pill: { bg: string; color: string }
  dot: string; label: string
}> = {
  SCHEDULED:   { bg: 'var(--surface)', border: 'var(--border)',   pill: { bg: 'var(--bg-app)', color: 'var(--text-muted)' }, dot: 'var(--text-faint)',       label: ROTULO_DO_STATUS.SCHEDULED },
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
  /**
   * A28 da 12ª: o atalho para as comissões, no topo da agenda. O rótulo diz o
   * que a página é: "Comissões" (as de todos) com o Financeiro em Ver,
   * "Minhas comissões" na vista pessoal.
   */
  comissoes?: { href: string; rotulo: string } | null
}

export function ProfessionalAgendaView({
  events: eventosDoServidor, slug, professionalName, branchName, professionalId, janela,
  horarioDaUnidade, horarioDaProfissional, ocupadoFora: ocupadoForaDoServidor, dataInicial = null, bloqueios: bloqueiosDoServidor = [],
  comissoes = null,
}: Props) {
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
  // D3 da 26ª (princípio 3): o dela em OUTRA unidade fica no instante certo da
  // grade (o relógio deste portal), mas a HORA escrita é a da unidade dele — a
  // que a agenda de lá mostra —, com o relógio quando não é o desta tela:
  // "18:55 (horário de Cuiabá)". Era 19:55 aqui e 18:55 lá, sem aviso.
  const horaDeFora = useMemo(() => new Map(eventosDoServidor
    .filter(e => e.unidade && e.fusoDaUnidade)
    .map(e => [e.id, horaNaUnidadeDele(e.start, e.fusoDaUnidade, fuso)] as const)), [eventosDoServidor, fuso])
  const horaDoCartao = (ev: CalendarEvent) => horaDeFora.get(ev.id) ?? { hora: format(parseISO(ev.start), 'HH:mm') /* parede */, relogio: null }
  // O "até" do destaque (25/11): o dela em outra unidade, no relógio de lá (como o início, D3 da 26ª).
  const ateDoCartao = (ev: CalendarEvent, naParedeDaTela: string) => {
    const doServidor = horaDeFora.has(ev.id) ? eventosDoServidor.find(e => e.id === ev.id) : undefined
    if (!doServidor?.fusoDaUnidade) return naParedeDaTela
    const fim = new Date(fimDaOcupacao({ scheduled_at: doServidor.start, duration_min: doServidor.durationMin })).toISOString()
    return `até ${horaNaUnidadeDele(fim, doServidor.fusoDaUnidade, fuso).hora}`
  }
  const today  = useMemo(() => naParede(new Date(), fuso), [fuso])
  // A26 da 12ª: o "agora" do destaque anda com o relógio (de 30 em 30 s). A tela
  // aberta na véspera congelava o dia e a hora: às 00:3x ela ainda dizia
  // "Próximo atendimento 22:00". Antes de hidratar, a hora da abertura.
  const agoraDoRelogio = useAgora()
  const agora = useMemo(() => (agoraDoRelogio != null ? naParede(new Date(agoraDoRelogio), fuso) : today), [agoraDoRelogio, today, fuso])

  // Realtime: o sinal da agenda da rede (sem conteúdo — o Heitor, 19/11, "vai
  // na 2"); a página recarrega pelo servidor, que lê só os agendamentos dela.
  useSinais(['agenda'], () => router.refresh(), !!professionalId)

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

  // A grade do dia: os que começam nele e os que continuam de antes (25/11: o
  // atendimento que atravessa a meia-noite, ou dura dias, ocupa cada dia — o
  // dia seguinte aparecia "Dia livre", e o choque recusava).
  const doDiaDaGrade = useMemo(() =>
    agendamentosNoDia(events, selectedDate)
      .sort((a, b) => parseISO(a.ev.start).getTime() - parseISO(b.ev.start).getTime()),
    [events, selectedDate],
  )
  const dayEvents = useMemo(() => doDiaDaGrade.map(x => x.ev), [doDiaDaGrade])
  const trechoDoDia = useMemo(() => new Map(doDiaDaGrade.map(x => [x.ev.id, x.trecho])), [doDiaDaGrade])

  const todayEvents = useMemo(() =>
    eventsByDay.get(format(agora, 'yyyy-MM-dd')) ?? [],
    [eventsByDay, agora],
  )

  // -- KPIs ----------------------------------------------------------
  // O destaque (em atendimento agora, atrasado, o próximo) olha quem OCUPA hoje
  // (25/11): o longo em atendimento desde ontem também é "agora" (lib/agenda/minha-agenda).
  const heroEvent = useMemo(() => destaqueDaMinhaAgenda(events, agora), [events, agora])

  // As horas de hoje ("· 2h35" no cartão Hoje): o que cada atendimento ocupa
  // HOJE (25/11: o que continua de ontem conta o trecho de hoje; o que segue
  // amanhã, só até a meia-noite). A contagem ao lado segue pelo dia de início.
  const todayDuration = useMemo(() =>
    minutosAgendadosNoPeriodo(events, startOfDayTZ(agora, fusoLocal()), endOfDayTZ(agora, fusoLocal())), [events, agora])

  // A conta de lib/metrics, a mesma da agenda da unidade e do dashboard
  // (§13.1): sobre o horário dela — era um dia fixo de 8 h, na tela (D11 da
  // simulação de 2026-10-29). Nulo = sem expediente hoje: a tela mostra "—".
  // O tempo que ela bloqueou sai da capacidade, como o de outra unidade (D15 da 8ª).
  // O dela em OUTRA unidade (decisão 2 da 8ª: `unidade` preenchida) é cartão
  // na grade, mas na ocupação desta unidade conta como "ocupado fora", como antes.
  // 25/11: os de hoje são os que OCUPAM hoje (o que continua de ontem também), e
  // `ocupacaoDoDia` conta de cada um só o trecho de hoje.
  const ocupamHoje = useMemo(() => agendamentosNoDia(events, agora).map(x => x.ev), [events, agora])
  const occupancyPct = useMemo(() => ocupacaoDoDia(ocupamHoje.filter(e => !e.unidade),
    { unidade: horarioDaUnidade, profissional: horarioDaProfissional, ocupadoFora: [
      ...ocupadoFora,
      ...ocupamHoje.filter(e => e.unidade && !['CANCELLED', 'NO_SHOW'].includes(e.status)).map(e => ({ inicio: e.start, minutos: e.durationMin })),
      ...blocosDosBloqueios(bloqueios),
    ] }, agora, fusoLocal()),
  [ocupamHoje, horarioDaUnidade, horarioDaProfissional, ocupadoFora, agora, bloqueios])

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
  // A22 da 22ª: com algum dela em outra unidade nesta semana, os cartões dizem de onde é cada número.
  const rotulos = rotulosDaMinhaAgenda({
    deOutraUnidade: events.some(e => { const d = parseISO(e.start); return !!e.unidade && d >= weekStart && d <= weekEnd }),
    unidade: branchName,
  })

  function selectDay(d: Date) { setSelected(d); setWeekBase(d); setMonthBase(d); setView('dia') }

  // -- Semana (nav) --------------------------------------------------
  const navWeekStart = startOfWeek(weekBase, { weekStartsOn: 1 })
  const weekDays     = Array.from({ length: 7 }, (_, i) => addDays(navWeekStart, i))
  // A27 da 23ª: a semana em lista, por dia (a chave do dia no relógio da grade).
  const semanaDaLista = semanaEmLista(events, weekDays.map(d => format(d, 'yyyy-MM-dd')), st => format(parseISO(st), 'yyyy-MM-dd')) // parede

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
  const { inicio: DAY_START, fim: DAY_END } = janelaComOsTrechos(
    estenderJanela(janelaDoDia(intervalosDela) ?? janela, doDiaDaGrade.filter(x => !x.trecho.continuaDeAntes).map(x => x.ev)),
    doDiaDaGrade.map(x => x.trecho),
  )
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
  // O que continua de antes conta do topo do dia.
  const primeiroDoDia = dayEvents.length
    ? Math.min(...dayEvents.map(e => { if (trechoDoDia.get(e.id)?.continuaDeAntes) return 0; const d = parseISO(e.start); return getHours(d) * 60 + getMinutes(d) }))
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

  // O que continua de antes começa no topo da grade (como o bloqueio de vários
  // dias), e o que segue amanhã para no fim dela (25/11).
  function evTop(ev: CalendarEvent) {
    const tr = trechoDoDia.get(ev.id)
    if (tr?.continuaDeAntes) return Math.max(0, (tr.de / 60 - DAY_START) * PX_PER_HOUR)
    const d = parseISO(ev.start)
    return Math.max(0, (getHours(d) - DAY_START + getMinutes(d) / 60) * PX_PER_HOUR)
  }
  // A17 da 14ª: até quando OCUPA (fimDaOcupacao, a régua da recusa) — o
  // concluído adiantado é desenhado até a conclusão, e o que ainda se cruza
  // na tela fica lado a lado (`ladoALado`).
  function evHeight(ev: CalendarEvent) {
    const tr = trechoDoDia.get(ev.id)
    if (tr?.continuaDeAntes || tr?.continuaDepois) {
      const topo = evTop(ev)
      return Math.max(44, Math.min(gridHeight, (tr.ate / 60 - DAY_START) * PX_PER_HOUR) - topo)
    }
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
        {comissoes && (
          <Link data-minhas-comissoes href={comissoes.href} className="btn-ghost" style={{ fontSize: 'var(--text-xs-sz)' }}>
            {comissoes.rotulo}
          </Link>
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
                  {/* 25/11: o que continua de ontem diz de quando vem (o início real), como o cartão da grade. */}
                  {heroEvent.continuaDeAntes
                    ? <span data-destaque-continua>{textoDoQueContinua(heroEvent.ev.start)}</span>
                    : comORelogio(horaDoCartao(heroEvent.ev))} · {heroEvent.ev.procedureName}
                  {/* O "Em andamento" dela (o Heitor, 25/11), junto do destaque: até quando e em qual sala. */}
                  {heroEvent.ate && <span data-destaque-ate> · {ateDoCartao(heroEvent.ev, heroEvent.ate)}</span>}
                  {heroEvent.ate && heroEvent.ev.roomName && <span data-destaque-sala> · {heroEvent.ev.roomName}</span>}
                </p>
                {heroEvent.tambemEmAndamento.length > 0 && (
                  <p data-tambem-em-andamento style={{ fontSize: 'var(--text-2xs)', color: 'rgba(255,255,255,0.75)', marginTop: 4, overflowWrap: 'anywhere' }}>
                    Também em andamento: {heroEvent.tambemEmAndamento.map(e =>
                      `${e.clientName} (${format(parseISO(e.start), 'HH:mm') /* parede */}–${format(new Date(fimDaOcupacao({ scheduled_at: e.start, duration_min: e.durationMin })), 'HH:mm') /* parede */})`).join(', ')}
                  </p>
                )}
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
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>{rotulos.hoje}</p>
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
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>{rotulos.semana}</p>
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
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>{rotulos.ocupacao}</p>
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
              {/* A6 da 29ª: com o Concluído, e o Agendado tracejado como o cartão. */}
              {LEGENDA_DA_AGENDA.map(l => (
                <div key={l.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', ...(l.tracejado ? { border: `1.5px dashed ${l.cor}` } : { background: l.cor }) }} />
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 500 }}>{l.rotulo}</span>
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
                return <BlocoDoBloqueio key={b.id} bloqueio={b} top={top} height={fim - top} esquerda={58} rotulo={`Bloqueado · ${b.motivo}`} podeDesfazer={false} />
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
                // O que começou num dia anterior diz o início real (25/11), no relógio da grade.
                const continua = trechoDoDia.get(ev.id)?.continuaDeAntes ? textoDoQueContinua(ev.start) : null
                const hora   = continua ? { hora: continua, relogio: null } : horaDoCartao(ev)
                const time   = comORelogio(hora)
                const isIP   = ev.status === 'IN_PROGRESS'
                // 23ª A24: UM desenho de cartão — o curto (menos de 1 h, até 72 px:
                // A24 da 8ª) é o mesmo compactado, com o selo do status e o da
                // unidade no mesmo lugar. Eram dois desenhos, e o curto era lido
                // como "o de outra unidade".
                const compacto = height - 4 < 76
                return (
                  <Link key={ev.id} href={`/${slug}/agenda/${ev.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div data-cartao-minha-agenda={ev.id} data-compacto={compacto ? '' : undefined} data-continua-de-antes={continua ? '' : undefined}
                      data-liberou={ev.status === 'COMPLETED' && liberouOHorario(ev) ? '' : undefined} {...(ev.unidade ? { 'data-outra-unidade': ev.unidade } : {})}
                      title={[time, ev.clientName, ev.procedureName, `${ev.durationMin} min`, ev.unidade ? `Na unidade ${ev.unidade}` : null].filter(Boolean).join(' · ')}
                      style={{
                        position: 'absolute', top: top + 2, ...evLados(ev), height: height - 4,
                        borderRadius: 10, background: st.bg,
                        border: `1.5px solid ${isIP ? 'var(--brand)' : 'var(--border)'}`, borderLeft: `3.5px solid ${st.dot}`,
                        padding: compacto ? '3px 12px' : '10px 14px',
                        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: compacto ? 1 : 5,
                        cursor: 'pointer', overflow: 'hidden',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isIP ? 'var(--brand-soft)' : 'var(--bg-app)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = st.bg }}
                    >
                      {/* Linha de cima: hora · duração · status · menor · unidade (este encolhe com reticências — A8 da 13ª). */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0 }}>
                        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: isIP ? 'var(--brand)' : 'var(--text)', letterSpacing: '-0.01em', flexShrink: 0 }}>
                          {hora.hora}
                        </span>
                        {hora.relogio && (
                          <span data-relogio-do-cartao style={{ fontSize: 'var(--text-overline)', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>
                            ({hora.relogio})
                          </span>
                        )}
                        <span style={{ fontSize: 'var(--text-overline)', fontWeight: 600, color: 'var(--text-faint)', flexShrink: 0 }}>
                          · {ev.durationMin}min
                        </span>
                        <span style={{
                          fontSize: 'var(--text-overline)', fontWeight: 700, padding: compacto ? '0 7px' : '2px 9px', borderRadius: 'var(--radius-chip-token)',
                          background: st.pill.bg, color: st.pill.color, flexShrink: 0,
                        }}>
                          {st.label}
                        </span>
                        {/* A menor de idade (decisão 2 da 7ª; sobra da F29): a marca e o responsável na dica. */}
                        <SeloDoMenor menor={ev.menor} />
                        {/* O dela numa outra unidade em que atende (decisão 2 da 8ª). */}
                        {ev.unidade && <SeloDaOutraUnidade unidade={ev.unidade} />}
                      </div>
                      {/* Linha de baixo: a cliente e o procedimento (no alto, com o avatar). */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: compacto ? 6 : 8, minWidth: 0 }}>
                        {!compacto && (
                          <div style={{
                            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                            background: isIP ? 'var(--brand)' : 'var(--brand-soft)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 'var(--text-overline)', fontWeight: 800, color: isIP ? 'var(--on-brand)' : 'var(--brand)',
                          }}>
                            {initials(ev.clientName)}
                          </div>
                        )}
                        <div style={{
                          minWidth: 0, flex: '1 1 auto', display: 'flex',
                          flexDirection: compacto ? 'row' : 'column', alignItems: compacto ? 'center' : 'stretch', gap: compacto ? 6 : 1,
                          whiteSpace: 'nowrap', overflow: 'hidden', lineHeight: compacto ? 1.25 : 1.3,
                        }}>
                          {/* O nome da cliente nunca some (A8 da 13ª): cede por último. */}
                          <p data-cliente-do-cartao style={{
                            fontSize: compacto ? 'var(--text-sm-sz)' : 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: compacto ? '1 1 auto' : undefined, minWidth: compacto ? '5em' : 0,
                          }}>
                            {ev.clientName}
                          </p>
                          <p data-procedimento-do-cartao style={{
                            fontSize: compacto ? 'var(--text-overline)' : 'var(--text-2xs)', color: 'var(--text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: compacto ? '0 1 auto' : undefined,
                          }}>
                            {compacto ? `· ${ev.procedureName}` : ev.procedureName}
                          </p>
                          {/* A linha do responsável, quando o bloco tem altura para ela. */}
                          {!compacto && ev.menor && height >= 96 && (
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
              // Com o que continua de antes (25/11): o dia ocupado não parece livre.
              const dayEvs = agendamentosNoDia(events, day).map(x => x.ev)
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

          {/* A27 da 23ª (princípio 7): os atendimentos da semana, por dia — a
              faixa só tinha barrinhas, e clicar num dia voltava ao Dia. */}
          <div data-semana-em-lista style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
            {semanaDaLista.length === 0 && (
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum atendimento nesta semana.</p>
            )}
            {semanaDaLista.map(({ dia, eventos: doDia }) => (
              <div key={dia} data-dia-da-semana={dia} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p className="overline">
                  {format(parseISO(`${dia}T12:00:00`), "EEEE, d 'de' MMM", { locale: ptBR }) /* parede */}
                </p>
                {doDia.map(ev => {
                  const st = STATUS_COLORS[ev.status] ?? STATUS_COLORS['SCHEDULED']!
                  return (
                    <Link key={ev.id} href={`/${slug}/agenda/${ev.id}`} data-atendimento-da-semana={ev.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', textDecoration: 'none',
                      padding: '9px 12px', borderRadius: 'var(--radius-field-token)',
                      border: '1px solid var(--border)', borderLeft: `3.5px solid ${st.dot}`, background: 'var(--surface)',
                    }}>
                      <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)' }}>
                        {comORelogio(horaDoCartao(ev))}
                      </span>
                      <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', overflowWrap: 'anywhere' }}>{ev.clientName}</span>
                      <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{ev.procedureName}</span>
                      {ev.unidade && <SeloDaOutraUnidade unidade={ev.unidade} />}
                      <span style={{
                        marginLeft: 'auto', fontSize: 'var(--text-overline)', fontWeight: 700, padding: '2px 9px',
                        borderRadius: 'var(--radius-chip-token)', background: st.pill.bg, color: st.pill.color,
                      }}>
                        {st.label}
                      </span>
                    </Link>
                  )
                })}
              </div>
            ))}
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
              // Com o que continua de antes (25/11): o dia ocupado não parece livre.
              const dayEvs  = agendamentosNoDia(events, day).map(x => x.ev)
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
