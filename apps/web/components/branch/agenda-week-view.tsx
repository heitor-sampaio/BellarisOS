'use client'

import { iniciaisDoNome } from '@estetica-os/utils'
import { addDays, startOfWeek, isSameDay, format } from 'date-fns'
import { SeloDaFicha } from '@/components/shared/selo-da-ficha'
import { SeloDoMenor } from '@/components/shared/selo-do-menor'
import { eventoDesmarcado, type CalendarEvent } from './agenda-month-view'
import { EtiquetaDoBloqueio } from '@/components/shared/bloqueio-da-agenda'
import { trechoNoDia, type BloqueioDaAgenda } from '@/lib/agenda/bloqueio'
import { naParede } from '@/lib/datetime'
import { useFuso } from '@/components/shared/fuso'
import { useAgora, passouSemFechar } from '@/lib/use-agora'

/** `foraDoAtende`: tem agendamento aqui e não atende mais aqui (D3 da 9ª) — a linha fica, marcada. */
interface Professional { id: string; name: string; foraDoAtende?: boolean }

interface Props {
  currentDate:   Date
  events:        CalendarEvent[]
  professionals: Professional[]
  onEventClick:  (ev: CalendarEvent) => void
  onSlotClick:   (date: Date, profId?: string) => void
  canWrite:      boolean
  /**
   * Os bloqueios pontuais (sobra da F30, decisão 3 da 7ª): o da profissional na
   * célula dela, o da sala numa linha à parte — a vista do dia já os desenhava.
   */
  bloqueios?:    BloqueioDaAgenda[]
  salas?:        { id: string; name: string }[]
}

// A semana inteira, de segunda a DOMINGO (D3 da 8ª simulação): era até o sábado,
// numa clínica que abre os 7 dias o agendamento de domingo só aparecia no Mês e no Dia.
const WEEKDAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']

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

function shortName(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0] ?? name
  return `${parts[0] ?? ''} ${(parts[parts.length - 1] ?? '')[0] ?? ''}.`
}

function EventCard({ ev, onClick }: { ev: CalendarEvent; onClick: () => void }) {
  // A grade é "de parede" (F62): o agora também, no relógio da unidade.
  const fuso        = useFuso()
  const agoraReal   = useAgora()
  const agora       = agoraReal == null ? null : naParede(new Date(agoraReal), fuso).getTime()
  const time        = format(new Date(ev.start), 'HH:mm')
  if (eventoDesmarcado(ev)) {
    return (
      <div data-agendamento={ev.id} data-cancelado="" title={ev.motivoDoCancelamento ?? undefined}
        onClick={e => { e.stopPropagation(); onClick() }}
        style={{ padding: '6px 8px', borderRadius: 8, marginBottom: 4, cursor: 'pointer', opacity: 0.6,
          background: 'var(--bg-app)', border: '1px dashed var(--border)' }}>
        <div style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--danger)' }}>
          {time} · {ev.status === 'NO_SHOW' ? 'Não compareceu' : 'Cancelado'}
        </div>
        <div style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'line-through', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shortName(ev.clientName)}
        </div>
        {ev.motivoDoCancelamento && (
          <div style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ev.motivoDoCancelamento}
          </div>
        )}
      </div>
    )
  }
  const isProgress  = ev.status === 'IN_PROGRESS'
  const isConfirmed = ev.status === 'CONFIRMED' || ev.status === 'ARRIVED'
  const isScheduled = ev.status === 'SCHEDULED'
  // A21 da 9ª: passou do horário e segue em aberto — marcado, nada se fecha sozinho.
  const passou      = passouSemFechar(ev, agora)

  return (
    <div
      data-agendamento={ev.id}
      title={passou ? 'Passou do horário sem chegada nem conclusão: marque a falta, a chegada ou conclua' : undefined}
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
      <div style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {time}
        {ev.status === 'ARRIVED' && <span>· Chegou</span>}
        {passou && <span data-passou-sem-fechar style={{ color: 'var(--warning)', whiteSpace: 'nowrap' }}>· passou do horário</span>}
        <SeloDaFicha estado={ev.fichaDeSaude} />
              <SeloDoMenor menor={ev.menor} />
      </div>
      <div style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shortName(ev.clientName)}
      </div>
      <div style={{ fontSize: 'var(--text-overline)', color: isProgress ? 'var(--brand)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ev.procedureName}
      </div>
    </div>
  )
}

export function AgendaWeekView({ currentDate, events, professionals, onEventClick, onSlotClick, canWrite, bloqueios = [], salas = [] }: Props) {
  const monday   = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const fuso     = useFuso()
  const today    = naParede(new Date(), fuso)
  const nomeDaSala = (id: string | null) => salas.find(s => s.id === id)?.name ?? 'Sala'
  const daSala = bloqueios.filter(b => b.roomId && weekDays.some(d => trechoNoDia(b, d)))

  if (professionals.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
        Nenhum profissional cadastrado nesta unidade.
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
          {daSala.length > 0 && (
            <tr data-salas-da-semana>
              <td style={{ padding: '10px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', verticalAlign: 'top', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>
                Salas bloqueadas
              </td>
              {weekDays.map((day, di) => (
                <td key={di} style={{ padding: '6px', borderBottom: '1px solid var(--border)', borderRight: di < 6 ? '1px solid var(--border)' : 'none', verticalAlign: 'top' }}>
                  {daSala.map(b => {
                    const trecho = trechoNoDia(b, day)
                    return trecho && (
                      <EtiquetaDoBloqueio key={b.id} bloqueio={b} podeDesfazer={canWrite}
                        texto={`${nomeDaSala(b.roomId)} · ${trecho} · ${b.motivo}`}
                        titulo={`${nomeDaSala(b.roomId)} bloqueada · ${b.motivo}`} />
                    )
                  })}
                </td>
              ))}
            </tr>
          )}
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
                      {pro.foraDoAtende && <span data-nao-atende-aqui style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 600, marginTop: 1 }}>Não atende mais nesta unidade</span>}
                    </span>
                  </div>
                </td>

                {/* Day cells */}
                {weekDays.map((day, di) => {
                  const dayEvs = events.filter(
                    // O dia do agendamento no relógio da unidade: a grade é "de parede" (F62).
                    e => e.professionalId === pro.id && format(new Date(e.start), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'),
                  )
                  const isToday = isSameDay(day, today)

                  return (
                    <td
                      key={di}
                      data-dia={format(day, 'yyyy-MM-dd')}
                      style={{
                        padding: '8px 6px',
                        borderBottom: '1px solid var(--border)',
                        borderRight: di < 6 ? '1px solid var(--border)' : 'none',
                        verticalAlign: 'top',
                        minWidth: 110,
                        background: isToday ? 'rgba(195,77,107,0.025)' : undefined,
                        cursor: canWrite ? 'pointer' : 'default',
                      }}
                      onClick={() => canWrite && onSlotClick(day, pro.id)}
                    >
                      {bloqueios.filter(b => b.professionalId === pro.id).map(b => {
                        const trecho = trechoNoDia(b, day)
                        return trecho && (
                          <EtiquetaDoBloqueio key={b.id} bloqueio={b} podeDesfazer={canWrite}
                            texto={`Bloqueado ${trecho} · ${b.motivo}`} titulo={`Bloqueado · ${b.motivo}`} />
                        )
                      })}
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
