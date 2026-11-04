'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { AppointmentModal } from '@/components/branch/appointment-modal'
import { useNovoAgendamentoDaUrl } from '@/components/shared/novo-agendamento-da-url'
import { AppointmentSheet } from '@/components/branch/appointment-sheet'
import { SeloDaFicha } from '@/components/shared/selo-da-ficha'
import { estenderJanela } from '@/lib/agenda/grade'
import { intervalosDoDia, diaDaSemana, forasDoHorario, foraDoHorarioDaUnidade, type Horario } from '@/lib/agenda/horario'
import { textoDoConcluido } from '@/lib/agenda/hora-real'
import type { SeloDaFicha as EstadoDaFicha } from '@/lib/pre-atendimento/selos'
import { contagemDaAgenda } from '@/lib/metrics/resultado'
import { useFala } from '@/components/shared/uma-unidade'

// -- Tipos ---------------------------------------------------------------------
type AgendaView = 'day' | 'week'

interface Branch      { id: string; name: string; slug: string; /** O horário de funcionamento (A26); sem ele, a grade não sombreia. */ horario?: Horario | null }
interface Appointment {
  id:              string
  /** A profissional (A25: no agendamento dela, "Marcar chegada e iniciar"). */
  professional_id?: string | null
  scheduled_at:    string
  started_at:      string | null
  completed_at:    string | null
  /** O check-in (2026-10-21): quando chegou. */
  arrived_at?:     string | null
  /** Cancelado: o motivo, no bloco (2026-10-21). */
  cancellation_reason?: string | null
  status:          string
  branch_id:       string
  price:           number | null
  procedures:      { name: string } | null
  clients:         { name: string } | null
  users:           { name: string } | null
  /** A ficha de saúde da cliente para este horário (selo no bloco). */
  ficha?:          EstadoDaFicha | null
  /** Já pago antes (D12): "Pré-pago · 1 de 2", "Pacote X · sessão 1 de 2"… */
  pagoAntes?:      string | null
  /** A29: a duração, a sala e a cliente, na janela. */
  duration_min?:   number | null
  client_id?:      string | null
  rooms?:          { name: string } | null
}

interface Props {
  view:         AgendaView
  selectedDate: string       // 'YYYY-MM-DD'
  todayStr:     string       // 'YYYY-MM-DD'
  /** Unidades exibidas — já recortadas pelo filtro. */
  branches:     Branch[]
  /** Todas as unidades ativas, para o seletor. */
  todasUnidades: Branch[]
  /** Unidade do recorte atual; vazio = rede inteira. */
  unidadeId:    string
  appointments: Appointment[]
  /** O horário de funcionamento das unidades mostradas: a grade do dia abre nele. */
  janela: { inicio: number; fim: number }
  /** Marcar horário daqui. Falso para quem só tem agenda em "Ver". */
  podeAgendar:  boolean
  /** Cargo com alcance "só a própria agenda": não muda status do agendamento. */
  escopoProprio: boolean
  /** O membro logado: no agendamento dele, "Marcar chegada e iniciar" (A25). */
  meuId?: string | null
}

// -- Constantes visuais --------------------------------------------------------
// A grade do dia abre no horário de funcionamento das unidades (a mais cedo e a
// mais tarde) e se estende pelos agendamentos de fora dele (D5, 2026-10-28):
// é a regra da grade da unidade, em `estenderJanela`. Nada de 07–21 fixo.
const HOUR_H     = 72   // px por hora

/**
 * Posição vertical do clique → 'YYYY-MM-DDTHH:mm' local, em passos de 15 min.
 * Preso à faixa da grade: clique meio pixel abaixo do fim não pode virar 21:07.
 */
function horarioNoY(dia: string, y: number, inicio: number, fim: number): string {
  const minutosDoTopo = (y / HOUR_H) * 60
  const passo = Math.round(minutosDoTopo / 15) * 15
  const limite = (fim - inicio) * 60 - 15
  const min = Math.min(Math.max(passo, 0), limite)
  const hh = String(inicio + Math.floor(min / 60)).padStart(2, '0')
  const mm = String(min % 60).padStart(2, '0')
  return `${dia}T${hh}:${mm}`
}

/** Cancelado ou falta: o bloco vai apagado, com o motivo (2026-10-21). */
function desmarcado(a: { status: string }): boolean {
  return a.status === 'CANCELLED' || a.status === 'NO_SHOW'
}

/** "Chegou 9:42" no bloco — o check-in (2026-10-21). */
function chegouEm(iso: string | null | undefined): string {
  if (!iso) return 'Chegou'
  return `Chegou ${new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`
}

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  SCHEDULED:   { bg: 'var(--info-soft)', border: 'var(--info-border)', text: 'var(--info)', label: 'Agendado'      },
  CONFIRMED:   { bg: 'var(--success-bg)', border: 'var(--cat-4-soft)', text: 'var(--cat-4)', label: 'Confirmado'     },
  ARRIVED:     { bg: 'var(--success-soft)', border: 'var(--success)', text: 'var(--success)', label: 'Chegou'         },
  IN_PROGRESS: { bg: 'var(--warning-soft)', border: 'var(--warning-border)', text: 'var(--warning)', label: 'Em atendimento' },
  COMPLETED:   { bg: 'var(--success-bg)', border: 'var(--success-border)', text: 'var(--success)', label: 'Concluído'      },
  CANCELLED:   { bg: 'var(--bg-app)', border: 'var(--border)', text: 'var(--text-faint)', label: 'Cancelado'      },
  NO_SHOW:     { bg: 'var(--danger-soft)', border: 'var(--danger-border)', text: 'var(--danger)', label: 'Não compareceu' },
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

function fmtDayFull(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
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
function apptTop(a: Appointment, inicio: number): number {
  const d = new Date(a.scheduled_at)
  const h = d.getHours() + d.getMinutes() / 60
  return Math.max(0, (h - inicio) * HOUR_H)
}

function apptHeight(a: Appointment): number {
  return Math.max(58, (apptDuration(a) / 60) * HOUR_H)
}

// -- View Dia -----------------------------------------------------------------
/**
 * Clicar num horário vazio abre o agendamento naquele horário e naquela
 * unidade. Antes só o agendamento JÁ EXISTENTE era clicável: a grade da rede
 * mostrava os buracos do dia e não deixava preencher nenhum — para marcar era
 * preciso achar o botão "Agendar" no topo e redigitar dia, hora e unidade que
 * já estavam na ponta do dedo. Pedido do Heitor em 2026-09-25.
 *
 * O minuto sai da posição vertical do clique, arredondado para 15 — meia hora
 * é grosseiro demais para uma agenda de estética, e o minuto exato do pixel
 * não significa nada.
 */
function DayGrid({ branches, appointments, dia, janela, onSelecionar, onHorarioVazio }: {
  branches: Branch[]
  /** O horário de funcionamento das unidades mostradas (horas cheias). */
  janela: { inicio: number; fim: number }
  appointments: Appointment[]
  /** 'YYYY-MM-DD' do dia mostrado. */
  dia: string
  onSelecionar: (a: Appointment) => void
  /** Nulo quando quem olha não pode agendar. */
  onHorarioVazio: ((branchId: string, quando: string) => void) | null
}) {
  const { inicio, fim } = estenderJanela(janela, appointments.map(a => ({ start: a.scheduled_at, durationMin: apptDuration(a) })))
  const HOURS  = Array.from({ length: fim - inicio }, (_, i) => i + inicio)
  const GRID_H = HOURS.length * HOUR_H
  const byBranch: Record<string, Appointment[]> = {}
  for (const b of branches) byBranch[b.id] = []
  for (const a of appointments) byBranch[a.branch_id]?.push(a)

  const TIME_COL = 52  // px

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)' }}>
      {/* A largura da coluna de filial vem do CSS (`--agenda-col`): no celular
          ela encolhe para 138px, senão com 180px cabia UMA coluna e meia na
          tela e a grade parecia cortada em vez de rolável. */}
      <div style={{ minWidth: `calc(${TIME_COL}px + ${branches.length} * var(--agenda-col, 180px))` }}>

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
              fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text)',
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
          background: 'var(--surface)',
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
                fontSize: 'var(--text-overline)', fontWeight: 600,
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
              const aStart = apptTop(a, inicio)
              const aEnd   = aStart + apptHeight(a)
              // Encontra quantos outros agendamentos sobrepõem este
              const overlaps = appts.filter(other => {
                if (other.id === a.id) return false
                const oStart = apptTop(other, inicio)
                const oEnd   = oStart + apptHeight(other)
                return aStart < oEnd && aEnd > oStart
              })
              const col       = overlaps.filter(o => apptTop(o, inicio) < apptTop(a, inicio) || (apptTop(o, inicio) === apptTop(a, inicio) && o.id < a.id)).length
              const totalCols = overlaps.length + 1
              positioned.push({ appt: a, col, totalCols })
            }

            // O fechado DESTA unidade, sombreado (A26): ao lado de uma 24 h, a
            // madrugada de quem abre às 10:00 parecia livre. O clique continua
            // agendando ali (o encaixe é permitido, §9.1).
            const foras = b.horario !== undefined
              ? forasDoHorario(intervalosDoDia(b.horario, null, diaDaSemana(dia)), inicio * 60, fim * 60)
              : []

            return (
              <div
                key={b.id}
                className="agenda-coluna"
                data-unidade={b.id}
                onClick={onHorarioVazio ? e => {
                  // Só o fundo: o clique num agendamento sobe até aqui, e sem
                  // esta guarda abrir uma ficha marcaria um horário novo junto.
                  if (e.target !== e.currentTarget) return
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top
                  onHorarioVazio(b.id, horarioNoY(dia, y, inicio, fim))
                } : undefined}
                style={{
                  position: 'relative',
                  height: GRID_H,
                  borderLeft: '1px solid var(--hairline)',
                  cursor: onHorarioVazio ? 'copy' : undefined,
                }}
              >
                {foras.map(f => (
                  <div key={`fora-${f.de}`} data-fora-do-horario aria-hidden style={{
                    position: 'absolute', left: 0, right: 0, top: (f.de / 60 - inicio) * HOUR_H, height: (f.ate - f.de) / 60 * HOUR_H,
                    background: 'var(--bg-app)', pointerEvents: 'none',
                  }} />
                ))}

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
                  const top = apptTop(a, inicio)
                  const h   = apptHeight(a)
                  const w   = `calc(${100 / totalCols}% - 6px)`
                  const l   = `calc(${(col / totalCols) * 100}% + 3px)`
                  const encaixe = b.horario !== undefined && !desmarcado(a) && foraDoHorarioDaUnidade(b.horario, a.scheduled_at, apptDuration(a))

                  return (
                    // Clicar abre a folha do agendamento — confirmar, dar
                    // check-in, remarcar, cancelar — em vez de ir direto para a
                    // sessão. Era o único caminho que a rede tinha, e obrigava a
                    // abrir o atendimento inteiro para mudar um status.
                    <button
                      key={a.id}
                      type="button"
                      data-agendamento={a.id}
                      data-encaixe={encaixe ? '' : undefined}
                      onClick={() => onSelecionar(a)}
                      title={`${a.procedures?.name ?? '—'} · ${a.clients?.name ?? '—'} · ${a.users?.name ?? '—'}${encaixe ? ' · Encaixe: fora do horário da unidade' : ''}${a.cancellation_reason ? ` · ${a.cancellation_reason}` : ''}`}
                      style={{
                        opacity:      desmarcado(a) ? 0.6 : 1,
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
                        textDecoration: 'none',
                        display:      'block',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: st.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {a.procedures?.name ?? '—'}
                        </span>
                        <SeloDaFicha estado={a.ficha} />
                        {encaixe && <span className="chip chip-warning" style={{ fontSize: 'var(--text-overline)', padding: '0 5px', flexShrink: 0 }}>Encaixe</span>}
                      </div>
                      <div style={{ fontSize: 'var(--text-overline)', color: st.text, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1, textDecoration: desmarcado(a) ? 'line-through' : undefined }}>
                        {a.clients?.name ?? '—'}
                      </div>
                      <div style={{ fontSize: 'var(--text-overline)', color: st.text, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                        {desmarcado(a)
                          ? <>{st.label}{a.cancellation_reason ? ` · ${a.cancellation_reason}` : ''}</>
                          : <>{a.status === 'ARRIVED' && <strong>{chegouEm(a.arrived_at)} · </strong>}{a.status === 'COMPLETED' && textoDoConcluido(a.scheduled_at, a.completed_at) && <strong>{textoDoConcluido(a.scheduled_at, a.completed_at)} · </strong>}{a.users?.name ?? '—'}</>}
                      </div>
                    </button>
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

  return (
    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
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
                background: isToday ? 'var(--bg-app)' : 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {DAY_NAMES[i]}
                </span>
                <span style={{
                  fontSize: 'var(--text-card-title)', fontWeight: 800,
                  color: isToday ? 'var(--brand)' : 'var(--text)',
                  letterSpacing: '-0.02em',
                }}>
                  {new Date(d + 'T00:00:00').getDate()}
                </span>
              </div>
              {dayAppts.length > 0 && (
                <div style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 2 }}>
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
                background: isToday ? 'var(--surface)' : 'var(--surface)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}
            >
              {dayAppts.length === 0 ? (
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', padding: '8px 4px' }}>—</div>
              ) : dayAppts.map(a => {
                const st  = STATUS_STYLE[a.status] ?? STATUS_STYLE.SCHEDULED!
                const t   = new Date(a.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div
                    key={a.id}
                    data-agendamento={a.id}
                    title={`${t} · ${a.procedures?.name ?? '—'} · ${a.clients?.name ?? '—'} · ${a.users?.name ?? '—'}${a.cancellation_reason ? ` · ${a.cancellation_reason}` : ''}`}
                    style={{
                      opacity:      desmarcado(a) ? 0.6 : 1,
                      background:   st.bg,
                      borderLeft:   `3px solid ${st.border}`,
                      borderRadius: 5,
                      padding:      '4px 6px',
                      overflow:     'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <span style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: st.text }}>{t}</span>
                      <SeloDaFicha estado={a.ficha} />
                      <span style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {branches.find(b => b.id === a.branch_id)?.name ?? ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: st.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.procedures?.name ?? '—'}
                    </div>
                    <div style={{ fontSize: 'var(--text-overline)', fontWeight: 600, color: st.text, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                      {a.clients?.name ?? '—'}
                    </div>
                    <div style={{ fontSize: 'var(--text-overline)', color: st.text, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                      {a.status === 'ARRIVED' && <strong>{chegouEm(a.arrived_at)} · </strong>}{a.users?.name ?? '—'}
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
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 500 }}>{st.label}</span>
        </div>
      ))}
    </div>
  )
}

// -- Componente principal ------------------------------------------------------
export function AdminAgendaView({
  view, selectedDate, todayStr, branches, todasUnidades, unidadeId, appointments, janela, podeAgendar, escopoProprio, meuId = null,
}: Props) {
  const router = useRouter()
  const fala = useFala()
  // `true` = veio do botão "Agendar" (sem hora nem unidade);
  // objeto = veio de um horário vazio da grade.
  const [agendando, setAgendando] = useState<true | { branchId: string; quando: string } | null>(null)
  const [selecionado, setSelecionado] = useState<Appointment | null>(null)
  const [clienteInicial, setClienteInicial] = useState<string | null>(null)
  // `?novo=1&cliente=`: a busca universal e a ficha abrem o modal por aqui.
  useNovoAgendamentoDaUrl(podeAgendar, cliente => { setClienteInicial(cliente); setAgendando(true) })

  const mondayStr = getMondayOf(selectedDate)

  // O recorte por unidade acompanha a navegação de data e de modo: quem veio do
  // dashboard olhando uma unidade não deve perdê-la ao virar o dia.
  const navigate = (dateStr: string, v: AgendaView = view, unidade: string = unidadeId) => {
    const q = new URLSearchParams({ view: v, date: dateStr })
    if (unidade) q.set('unidade', unidade)
    router.push(`/admin/agenda?${q.toString()}`)
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

  // Os números do topo vêm de lib/metrics (D13): o cancelado e a falta separados.
  const conta = contagemDaAgenda(appointments)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Cabeçalho */}
      <div>
        <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
          ✦ {fala('Rede')}
        </p>
        <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
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
            <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
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
              style={{ fontSize: 'var(--text-sm-sz)', padding: '5px 12px', fontWeight: 600 }}
            >
              Hoje
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Recorte por unidade — o destino do "ver esta unidade" no dashboard
              da rede, que antes saía do portal. */}
          {todasUnidades.length > 1 && (
            <SegSelect
              options={[
                { key: '', label: 'Toda a rede' },
                ...todasUnidades.map(b => ({ key: b.id, label: b.name })),
              ]}
              value={unidadeId}
              onSelect={(k) => navigate(selectedDate, view, k)}
              ariaLabel="Unidade"
            />
          )}

          {/* Toggle de view */}
          <SegSelect
            options={[{ key: 'day', label: 'Dia' }, { key: 'week', label: 'Semana' }]}
            value={view}
            onSelect={(k) => navigate(selectedDate, k as AgendaView)}
            ariaLabel="Modo de visualização"
          />

          {/* Agendar daqui. A rede via a agenda das unidades mas não conseguia
              marcar nada: para isso era preciso entrar no portal de uma delas. */}
          {podeAgendar && (
            <button type="button" onClick={() => setAgendando(true)} className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-base-sz)' }}>
              <Plus size={14} /> Agendar
            </button>
          )}
        </div>
      </div>

      {/* KPIs compactos */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Total',          value: conta.total,         color: 'var(--brand)' },
          { label: 'Confirmados',    value: conta.confirmados,   color: 'var(--cat-4)' },
          { label: 'Em atendimento', value: conta.emAtendimento, color: 'var(--warning)' },
          { label: 'Concluídos',     value: conta.concluidos,    color: 'var(--success)' },
          { label: 'Cancelados',     value: conta.cancelados,    color: 'var(--text-muted)' },
          { label: 'Faltas',         value: conta.faltas,        color: 'var(--danger)' },
        ].map(k => (
          <div key={k.label} data-kpi={k.label} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            flex: '1 1 100px',
          }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</span>
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 600, color: 'var(--text-muted)' }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* Grade principal */}
      {view === 'day' ? (
        <DayGrid
          branches={branches}
          appointments={appointments}
          janela={janela}
          dia={selectedDate}
          onSelecionar={setSelecionado}
          onHorarioVazio={podeAgendar ? (branchId, quando) => setAgendando({ branchId, quando }) : null}
        />
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

      {/* O mesmo modal do portal da unidade — aqui ele pergunta a unidade
          antes, porque na rede não existe uma corrente. */}
      {/* Folha do agendamento — a mesma da unidade. O slug sai da unidade do
          proprio agendamento, que a grade ja conhece. */}
      {selecionado && (
        <AppointmentSheet
          appointment={{
            id:               selecionado.id,
            status:           selecionado.status,
            clientName:       selecionado.clients?.name ?? '—',
            procedureName:    selecionado.procedures?.name ?? '—',
            professionalName: selecionado.users?.name ?? '—',
            price:            String(selecionado.price ?? 0),
            pagoAntes:        selecionado.pagoAntes ?? null,
            durationMin:      selecionado.duration_min ?? undefined,
            roomName:         selecionado.rooms?.name ?? null,
            // A agenda da rede mostra várias unidades: a janela diz de qual (A29).
            unidade:          todasUnidades.find(b => b.id === selecionado.branch_id)?.name ?? null,
            clientId:         selecionado.client_id ?? null,
            start:            selecionado.scheduled_at,
            motivoDoCancelamento: selecionado.cancellation_reason ?? null,
            professionalId:   selecionado.professional_id ?? null,
          }}
          slug={todasUnidades.find(b => b.id === selecionado.branch_id)?.slug ?? ''}
          userRole=""
          escopoProprio={escopoProprio}
          podeGerenciar={podeAgendar}
          meuId={meuId}
          onClose={() => { setSelecionado(null); router.refresh() }}
        />
      )}

      {agendando && (
        <AppointmentModal
          // Vindo da grade, a unidade é a COLUNA em que se clicou, não a do
          // filtro: com "Toda a rede" escolhido, `unidadeId` é vazio e o modal
          // abriria pedindo de novo o que o clique já disse.
          branchId={agendando === true ? unidadeId : agendando.branchId}
          defaultDate={agendando === true ? undefined : agendando.quando}
          slug=""
          procedures={[]}
          professionals={[]}
          rooms={[]}
          unidades={todasUnidades}
          clienteInicialId={clienteInicial}
          onClose={() => { setAgendando(null); setClienteInicial(null) }}
          onSuccess={() => { setAgendando(null); setClienteInicial(null); router.refresh() }}
        />
      )}

    </div>
  )
}
