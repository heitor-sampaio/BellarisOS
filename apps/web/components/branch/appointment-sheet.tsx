'use client'

import { useState, useActionState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { X, CheckCircle2, Clock, AlertCircle, Ban, Play, CalendarClock, DoorOpen, HandCoins } from 'lucide-react'
import Link from 'next/link'
import { updateAppointmentStatus, rescheduleAppointment, chegarEIniciar } from '@/actions/appointments'
import { situacaoDaCobranca } from '@/actions/a-receber'
import { historicoDoAgendamento, type PassoDoHistorico } from '@/actions/historico-do-agendamento'
import { rotaAtendimento } from '@/lib/rotas'
import { JanelaModal } from '@/components/shared/janela-modal'
import { toast } from 'sonner'
import { ehODiaDoAgendamento } from '@/lib/agenda/chegada'
import { textoDoConcluido } from '@/lib/agenda/hora-real'
import { PreAtendimentoDoAgendamento } from './pre-atendimento-do-agendamento'

interface AppointmentEvent {
  id:               string
  status:           string
  clientName:       string
  procedureName:    string
  professionalName: string
  price:            string
  start:            string
  /** Cancelado: o motivo, inteiro (o bloco da grade o corta). */
  motivoDoCancelamento?: string | null
  /** A hora REAL da conclusão (J-34). */
  completedAt?:     string | null
}

interface AppointmentSheetProps {
  appointment: AppointmentEvent
  slug:        string
  userRole:    string
  /**
   * Cargo com alcance "só a própria agenda". Quem tem esse alcance mexe no
   * andamento do atendimento (iniciar, concluir), não no ciclo de vida do
   * agendamento — é o que `updateAppointmentStatus` já confere.
   *
   * Existe porque `userRole` virou a chave do cargo dinâmico: comparar com
   * `'PROFESSIONAL'` deixou de casar com qualquer cargo criado pela rede, e os
   * botões apareciam para quem a action recusaria.
   */
  escopoProprio?: boolean
  onClose:     () => void
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  ARRIVED:     'Chegou',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED:   'Concluído',
  CANCELLED:   'Cancelado',
  NO_SHOW:     'Não compareceu',
}
const STATUS_CHIP: Record<string, string> = {
  SCHEDULED:   'chip chip-muted',
  CONFIRMED:   'chip chip-brand',
  ARRIVED:     'chip chip-success',
  IN_PROGRESS: 'chip chip-warning',
  COMPLETED:   'chip chip-success',
  CANCELLED:   'chip chip-muted',
  NO_SHOW:     'chip chip-muted',
}

export function AppointmentSheet({ appointment, slug, userRole, escopoProprio, onClose }: AppointmentSheetProps) {
  const isProfessional = escopoProprio ?? userRole === 'PROFESSIONAL'
  const router   = useRouter()
  // Para onde ir ao iniciar o atendimento: quem decide o portal é o caminho
  // atual, não o slug do registro. Sem isto, iniciar pela agenda da rede jogava
  // a pessoa para dentro do portal da unidade.
  const pathname = usePathname()
  const [showCancelReason, setShowCancelReason] = useState(false)
  const [cancelReason, setCancelReason]         = useState('')
  const [loading, setLoading]                   = useState(false)
  const [remarcando, setRemarcando]             = useState(false)
  const [erro, setErro]                         = useState<string | null>(null)

  // O sucesso é tratado na própria action, quando a resposta chega — e não num
  // efeito que observa o estado depois.
  const [remarcaState, remarcaAction, remarcaPending] = useActionState(
    async (anterior: Parameters<typeof rescheduleAppointment>[0], dados: FormData) => {
      const r = await rescheduleAppointment(anterior, dados)
      if (r?.success) { setRemarcando(false); onClose(); toast.success('Agendamento remarcado.'); router.refresh() }
      return r
    },
    undefined,
  )

  const dt = new Date(appointment.start)
  const dateStr = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  // Data/hora atual no formato do input (local, não UTC).
  const pad = (n: number) => String(n).padStart(2, '0')
  const inicioLocal = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
  const [novoDT, setNovoDT] = useState(inicioLocal)

  // O que dizer quando dá certo (2026-10-21): a janela fechava em silêncio.
  const AVISO: Partial<Record<Parameters<typeof updateAppointmentStatus>[1], string>> = {
    CONFIRMED: 'Agendamento confirmado.',
    ARRIVED:   'Chegada registrada: a cliente está na espera.',
    NO_SHOW:   'Marcado como "não compareceu".',
    CANCELLED: 'Agendamento cancelado.',
  }

  async function changeStatus(status: Parameters<typeof updateAppointmentStatus>[1]) {
    setLoading(true)
    setErro(null)
    const r = await updateAppointmentStatus(appointment.id, status, slug,
      status === 'CANCELLED' ? cancelReason : undefined
    )
    setLoading(false)
    // O erro fica na janela: antes ela fechava como se tivesse dado certo.
    if (r?.error) { setErro(r.error); return }
    const aviso = AVISO[status]
    if (aviso) toast.success(aviso)
    if (status === 'IN_PROGRESS') {
      onClose()
      router.push(rotaAtendimento(pathname, slug, appointment.id))
    } else {
      onClose()
    }
  }

  async function chegarEComecar() {
    setLoading(true)
    setErro(null)
    const r = await chegarEIniciar(appointment.id, slug).catch(() => ({ error: 'Não foi possível marcar a chegada.', chegou: false }))
    setLoading(false)
    // Chegou mas não começou (documento a assinar): a tela do atendimento diz o quê.
    if (r?.error && !r.chegou) { setErro(r.error); return }
    if (r?.error) toast.error(r.error)
    onClose()
    router.push(rotaAtendimento(pathname, slug, appointment.id))
  }

  const isDone    = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.status)
  const isActive  = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'].includes(appointment.status)
  // Falta é de quem não veio na hora: antes do início, ainda pode vir.
  const [abertaEm] = useState(() => Date.now())
  const jaComecou = new Date(appointment.start).getTime() <= abertaEm
  // A chegada é do dia do agendamento (A18): a trava mora no servidor, e a
  // janela não oferece o que ele recusaria.
  const ehODia = ehODiaDoAgendamento(appointment.start, new Date(abertaEm))

  // A cobrança do concluído vem do servidor (a conta de atendimentos_a_receber).
  const [cobranca, setCobranca] = useState<Awaited<ReturnType<typeof situacaoDaCobranca>>>(null)
  useEffect(() => {
    if (appointment.status !== 'COMPLETED') return
    let vivo = true
    situacaoDaCobranca(appointment.id).then(r => { if (vivo) setCobranca(r) })
      // Só leitura: sem ela a janela fica como era ("encerrado"), mas o motivo vai ao console.
      .catch(e => console.error('[agenda] situação da cobrança:', e))
    return () => { vivo = false }
  }, [appointment.id, appointment.status])

  // Quem fez cada ação (J-27): o histórico do agendamento, lido ao abrir.
  const [historico, setHistorico] = useState<PassoDoHistorico[]>([])
  useEffect(() => {
    let vivo = true
    historicoDoAgendamento(appointment.id).then(h => { if (vivo) setHistorico(h) })
      // Só leitura: sem ela a janela fica como era, mas o motivo vai ao console.
      .catch(e => console.error('[agenda] histórico do agendamento:', e))
    return () => { vivo = false }
  }, [appointment.id, appointment.status])

  return (
    <JanelaModal onFechar={onClose} rotulo="Agendamento" largura={440}>
      <div style={{ padding: 'var(--card-pad)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span className={STATUS_CHIP[appointment.status] ?? 'chip chip-muted'}>
            {STATUS_LABEL[appointment.status] ?? appointment.status}
          </span>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={16} /></button>
        </div>

        {/* Info principal */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 'var(--text-name)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)', letterSpacing: 'var(--tracking-tight)' }}>
            {appointment.clientName}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {appointment.procedureName}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Clock size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
              <strong>{timeStr}</strong> — {dateStr}
              {appointment.status === 'COMPLETED' && textoDoConcluido(appointment.start, appointment.completedAt) && (
                <span style={{ color: 'var(--text-muted)' }}> · {textoDoConcluido(appointment.start, appointment.completedAt)}</span>
              )}
            </span>
          </div>
          {!isProfessional && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg-app)', borderRadius: 'var(--radius-card-sm)', border: '1px solid var(--border)' }}>
              <div>
                <p className="overline">Profissional</p>
                <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)', marginTop: 3 }}>{appointment.professionalName}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className="overline">Valor</p>
                <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)', marginTop: 3 }}>
                  {parseFloat(appointment.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* A ficha de pré-atendimento: pendente (com o link) ou respondida. */}
        {isActive && <PreAtendimentoDoAgendamento appointmentId={appointment.id} slug={slug} podeMandar={!isProfessional} />}

        {/* Ações de status */}
        {isActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Confirmar: só admins/recepcionistas */}
            {appointment.status === 'SCHEDULED' && !isProfessional && (
              <button disabled={loading} onClick={() => changeStatus('CONFIRMED')} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                <CheckCircle2 size={14} /> Confirmar agendamento
              </button>
            )}
            {/* Chegou (o check-in): a recepção marca quem está na sala de espera. */}
            {(appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED') && !isProfessional && ehODia && (
              <button disabled={loading} onClick={() => changeStatus('ARRIVED')}
                className={appointment.status === 'CONFIRMED' ? 'btn-primary' : 'btn-secondary'} style={{ width: '100%', justifyContent: 'center' }}>
                <DoorOpen size={14} /> Chegou
              </button>
            )}
            {/* A profissional no agendamento que ainda não chegou: o mesmo
                check-in e o mesmo início, num gesto (A21, 2026-10-27). Ela não
                via "Iniciar" no "Agendado", e a janela não dizia por quê. */}
            {(appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED') && isProfessional && ehODia && (
              <button disabled={loading} onClick={chegarEComecar} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                <Play size={14} /> Marcar chegada e iniciar
              </button>
            )}
            {(appointment.status === 'ARRIVED' || (appointment.status === 'CONFIRMED' && !isProfessional)) && (
              <button disabled={loading} onClick={() => changeStatus('IN_PROGRESS')} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                <Play size={14} /> Iniciar atendimento
              </button>
            )}
            {appointment.status === 'IN_PROGRESS' && (
              <Link
                href={rotaAtendimento(pathname, slug, appointment.id)}
                onClick={onClose}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 7 }}
              >
                <Play size={14} /> Retomar atendimento
              </Link>
            )}

            {/* Remarcar existia só no arraste do calendário da unidade — a
                agenda da rede é por unidade, não por profissional, e ali não há
                o que arrastar. Aqui o horário novo é digitado. */}
            {!isProfessional && appointment.status !== 'IN_PROGRESS' && (
              <button disabled={loading} onClick={() => setRemarcando(v => !v)} className="btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}>
                <CalendarClock size={14} /> Remarcar
              </button>
            )}

            {remarcando && (
              <form action={remarcaAction} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'var(--bg-app)', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)' }}>
                <input type="hidden" name="_appointmentId" value={appointment.id} />
                <input type="hidden" name="_slug"          value={slug} />
                <input type="hidden" name="scheduled_at"   value={novoDT ? new Date(novoDT).toISOString() : ''} />
                <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>
                  Novo horário
                </label>
                <input
                  type="datetime-local" className="field"
                  value={novoDT}
                  onChange={e => setNovoDT(e.target.value)}
                  style={{ background: 'var(--surface)' }}
                />
                {remarcaState?.error && (
                  <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 600 }}>{remarcaState.error}</p>
                )}
                <button type="submit" disabled={remarcaPending || !novoDT || novoDT === inicioLocal} className="btn-primary" style={{ justifyContent: 'center' }}>
                  {remarcaPending ? 'Remarcando…' : 'Confirmar novo horário'}
                </button>
              </form>
            )}

            {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}

            {/* Falta e cancelamento são do ciclo de vida do agendamento: quem tem a
                agenda "só os meus" mexe no andamento do atendimento, e a action
                recusa o resto — a janela mostra só o que ela deixa fazer. */}
            {!isProfessional && (
            <div style={{ display: 'flex', gap: 8 }}>
              {jaComecou && (
                <button disabled={loading} onClick={() => changeStatus('NO_SHOW')} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                  <AlertCircle size={14} /> Não compareceu
                </button>
              )}
              <button disabled={loading} onClick={() => setShowCancelReason(true)} className="btn-ghost" style={{ flex: 1, justifyContent: 'center', color: 'var(--warning)' }}>
                <Ban size={14} /> Cancelar
              </button>
            </div>
            )}

            {showCancelReason && !isProfessional && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--warning)' }}>
                {/* O rótulo LIGADO ao campo (J-31, design.md). */}
                <label htmlFor="motivo-do-cancelamento" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--warning)' }}>
                  Motivo do cancelamento *
                </label>
                <input
                  id="motivo-do-cancelamento"
                  type="text" className="field" required
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Descreva o motivo…"
                  style={{ background: 'var(--surface)' }}
                />
                <button
                  disabled={!cancelReason.trim() || loading}
                  onClick={() => changeStatus('CANCELLED')}
                  className="btn-primary"
                  style={{ justifyContent: 'center' }}
                >
                  Confirmar cancelamento
                </button>
              </div>
            )}
          </div>
        )}

        {/* O concluído a receber tem porta (D5, 2026-10-27): a janela só dizia
            "encerrado", e o "Confirmar pagamento" morava numa URL que ninguém
            achava. O de R$ 0 diz que não há cobrança (D9). */}
        {appointment.status === 'COMPLETED' && cobranca?.situacao === 'A_RECEBER' && (
          cobranca.podeReceber ? (
            <Link href={`${rotaAtendimento(pathname, slug, appointment.id)}?receber=1`} onClick={onClose}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <HandCoins size={14} /> Receber pagamento
            </Link>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--warning)', fontSize: 'var(--text-sm-sz)', fontWeight: 700, marginBottom: 10 }}>
              Pagamento a receber na recepção.
            </p>
          )
        )}
        {appointment.status === 'COMPLETED' && cobranca?.situacao === 'SEM_COBRANCA' && (
          <p style={{ textAlign: 'center', color: 'var(--success)', fontSize: 'var(--text-sm-sz)', fontWeight: 700, marginBottom: 10 }}>
            Sem cobrança — atendimento de R$ 0,00.
          </p>
        )}
        {appointment.status === 'CANCELLED' && appointment.motivoDoCancelamento && (
          <p data-motivo-do-cancelamento style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginBottom: 10 }}>
            <strong>Motivo:</strong> {appointment.motivoDoCancelamento}
          </p>
        )}
        {isDone && (
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-xs-sz)' }}>
            Este agendamento já foi encerrado.
          </p>
        )}

        {historico.length > 0 && (
          <section aria-label="Histórico do agendamento" style={{ marginTop: 18, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
            <p className="overline" style={{ marginBottom: 6 }}>Histórico</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {historico.map((h, i) => (
                <li key={i} style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{h.oQue}</strong>
                  {h.quem && <> · {h.quem}</>}
                  {' · '}{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(h.quando))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </JanelaModal>
  )
}
