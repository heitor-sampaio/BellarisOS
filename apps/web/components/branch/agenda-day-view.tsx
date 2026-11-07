'use client'

import { iniciaisDoNome } from '@estetica-os/utils'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { isSameDay, format } from 'date-fns'
import { eventoDesmarcado, type CalendarEvent } from './agenda-month-view'
import { SeloDaFicha } from '@/components/shared/selo-da-ficha'
import { SeloDoMenor } from '@/components/shared/selo-do-menor'
import { textoDoConcluido } from '@/lib/agenda/hora-real'
import { rolagemDaGrade, estenderJanela } from '@/lib/agenda/grade'
import { intervalosDoDia, diaDaSemana, forasDoHorario, textoDosIntervalos, type Horario } from '@/lib/agenda/horario'
import { bloqueioNoDia, trechoDoBloqueio, type BloqueioDaAgenda } from '@/lib/agenda/bloqueio'
import { BlocoDoBloqueio, JanelaDoBloqueio } from '@/components/shared/bloqueio-da-agenda'
import { useAgora, passouSemFechar } from '@/lib/use-agora'

/** `foraDoAtende`: tem agendamento aqui e não atende mais aqui (D3 da 9ª) — a coluna fica, marcada. */
interface Professional { id: string; name: string; foraDoAtende?: boolean }

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
  /** Minutos desde a meia-noite em que a unidade abre NESTE dia (nulo: fechada). */
  aberturaDoDia?: number | null
  /**
   * O horário da unidade e o de cada profissional (J-30): a coluna sombreia o
   * que é fora do horário DELA. Sem eles, nada se sombreia.
   */
  horarioDaUnidade?:         Horario | null
  horariosDosProfissionais?: Record<string, Horario | null>
  /** Os bloqueios pontuais (decisão 3 da 7ª): o da profissional na coluna dela, o da sala acima da grade. */
  bloqueios?: BloqueioDaAgenda[]
  salas?: { id: string; name: string }[]
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
  return iniciaisDoNome(name)
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
  /** Os bloqueios DELA que tocam o dia. */
  bloqueios:    BloqueioDaAgenda[]
  /** Os períodos em que ela atende neste dia (unidade ∩ ela); nulo = não sombreia. */
  horarioDoDia: { de: string; ate: string }[] | null
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

/** A dica do cartão que passou do horário em aberto (A21 da 9ª). */
const TEXTO_DO_PASSOU = 'passou do horário sem chegada nem conclusão: marque a falta, a chegada ou conclua'

function ProfColumn({
  pro, bloqueios, horarioDoDia, events, currentDate, isFirst, canWrite,
  draggingId, dropPreviewY,
  onEventClick, onSlotClick, onDragStart, onDragEnd, onDragOver, onDrop,
}: ColProps) {
  const colRef = useRef<HTMLDivElement>(null)
  const g = useContext(GradeCtx)
  const agora = useAgora()
  // O fora do horário dela, sombreado (J-30). O clique continua marcando ali:
  // o encaixe é permitido (§9.1) — o modal avisa.
  const foras = horarioDoDia ? forasDoHorario(horarioDoDia, g.START_HOUR * 60, g.END_HOUR * 60) : []

  return (
    <div
      ref={colRef}
      data-coluna-do-profissional={pro.name}
      data-horario-de-trabalho={horarioDoDia ? (textoDosIntervalos(horarioDoDia) || 'Não atende') : undefined}
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
      {foras.map(f => (
        <div key={f.de} data-fora-do-horario aria-hidden style={{
          position: 'absolute', top: (f.de / 60 - g.START_HOUR) * HOUR_PX, height: (f.ate - f.de) / 60 * HOUR_PX,
          left: 0, right: 0, background: 'var(--bg-app)', pointerEvents: 'none',
        }} />
      ))}

      {/* O bloqueio pontual dela (decisão 3 da 7ª): a faixa não segura o
          clique — agendar ali abre o modal, que avisa (o encaixe é permitido). */}
      {bloqueios.map(b => {
        const noDia = bloqueioNoDia(b, currentDate)
        if (!noDia) return null
        const top = Math.max(0, (noDia.de / 60 - g.START_HOUR) * HOUR_PX)
        const fim = Math.min(g.TOTAL_PX, (noDia.ate / 60 - g.START_HOUR) * HOUR_PX)
        if (fim <= top) return null
        return <BlocoDoBloqueio key={b.id} bloqueio={b} top={top} height={fim - top} rotulo={`Bloqueado · ${b.motivo}`} podeDesfazer={canWrite} />
      })}

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
        // O cancelado (com "Mostrar cancelados") divide o horário com quem o
        // ocupou depois: o ativo à esquerda, o cancelado apagado à direita.
        const desmarcado = eventoDesmarcado(ev)
        const ini = new Date(ev.start).getTime(), fimEv = ini + ev.durationMin * 60000
        const divide = events.some(o => o.id !== ev.id && eventoDesmarcado(o) !== desmarcado
          && new Date(o.start).getTime() < fimEv && new Date(o.start).getTime() + o.durationMin * 60000 > ini)
        const top       = Math.max(0, timeToY(ev.start, g))
        const height    = Math.max(32, (ev.durationMin / 60) * HOUR_PX - 4)
        const isDragging = draggingId === ev.id
        const isProgress  = ev.status === 'IN_PROGRESS'
        const isConfirmed = ev.status === 'CONFIRMED' || ev.status === 'ARRIVED'
        const isArrived   = ev.status === 'ARRIVED'
        const isScheduled = ev.status === 'SCHEDULED'
        const isCompleted = ev.status === 'COMPLETED'
        // A21 da 9ª: passou do horário e segue em aberto — marcado, nada se fecha sozinho.
        const passou      = passouSemFechar(ev, agora)
        const timeStr   = format(new Date(ev.start), 'HH:mm')
        const isDraggable = canWrite && !isCompleted && !desmarcado
        // A24 da 8ª: até 40 min (menos de 56 px) o cartão tem DUAS linhas — a hora e a
        // cliente, o procedimento e a sala —, e as duas cabem; o de 40 cortava o
        // procedimento (eram três linhas em 49 px), e o de 30 o cortava pela metade.
        const compacto = height < 56

        if (desmarcado) {
          return (
            <div
              key={ev.id}
              data-agendamento={ev.id}
              data-cancelado=""
              onClick={e => { e.stopPropagation(); onEventClick(ev) }}
              title={`${ev.status === 'NO_SHOW' ? 'Não compareceu' : 'Cancelado'} · ${ev.clientName}${ev.motivoDoCancelamento ? `: ${ev.motivoDoCancelamento}` : ''}`}
              style={{
                position: 'absolute', top: top + 2, height,
                left: divide ? '50%' : 4, right: 4,
                borderRadius: 8, padding: '5px 8px', overflow: 'hidden',
                cursor: 'pointer', userSelect: 'none', zIndex: 1, opacity: 0.6,
                background: 'var(--bg-app)', border: '1px dashed var(--border)',
              }}
            >
              <div style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--danger)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {timeStr} · {ev.status === 'NO_SHOW' ? 'Não compareceu' : 'Cancelado'}
              </div>
              <div style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'line-through', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.clientName}
              </div>
              {ev.motivoDoCancelamento && height > 42 && (
                <div style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.motivoDoCancelamento}
                </div>
              )}
            </div>
          )
        }

        return (
          <div
            key={ev.id}
            data-agendamento={ev.id}
            // O cartão curto corta o texto (A23): a dica diz tudo.
            title={[timeStr, ev.clientName, ev.procedureName, ev.roomName, `${ev.durationMin} min`, passou ? TEXTO_DO_PASSOU : null].filter(Boolean).join(' · ')}
            draggable={isDraggable}
            onDragStart={isDraggable ? e => { e.stopPropagation(); onDragStart(e, ev.id) } : undefined}
            onDragEnd={isDraggable ? onDragEnd : undefined}
            onClick={e => { e.stopPropagation(); onEventClick(ev) }}
            style={{
              position:   'absolute',
              top:        top + 2,
              left:       4, right: divide ? '50%' : 4,
              height,
              borderRadius: 8,
              padding:    compacto ? '3px 8px' : '5px 8px',
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
            <div style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: isCompleted ? 'var(--text-faint)' : 'var(--success)', display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', lineHeight: 1.25 }}>
              {/* A sala no cartão (A29). */}
              <span style={{ flexShrink: 0 }}>{timeStr}{!compacto ? ` · ${ev.durationMin}min` : ''}{!compacto && ev.roomName ? ` · ${ev.roomName}` : ''}</span>
              {/* O bloco curto (30 min) não tem altura para a linha do nome: ele vem aqui. */}
              {compacto && <span style={{ color: isCompleted ? 'var(--text-muted)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.clientName}</span>}
              <SeloDaFicha estado={ev.fichaDeSaude} />
              <SeloDoMenor menor={ev.menor} />
              {isProgress && <span style={{ color: 'var(--brand)' }}>· em atend.</span>}
              {isArrived && <span>· Chegou{ev.arrivedAt ? ` ${format(new Date(ev.arrivedAt), 'HH:mm')}` : ''}</span>}
              {isCompleted && <span style={{ color: 'var(--text-faint)' }}>· {textoDoConcluido(ev.start, ev.completedAt) ?? 'concluído'}</span>}
              {passou && <span data-passou-sem-fechar style={{ color: 'var(--warning)', whiteSpace: 'nowrap' }}>· passou do horário</span>}
            </div>
            {/* O bloco curto (30 min): o procedimento e a sala numa segunda linha (A23 da 6ª
                simulação — mostrava só "03:50 Paula Reis"). */}
            {compacto && (
              <div data-procedimento-do-cartao style={{ fontSize: 'var(--text-overline)', lineHeight: 1.25, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[ev.procedureName, ev.roomName].filter(Boolean).join(' · ')}
              </div>
            )}
            {!compacto && (
              <div style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, lineHeight: 1.25, color: isCompleted ? 'var(--text-muted)' : 'var(--text)', marginTop: height > 64 ? 2 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.clientName}
              </div>
            )}
            {/* A29 da 7ª: o cartão de 45 min (56 px) também diz o procedimento —
                a A23 da 6ª tinha feito o de 30. */}
            {!compacto && (
              <div data-procedimento-do-cartao style={{ fontSize: 'var(--text-overline)', lineHeight: 1.2, color: isProgress ? 'var(--brand)' : isConfirmed ? 'var(--success)' : 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.procedureName}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function AgendaDayView({ currentDate, events, professionals, canWrite, onEventClick, onSlotClick, onDrop, janela, aberturaDoDia, horarioDaUnidade, horariosDosProfissionais, bloqueios = [], salas = [] }: Props) {
  const [draggingId,   setDraggingId]   = useState<string | null>(null)
  const [salaAberta,   setSalaAberta]   = useState<BloqueioDaAgenda | null>(null)
  // As salas bloqueadas que tocam o dia: uma linha acima da grade (a grade é
  // por profissional, não por sala).
  const nomeDaSala = (id: string | null) => salas.find(s => s.id === id)?.name ?? 'Sala'
  const salasDoDia = bloqueios.filter(b => b.roomId && bloqueioNoDia(b, currentDate))
  const [dropTarget,   setDropTarget]   = useState<{ profId: string; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const todayEvents = events.filter(e => isSameDay(new Date(e.start), currentDate))
  // A grade do horário da unidade, estendida pelos agendamentos do dia que
  // caem fora dele (um encaixe às 21 h não pode sumir da tela).
  const { inicio, fim } = estenderJanela({ inicio: janela?.inicio ?? START_PADRAO, fim: janela?.fim ?? END_PADRAO }, todayEvents)
  const g = gradeDe(inicio, fim)

  // Hoje, a grade abre na hora de agora (uma hora antes); outro dia, no
  // primeiro atendimento ou na abertura da unidade, o que vier antes (D8,
  // 2026-10-27: sem isso a grade herdava a rolagem do dia anterior e a manhã
  // sumia). Roda a cada troca de dia, e não a cada atualização dos eventos.
  const ehHoje = isSameDay(currentDate, new Date())
  const diaChave = format(currentDate, 'yyyy-MM-dd')
  const primeiroEmMin = todayEvents.length
    ? Math.min(...todayEvents.map(e => { const d = new Date(e.start); return d.getHours() * 60 + d.getMinutes() }))
    : null
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = rolagemDaGrade({
      ehHoje, horaAgora: new Date().getHours(), startHour: g.START_HOUR, hourPx: HOUR_PX,
      aberturaEmMin: aberturaDoDia ?? null, primeiroEmMin,
    })
  }, [diaChave, ehHoje, g.START_HOUR, aberturaDoDia, primeiroEmMin])

  // A posição na COLUNA: o retângulo dela já anda com a rolagem da grade. Somar
  // o `scrollTop` de novo (como era) jogava o horário solto para baixo — com a
  // grade rolada até as 10:00, soltar às 11:00 marcava às 21:00 (A22 da 8ª:
  // "soltar volta sem mensagem").
  function getRelY(e: React.DragEvent, colEl: HTMLElement): number {
    const rect = colEl.getBoundingClientRect()
    return Math.max(0, e.clientY - rect.top)
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
        Nenhum profissional cadastrado nesta unidade.
      </div>
    )
  }

  return (
    <GradeCtx.Provider value={g}>
    {salasDoDia.length > 0 && (
      <div data-bloqueios-de-sala role="group" aria-label="Salas bloqueadas neste dia" style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10,
        padding: '8px 12px', borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
      }}>
        <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--warning)' }}>Sala bloqueada:</span>
        {salasDoDia.map(b => (
          <button key={b.id} type="button" onClick={() => setSalaAberta(b)} style={{
            padding: '2px 10px', borderRadius: 'var(--radius-chip-token)', border: '1px solid var(--warning-border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer',
          }}>
            {nomeDaSala(b.roomId)} · {trechoDoBloqueio(b)} · {b.motivo}
          </button>
        ))}
      </div>
    )}
    {salaAberta && (
      <JanelaDoBloqueio bloqueio={salaAberta} titulo={`${nomeDaSala(salaAberta.roomId)} bloqueada · ${salaAberta.motivo}`}
        podeDesfazer={canWrite} onFechar={() => setSalaAberta(null)} />
    )}
    <div className="table-wrap">
    <div ref={scrollRef} data-grade-do-dia style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 320px)', minWidth: 500 }}>
      {/* Sticky professional headers — dentro do scroll para largura idêntica à do grid */}
      <div style={{
        display: 'flex', position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ width: TIME_COL_W, flexShrink: 0 }} />
        {professionals.map((pro, i) => {
          const clr    = PROF_COLORS[i % PROF_COLORS.length]!
          const proEvs = todayEvents.filter(e => e.professionalId === pro.id && !eventoDesmarcado(e))
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
                  {pro.foraDoAtende && <div data-nao-atende-aqui style={{ fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 600, marginTop: 1 }}>Não atende mais nesta unidade</div>}
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
              // A29 da 7ª: o rótulo da PRIMEIRA hora (o 00:00 da unidade 24 h)
              // subia 7 px para baixo do cabeçalho fixo e saía cortado.
              top: Math.max(0, (h - g.START_HOUR) * HOUR_PX - 7),
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
              bloqueios={bloqueios.filter(b => b.professionalId === pro.id)}
              horarioDoDia={horariosDosProfissionais
                ? intervalosDoDia(horarioDaUnidade ?? null, horariosDosProfissionais[pro.id] ?? null, diaDaSemana(diaChave))
                : null}
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
