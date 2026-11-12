'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths,
  startOfWeek, isSameDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { SegSelect } from '@/components/shared/seg-select'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

import { AppointmentModal } from './appointment-modal'
import { useNovoAgendamentoDaUrl, type PedidoDeAgendamento } from '@/components/shared/novo-agendamento-da-url'
import { AppointmentSheet } from './appointment-sheet'
import { JanelaModal } from '@/components/shared/janela-modal'
import { AgendaDayView } from './agenda-day-view'
import { AgendaWeekView } from './agenda-week-view'
import { AgendaMonthView } from './agenda-month-view'
import { rescheduleAppointment } from '@/actions/appointments'
import type { CalendarEvent } from './agenda-month-view'
import { ocupacaoEmPct, capacidadeEmMinutos, janelaDaGrade, intervalosDoDia, diaDaSemana, type Horario, type BlocoOcupado } from '@/lib/agenda/horario'
import { baseDaOcupacao, descontosDaOcupacao } from '@/lib/metrics/ocupacao'
import { DEFINICOES } from '@/lib/metrics/definicoes'
import { Dica } from '@/components/shared/dica'
import { atendimentosPorExtenso } from '@/lib/agenda/grade'
import { BotaoBloquearHorario } from '@/components/shared/bloqueio-da-agenda'
import type { BloqueioDaAgenda } from '@/lib/agenda/bloqueio'
import { blocosDosBloqueios } from '@/lib/agenda/horario-livre'
import { dayKeyTZ, naParede, daParede, isoNaParede } from '@/lib/datetime'
import { useFuso, NotaDoFuso } from '@/components/shared/fuso'

type ViewMode = 'dia' | 'semana' | 'mes'

function toLocalDT(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface Procedure   { id: string; name: string; category: string; duration_min: number; price: string | number }
interface Professional { id: string; name: string; foraDoAtende?: boolean }
interface Room        { id: string; name: string }

interface AgendaCalendarProps {
  branchId:      string
  branchName:    string
  slug:          string
  events:        CalendarEvent[]
  procedures:    Procedure[]
  professionals: Professional[]
  /** Quem tem agendamento aqui e não atende mais aqui (D3 da 9ª): só a grade, não o agendar. */
  colunasDeQuemNaoAtende?: Professional[]
  rooms:         Room[]
  canWrite:      boolean
  userRole:      string
  /** Cargo com agenda "só os meus": a janela mostra só o que a action deixa fazer. */
  escopoProprio?: boolean
  /** O membro logado: no agendamento dele, "Marcar chegada e iniciar" (A25). */
  meuId?: string | null
  /** Conclui o atendimento (o Prontuário em Gerenciar) — sem ele, a janela diz quem conclui antes do Iniciar (A20 da 10ª). */
  podeConcluir?: boolean
  /** O horário de funcionamento da unidade e de cada profissional (nulo = o padrão / segue a unidade). */
  horarioDaUnidade?:          Horario | null
  horariosDosProfissionais?:  Record<string, Horario | null>
  /** O que cada profissional tem agendado em OUTRA unidade: sai da capacidade da ocupação. */
  ocupadoForaDosProfissionais?: Record<string, BlocoOcupado[]>
  /** O dia da URL (`?date=AAAA-MM-DD`); sem ele, hoje. */
  dataInicial?:  string | null
  /** `?cancelados=1`: a grade traz os cancelados e as faltas, apagados. */
  comCancelados?: boolean
  /** Os bloqueios pontuais da janela (decisão 3 da 7ª): das profissionais e das salas. */
  bloqueios?: BloqueioDaAgenda[]
}

// -- KPI helpers -------------------------------------------------------------

/**
 * Os dias (AAAA-MM-DD) do período aberto na tela: o dia, a semana de segunda a
 * DOMINGO, ou o mês. Pela data do calendário (meio-dia UTC como âncora), sem o
 * fuso do processo.
 */
function diasDoPeriodo(view: ViewMode, date: Date): string[] {
  const [y = 1970, m = 1, d = 1] = format(date, 'yyyy-MM-dd').split('-').map(Number)
  const DIA = 86_400_000
  const chave = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const base = Date.UTC(y, m - 1, d, 12)
  if (view === 'dia') return [chave(base)]
  if (view === 'semana') {
    const segunda = base - ((new Date(base).getUTCDay() + 6) % 7) * DIA
    return Array.from({ length: 7 }, (_, i) => chave(segunda + i * DIA))
  }
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: ultimo }, (_, i) => chave(Date.UTC(y, m - 1, i + 1, 12)))
}

function calcKPIs(
  events: CalendarEvent[],
  professionals: Professional[],
  view: ViewMode,
  date: Date,
  horarioDaUnidade: Horario | null,
  horariosDosProfissionais: Record<string, Horario | null>,
  ocupadoForaDosProfissionais: Record<string, BlocoOcupado[]>,
  bloqueios: BloqueioDaAgenda[] = [],
  fuso?: string,
) {
  // Os DIAS do período (D3 da 8ª simulação): a semana tem os 7 — era de
  // segunda a sábado à meia-noite, e nem o sábado inteiro entrava no contador.
  // O agendamento conta no dia dele no relógio da unidade (`dayKeyTZ`, §13.1, F62).
  const dias = diasDoPeriodo(view, date)
  const chaves = new Set(dias)
  const from = new Date(`${dias[0]}T12:00:00-03:00`)
  const to   = new Date(`${dias[dias.length - 1]}T12:00:00-03:00`)

  const windowEvs = events.filter(e => chaves.has(dayKeyTZ(e.start, fuso)))

  const totalCount   = windowEvs.filter(e => !['CANCELLED', 'NO_SHOW'].includes(e.status)).length
  const waitingCount = windowEvs.filter(e => e.status === 'SCHEDULED').length
  // A MESMA conta do dashboard (lib/agenda/horario): minutos agendados — os
  // concluídos contam — ÷ a capacidade do horário. Era 12 h por profissional
  // aqui e 8 h lá, sem os concluídos aqui: as duas telas davam números
  // diferentes (D12 da simulação de 2026-10-20).
  // O tempo BLOQUEADO da profissional sai da capacidade, como o que ela tem em
  // outra unidade (D15 da 8ª simulação).
  const bookedMin    = windowEvs
    .filter(e => !['CANCELLED', 'NO_SHOW'].includes(e.status))
    .reduce((s, e) => s + e.durationMin, 0)
  const horarios = professionals.map(p => horariosDosProfissionais[p.id] ?? null)
  const ocupados = professionals.map(p => [
    ...(ocupadoForaDosProfissionais[p.id] ?? []),
    ...blocosDosBloqueios(bloqueios.filter(b => b.professionalId === p.id)),
  ])
  const occupancy    = ocupacaoEmPct(bookedMin, horarioDaUnidade, horarios, from, to, ocupados, fuso) ?? 0
  // A53 da 9ª: a base, para a tela dizer a conta (a mesma capacidade de ocupacaoEmPct).
  const base = professionals.length
    ? baseDaOcupacao({
        agendados: bookedMin, abertos: capacidadeEmMinutos(horarioDaUnidade, horarios, from, to, ocupados, fuso), profissionais: professionals.length,
        // A9 da 13ª: o que saiu da capacidade (a outra unidade, o bloqueio), dito.
        descontos: descontosDaOcupacao(horarioDaUnidade, professionals.map((p, i) => ({ nome: p.name, horario: horarios[i] ?? null, blocos: ocupados[i] ?? [] })), from, to, fuso),
      })
    : null

  return { totalCount, waitingCount, occupancy, base }
}

/** Minutos desde a meia-noite em que a unidade abre neste dia; nulo se fechada. */
function aberturaDaUnidade(horario: Horario | null, date: Date): number | null {
  const intervalos = intervalosDoDia(horario, null, diaDaSemana(format(date, 'yyyy-MM-dd')))
  const primeiro = intervalos[0]
  if (!primeiro) return null
  const [h = 0, m = 0] = primeiro.de.split(':').map(Number)
  return h * 60 + m
}

// -- Label helpers ------------------------------------------------------------

function navLabel(view: ViewMode, date: Date): string {
  if (view === 'dia')    return format(date, "EEEE, d 'de' MMMM", { locale: ptBR })
  if (view === 'semana') {
    // De segunda a DOMINGO (D3 da 8ª): era "2 – 7 de novembro", sem o domingo.
    const mon = startOfWeek(date, { weekStartsOn: 1 })
    const dom = addDays(mon, 6)
    return mon.getMonth() === dom.getMonth()
      ? `${format(mon, "d")} – ${format(dom, "d 'de' MMMM", { locale: ptBR })}`
      : `${format(mon, "d 'de' MMM", { locale: ptBR })} – ${format(dom, "d 'de' MMM", { locale: ptBR })}`
  }
  return format(date, "MMMM 'de' yyyy", { locale: ptBR })
}

function isCurrent(view: ViewMode, date: Date, fuso: string): boolean {
  const now = naParede(new Date(), fuso)
  if (view === 'dia')    return isSameDay(date, now)
  if (view === 'semana') return diasDoPeriodo('semana', date).includes(format(now, 'yyyy-MM-dd'))
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function navigate(view: ViewMode, date: Date, dir: 1 | -1): Date {
  if (view === 'dia')    return dir === 1 ? addDays(date, 1) : subDays(date, 1)
  if (view === 'semana') return dir === 1 ? addWeeks(date, 1) : subWeeks(date, 1)
  return dir === 1 ? addMonths(date, 1) : subMonths(date, 1)
}

/** Hoje, no relógio da unidade (F62): a grade desenha no relógio local com as horas dela. */
function todayDate(fuso: string): Date {
  return naParede(new Date(), fuso)
}

// -- Component ----------------------------------------------------------------

export function AgendaCalendar({
  branchId, slug, events, procedures, professionals, rooms, canWrite, userRole, escopoProprio, meuId = null, podeConcluir = true,
  horarioDaUnidade = null, horariosDosProfissionais = {}, ocupadoForaDosProfissionais = {}, dataInicial = null, comCancelados = false,
  bloqueios = [], colunasDeQuemNaoAtende = [],
}: AgendaCalendarProps) {
  const router = useRouter()
  // F62: a grade desenha no relógio da UNIDADE, qualquer que seja o do
  // navegador. Os horários vão às vistas "de parede" (`naParede`): os campos
  // locais delas são o relógio da unidade; o instante volta por `daParede`.
  const fuso = useFuso()
  const eventosNaParede = useMemo(() => events.map(e => ({
    ...e, start: isoNaParede(e.start, fuso)!, end: isoNaParede(e.end, fuso)!,
    arrivedAt: isoNaParede(e.arrivedAt, fuso), completedAt: isoNaParede(e.completedAt, fuso),
  })), [events, fuso])
  const bloqueiosNaParede = useMemo(() => bloqueios.map(b => ({ ...b, inicio: isoNaParede(b.inicio, fuso)!, fim: isoNaParede(b.fim, fuso)! })), [bloqueios, fuso])
  // A grade (dia e semana) tem também a coluna de quem não atende mais aqui e tem agendamento (D3 da 9ª).
  const colunas = colunasDeQuemNaoAtende.length ? [...professionals, ...colunasDeQuemNaoAtende] : professionals

  // Liga e desliga pela URL: quem traz os cancelados é o servidor (a consulta
  // da agenda os deixa de fora). O dia aberto vai junto, já na URL.
  function alternarCancelados() {
    const url = new URL(window.location.href)
    if (comCancelados) url.searchParams.delete('cancelados')
    else url.searchParams.set('cancelados', '1')
    router.replace(url.pathname + url.search, { scroll: false })
  }

  const [view,          setView]          = useState<ViewMode>('dia')
  const [currentDate,   setCurrentDateState] = useState(() => dataInicial ? new Date(`${dataInicial}T12:00:00`) : todayDate(fuso))
  // O dia aberto vai para a URL sem nova navegação (o servidor já trouxe a
  // janela). Num EFEITO, depois de pintar: o `replaceState` é integrado ao
  // router do Next e o atualiza — dentro do updater do setState era atualizar
  // o Router durante a renderização da agenda (o React avisava). A URL só
  // ganha o `?date=` quando o dia muda (abrir em hoje não a toca).
  const setCurrentDate = setCurrentDateState
  const diaNaUrl = format(currentDate, 'yyyy-MM-dd')
  const diaInicial = useRef(diaNaUrl)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('date') === diaNaUrl) return
    if (!url.searchParams.has('date') && diaNaUrl === diaInicial.current) return
    url.searchParams.set('date', diaNaUrl)
    window.history.replaceState(null, '', url)
  }, [diaNaUrl])
  const [showCreate,    setShowCreate]    = useState(false)
  const [defaultDate,   setDefaultDate]   = useState('')
  const [clienteInicial, setClienteInicial] = useState<string | null>(null)
  // O procedimento e a profissional que o modal já traz: o "Reagendar" da falta
  // (A27 da 7ª) e o clique num vazio da coluna (A29: a profissional dela).
  const [pedidoInicial, setPedidoInicial] = useState<PedidoDeAgendamento>({ procedimento: null, profissional: null })
  // `?novo=1&cliente=`: a busca universal e a ficha abrem o modal por aqui.
  useNovoAgendamentoDaUrl(canWrite, (cliente, pedido) => { setDefaultDate(''); setClienteInicial(cliente); setPedidoInicial(pedido); setShowCreate(true) })
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  // A janela recebe o agendamento de verdade (o instante), não o da grade.
  const abrirEvento = useCallback((ev: CalendarEvent) => setSelectedEvent(events.find(e => e.id === ev.id) ?? ev), [events])
  const [dropError,     setDropError]     = useState<string | null>(null)

  const { totalCount, waitingCount, occupancy, base: baseDaOcupacaoDaTela } = calcKPIs(events, professionals, view, currentDate, horarioDaUnidade, horariosDosProfissionais, ocupadoForaDosProfissionais, bloqueios, fuso)

  // -- Drag-and-drop ----------------------------------------------------------
  const moverAgendamento = useCallback(async (eventId: string, newStart: Date, newProfId: string) => {
    const formData = new FormData()
    formData.set('_appointmentId', eventId)
    // A hora solta na grade é a do relógio da unidade.
    formData.set('scheduled_at',   daParede(newStart, fuso).toISOString())
    formData.set('professional_id', newProfId)
    formData.set('_slug',          slug)

    const result = await rescheduleAppointment(undefined, formData)
    if (result?.error) {
      // O porquê, à vista (A22 da 8ª: soltar no ocupado "voltava sem mensagem").
      setDropError(result.error)
      setTimeout(() => setDropError(null), 8000)
    } else {
      router.refresh()
    }
  }, [slug, router, fuso])
  // Soltar na coluna de OUTRA profissional troca quem atende: pergunta antes,
  // com de quem para quem (A22 da 8ª simulação — trocava sem confirmação).
  const [arraste, setArraste] = useState<{ eventId: string; inicio: Date; profId: string; de: string; para: string } | null>(null)
  const handleDrop = useCallback(async (eventId: string, newStart: Date, newProfId: string) => {
    const ev = events.find(e => e.id === eventId)
    if (ev && ev.professionalId && newProfId && ev.professionalId !== newProfId) {
      setArraste({
        eventId, inicio: newStart, profId: newProfId,
        de: ev.professionalName, para: professionals.find(p => p.id === newProfId)?.name ?? 'outra profissional',
      })
      return
    }
    await moverAgendamento(eventId, newStart, newProfId)
  }, [events, professionals, moverAgendamento])

  // -- Slot click (open create modal) ----------------------------------------
  function handleSlotClick(date: Date, profId?: string) {
    if (!canWrite) return
    setDefaultDate(toLocalDT(date))
    setPedidoInicial({ procedimento: null, profissional: profId ?? null })
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
      {arraste && (
        <JanelaModal onFechar={() => setArraste(null)} rotulo="Trocar a profissional" largura={420} papel="alertdialog">
          <div data-confirmar-arraste style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text)', fontWeight: 700, lineHeight: 1.5 }}>
              Trocar a profissional de {arraste.de} para {arraste.para} e marcar às {format(arraste.inicio, 'HH:mm')} de {format(arraste.inicio, 'dd/MM')}?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setArraste(null)}>Voltar</button>
              <button type="button" className="btn-primary" onClick={() => {
                const a = arraste
                setArraste(null)
                void moverAgendamento(a.eventId, a.inicio, a.profId)
              }}>Confirmar</button>
            </div>
          </div>
        </JanelaModal>
      )}

      {/* Drop error toast */}
      {dropError && (
        <div role="alert" style={{
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
          {/* F62: a tela diz em que relógio está, quando não é o de Brasília. */}
          <NotaDoFuso />
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{totalCount}</span> {atendimentosPorExtenso(totalCount)}
            {' · '}
            <span style={{ fontWeight: 700, color: occupancy >= 80 ? 'var(--brand)' : 'var(--text)' }}>{occupancy}%</span> de ocupação
            {/* A53 da 9ª: a conta da ocupação, à vista. */}
            {baseDaOcupacaoDaTela && <> <span data-base-da-ocupacao>({baseDaOcupacaoDaTela})</span> <Dica rotulo={DEFINICOES.ocupacao.rotulo}>{DEFINICOES.ocupacao.texto}</Dica></>}
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

          {canWrite && <BotaoBloquearHorario branchId={branchId} profissionais={professionals} salas={rooms} dia={currentDate} />}
          {canWrite && (
            <button
              type="button"
              onClick={() => { setDefaultDate(''); setPedidoInicial({ procedimento: null, profissional: null }); setShowCreate(true) }}
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
            {!isCurrent(view, currentDate, fuso) && (
              <button
                type="button"
                onClick={() => setCurrentDate(todayDate(fuso))}
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
              {totalCount} {atendimentosPorExtenso(totalCount)} · {occupancy}% de ocupação
            </span>
          )}
        </div>

        {/* View content */}
        {view === 'dia' && (
          <AgendaDayView
            janela={janelaDaGrade([horarioDaUnidade])}
            aberturaDoDia={aberturaDaUnidade(horarioDaUnidade ?? null, currentDate)}
            horarioDaUnidade={horarioDaUnidade}
            horariosDosProfissionais={horariosDosProfissionais}
            currentDate={currentDate}
            events={eventosNaParede}
            professionals={colunas}
            canWrite={canWrite}
            onEventClick={abrirEvento}
            onSlotClick={handleSlotClick}
            onDrop={handleDrop}
            bloqueios={bloqueiosNaParede}
            salas={rooms}
          />
        )}
        {view === 'semana' && (
          <AgendaWeekView
            currentDate={currentDate}
            events={eventosNaParede}
            professionals={colunas}
            canWrite={canWrite}
            onEventClick={abrirEvento}
            onSlotClick={handleSlotClick}
            bloqueios={bloqueiosNaParede}
            salas={rooms}
          />
        )}
        {view === 'mes' && (
          <AgendaMonthView
            currentDate={currentDate}
            events={eventosNaParede}
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
          diaInicial={format(currentDate, 'yyyy-MM-dd')}
          clienteInicialId={clienteInicial}
          procedimentoInicialId={pedidoInicial.procedimento}
          profissionalInicialId={pedidoInicial.profissional}
          onClose={() => { setShowCreate(false); setClienteInicial(null) }}
          onSuccess={() => { setShowCreate(false); setClienteInicial(null); router.refresh() }}
        />
      )}

      {selectedEvent && (
        <AppointmentSheet
          appointment={selectedEvent}
          slug={slug}
          userRole={userRole}
          escopoProprio={escopoProprio}
          podeGerenciar={canWrite}
          podeConcluir={podeConcluir}
          meuId={meuId}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  )
}
