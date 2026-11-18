'use client'

import { useState, useActionState, useCallback, useEffect } from 'react'
import { rotuloDoPagoAntes } from '@/lib/appointments/pago-antes-textos'
import { useRouter, usePathname } from 'next/navigation'
import { X, CheckCircle2, Clock, AlertCircle, AlertTriangle, Ban, Play, CalendarClock, DoorOpen, HandCoins, Lock } from 'lucide-react'
import Link from 'next/link'
import { updateAppointmentStatus, rescheduleAppointment, chegarEIniciar, avisosDoRemarcar } from '@/actions/appointments'
import { situacaoDaCobranca } from '@/actions/a-receber'
import { historicoDoAgendamento, type PassoDoHistorico } from '@/actions/historico-do-agendamento'
import { rotaAtendimento, rotaDaComanda } from '@/lib/rotas'
import { JanelaModal } from '@/components/shared/janela-modal'
import { toast } from 'sonner'
import { ehODiaDoAgendamento } from '@/lib/agenda/chegada'
import { textoDoConcluido } from '@/lib/agenda/hora-real'
import { PreAtendimentoDoAgendamento } from './pre-atendimento-do-agendamento'
import { DocumentosDaJanela } from './documentos-da-janela'
import { MudarDeUnidade, TrocarProfissional, UsarOQueJaFoiPago } from './janela-do-agendamento-acoes'
import type { MenorDoAgendamento } from '@/components/shared/selo-do-menor'
import { useFuso } from '@/components/shared/fuso'
import { Dica } from '@/components/shared/dica'
import { textoDeQuemConclui } from '@/lib/equipe/textos-de-quem-pode'
import { TEXTO_DA_SESSAO_NA_DESISTENCIA } from '@/lib/atendimento/desistencia'
import { naParede, daParede } from '@/lib/datetime'

interface AppointmentEvent {
  id:               string
  status:           string
  clientName:       string
  procedureName:    string
  professionalName: string
  price:            string
  /** Já pago antes (D12): o texto que substitui o valor ("Pré-pago · 1 de 2"). */
  pagoAntes?:       string | null
  /** A29: a duração, a sala e a unidade na janela; a cliente para "Reagendar". */
  durationMin?:     number
  roomName?:        string | null
  unidade?:         string | null
  clientId?:        string | null
  start:            string
  /** Cancelado: o motivo, inteiro (o bloco da grade o corta). */
  motivoDoCancelamento?: string | null
  /** A hora REAL da conclusão (J-34). */
  completedAt?:     string | null
  /** A profissional do agendamento: quem é ela marca a chegada e inicia num gesto (A25). */
  professionalId?:  string | null
  /** O procedimento (A27 da 7ª): o "Reagendar" da falta abre com ele. */
  procedureId?:     string | null
  /** A menor de idade (decisão 2 do Heitor, 2026-11-05): a marca e o responsável. */
  menor?:           MenorDoAgendamento | null
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
  /**
   * A agenda em Gerenciar. Com "só os meus", ela cancela e marca a falta do
   * agendamento DELA (agenda-06, revisão do Heitor de 2026-11-02) — a janela da
   * agenda "só os meus" lista só os dela, e a action confere de novo.
   */
  podeGerenciar?: boolean
  /** O membro logado (users.id): no agendamento DELE, "Marcar chegada e iniciar" (A25). */
  meuId?: string | null
  /**
   * Inicia e conclui o atendimento: o Atendimento em Gerenciar (o Heitor,
   * 2026-11-18: "Só inicia e conclui atendimento quem tem gerenciar no
   * atendimento"). Sem ele, a janela não oferece o Iniciar e diz quem inicia.
   */
  podeConcluir?: boolean
  /** O Atendimento "só os meus": inicia e conclui só os DELA. */
  atendimentoProprio?: boolean
  /** Sem iniciar, quem inicia e conclui — o Atendimento em Gerenciar, pelo nome (quemConcluiOAtendimento). */
  quemConclui?: string[] | null
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

export function AppointmentSheet({ appointment, slug, userRole, escopoProprio, podeGerenciar = false, meuId = null, podeConcluir = true, atendimentoProprio = false, quemConclui = null, onClose }: AppointmentSheetProps) {
  const isProfessional = escopoProprio ?? userRole === 'PROFESSIONAL'
  // A dona (ou a gerente) que atende, no agendamento DELA: o gesto da
  // profissional, em vez de "Chegou" → "Iniciar" (A25 da 6ª simulação: eram
  // quatro cliques e uma confirmação). A action é a mesma (chegarEIniciar).
  const ehMeu = !!meuId && appointment.professionalId === meuId && podeGerenciar
  // Cancelar e "Não compareceu": a agenda em Gerenciar — quem tem "todos" e
  // quem tem "só os meus", no dela (agenda-06). Iniciar e concluir são do
  // Atendimento em Gerenciar (o Heitor, 2026-11-18; saiu o D20, "a agenda em
  // Ver inicia e conclui"), com o "só os meus" dele.
  const podeAtenderEste = podeConcluir && (!atendimentoProprio || (!!meuId && appointment.professionalId === meuId))
  // Cancelar o Em atendimento é DESISTIR dele: do Atendimento em Gerenciar, com
  // o escopo dele (CLAUDE.md §11, o Heitor, 2026-11-18) — a mesma regra do
  // servidor (`recusaDoCancelar`). O "Não compareceu" não vale ali.
  const emAtendimento = appointment.status === 'IN_PROGRESS'
  const podeCancelar = emAtendimento ? podeAtenderEste : podeGerenciar
  const router   = useRouter()
  // Para onde ir ao iniciar o atendimento: quem decide o portal é o caminho
  // atual, não o slug do registro. Sem isto, iniciar pela agenda da rede jogava
  // a pessoa para dentro do portal da unidade.
  const pathname = usePathname()
  const [showCancelReason, setShowCancelReason] = useState(false)
  // A25 da 7ª simulação: "Não compareceu" gravava no clique, sem confirmar.
  const [confirmandoFalta, setConfirmandoFalta] = useState(false)
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

  // No relógio da UNIDADE (F62): `dt` é "de parede" (os campos locais são o relógio dela).
  const fuso = useFuso()
  const dt = naParede(appointment.start, fuso)
  const instanteDe = useCallback((parede: string) => daParede(new Date(parede), fuso).toISOString(), [fuso])
  // O rótulo formata o INSTANTE no fuso; o `dt` de parede com `timeZone` convertia
  // duas vezes (D1 da 13ª: −2 h em Rio Branco, para quem abre em Brasília).
  const inicio  = new Date(appointment.start)
  const dateStr = inicio.toLocaleDateString('pt-BR', { timeZone: fuso, weekday: 'long', day: '2-digit', month: 'long' })
  const timeStr = inicio.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })

  // Data/hora atual no formato do input (local, não UTC).
  const pad = (n: number) => String(n).padStart(2, '0')
  const inicioLocal = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
  const [novoDT, setNovoDT] = useState(inicioLocal)

  // O que o remarcar avisa ANTES de confirmar (A25, cli-01): fora do
  // expediente, choque e a cliente arquivada. Só aviso — o servidor decide.
  // Guardados com o horário a que respondem (D9 da 8ª): o aviso de um horário
  // não vale para o seguinte, e o Confirmar espera o do horário escolhido.
  const [avisosLidos, setAvisosLidos] = useState<{ de: string; itens: string[]; conflito?: string | null }>({ de: '', itens: [] })
  const avisosRemarcar = avisosLidos.de === novoDT ? avisosLidos.itens : []
  // A21 da 8ª simulação: o choque não é encaixe — o servidor recusa. O aviso
  // diz "Não vai ser remarcado"; recusado, fica UMA mensagem (eram as duas).
  const conflitoRemarcar = avisosLidos.de === novoDT ? (avisosLidos.conflito ?? null) : null
  const recusadoPorChoque = !!remarcaState?.error && !!conflitoRemarcar
  const conferindoRemarcar = remarcando && !!novoDT && novoDT !== inicioLocal && avisosLidos.de !== novoDT
  useEffect(() => {
    if (!remarcando || !novoDT) return
    let vivo = true
    const t = setTimeout(() => {
      avisosDoRemarcar(appointment.id, instanteDe(novoDT))
        .then(r => {
          if (!vivo) return
          // O choque do horário de AGORA é o próprio agendamento: só conta o do novo.
          const novo = novoDT !== inicioLocal
          setAvisosLidos({ de: novoDT, itens: [r.clienteArquivada, novo ? (r.passado ?? null) : null, novo ? r.foraDoHorario : null, novo ? (r.bloqueio ?? null) : null].filter((x): x is string => !!x), conflito: novo ? r.conflito : null })
        })
        // Sem a conferência, nenhum aviso (o servidor ainda decide) — e o Confirmar não espera para sempre.
        .catch(() => { if (vivo) setAvisosLidos({ de: novoDT, itens: [] }) })
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [remarcando, novoDT, inicioLocal, appointment.id, instanteDe])

  // O que dizer quando dá certo (2026-10-21): a janela fechava em silêncio.
  const AVISO: Partial<Record<Parameters<typeof updateAppointmentStatus>[1], string>> = {
    CONFIRMED: 'Agendamento confirmado.',
    ARRIVED:   'Chegada registrada: a cliente está na espera.',
    NO_SHOW:   'Marcado como "não compareceu".',
    CANCELLED: 'Agendamento cancelado.',
  }

  // O início muito antes do horário pergunta (A32): a resposta manda de novo, confirmada.
  const [perguntaDoInicio, setPerguntaDoInicio] = useState<{ texto: string; chegar: boolean } | null>(null)

  async function changeStatus(status: Parameters<typeof updateAppointmentStatus>[1], inicioAdiantadoConfirmado = false) {
    setLoading(true)
    setErro(null)
    setPerguntaDoInicio(null)
    const r = await updateAppointmentStatus(appointment.id, status, slug,
      status === 'CANCELLED' ? cancelReason : undefined,
      { inicioAdiantadoConfirmado },
    )
    setLoading(false)
    if (r?.confirmarInicioAdiantado && r.error) { setPerguntaDoInicio({ texto: r.error, chegar: false }); return }
    // O erro fica na janela: antes ela fechava como se tivesse dado certo.
    if (r?.error) { setErro(r.error); return }
    const aviso = AVISO[status]
    if (aviso) toast.success(aviso)
    // D13 da 9ª: a chegada de quem tem parcela vencida avisa (a chegada vale).
    if (r && 'aviso' in r && r.aviso) toast.warning(r.aviso, { duration: 12_000 })
    if (status === 'IN_PROGRESS') {
      onClose()
      router.push(rotaAtendimento(pathname, slug, appointment.id))
    } else {
      onClose()
    }
  }

  async function chegarEComecar(inicioAdiantadoConfirmado = false) {
    setLoading(true)
    setErro(null)
    setPerguntaDoInicio(null)
    const r: { error?: string; chegou?: boolean; confirmarInicioAdiantado?: boolean } = await chegarEIniciar(appointment.id, slug, { inicioAdiantadoConfirmado })
      .catch(() => ({ error: 'Não foi possível marcar a chegada.', chegou: false }))
    setLoading(false)
    if (r?.confirmarInicioAdiantado && r.error) { setPerguntaDoInicio({ texto: r.error, chegar: true }); return }
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
  const ehODia = ehODiaDoAgendamento(appointment.start, new Date(abertaEm), fuso)

  // Os gestos de chegada e início, e UM em destaque — o próximo passo (A5 da
  // 10ª: eram três quase iguais, dois em rosé). No agendamento DELA, o gesto
  // dela; chegou, iniciar; confirmado, a chegada; agendado, confirmar.
  const aindaNaoChegou = appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED'
  const mostraChegarEIniciar = aindaNaoChegou && (isProfessional || ehMeu) && ehODia && podeGerenciar && podeAtenderEste
  const mostraConfirmar = appointment.status === 'SCHEDULED' && !isProfessional && podeGerenciar
  const mostraChegou = aindaNaoChegou && !isProfessional && ehODia && podeGerenciar
  const chegaAoInicio = appointment.status === 'ARRIVED' || (appointment.status === 'CONFIRMED' && !isProfessional)
  const mostraIniciar = chegaAoInicio && podeAtenderEste
  const principal = mostraChegarEIniciar ? 'chegarEIniciar'
    : appointment.status === 'ARRIVED' ? 'iniciar'
    : appointment.status === 'CONFIRMED' && mostraChegou ? 'chegou'
    : mostraConfirmar ? 'confirmar'
    : mostraIniciar ? 'iniciar' : null

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
          {/* A menor de idade: a marca e quem a acompanha — ou a falta dele (decisão 2). */}
          {appointment.menor && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <span data-menor className="chip chip-brand">Menor de idade</span>
              {appointment.menor.responsavel
                ? <span data-responsavel-do-agendamento style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{appointment.menor.responsavel}</span>
                : <span data-aviso-do-menor style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>Sem responsável legal no cadastro: é ele quem assina o termo.</span>}
            </div>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {appointment.procedureName}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Clock size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
              <strong>{timeStr}</strong> — {dateStr}
              {appointment.status === 'COMPLETED' && textoDoConcluido(appointment.start, appointment.completedAt, fuso) && (
                <span style={{ color: 'var(--text-muted)' }}> · {textoDoConcluido(appointment.start, appointment.completedAt, fuso)}</span>
              )}
            </span>
          </div>
          {/* A29: a duração, a sala e a unidade — a janela não as dizia. */}
          {(appointment.durationMin || appointment.roomName || appointment.unidade) && (
            <p data-detalhes-do-agendamento style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', paddingLeft: 24 }}>
              {[
                appointment.durationMin ? `${appointment.durationMin} min` : null,
                appointment.roomName ?? null,
                appointment.unidade ?? null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          {!isProfessional && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg-app)', borderRadius: 'var(--radius-card-sm)', border: '1px solid var(--border)' }}>
              <div>
                <p className="overline">Profissional</p>
                <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)', marginTop: 3 }}>{appointment.professionalName}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                {/* D12: o pré-pago, a sessão do pacote e a do plano já foram
                    pagos — o valor ali parecia cobrança pendente. D4 da 21ª: "Incluído",
                    não "Já pago" — a venda no crediário tem parcelas em aberto (o texto diz). */}
                {appointment.pagoAntes ? (
                  <>
                    {/* 21ª: o plano aceito e não recebido diz "A receber", não "Incluído". */}
                    <p className="overline">{rotuloDoPagoAntes(appointment.pagoAntes)}</p>
                    <p data-pago-antes style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: rotuloDoPagoAntes(appointment.pagoAntes) === 'A receber' ? 'var(--warning)' : 'var(--success)', marginTop: 3 }}>
                      {appointment.pagoAntes}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="overline">Valor</p>
                    <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)', marginTop: 3 }}>
                      {parseFloat(appointment.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* A20 da 8ª: o avulso de quem tem o pacote (ou o pré-pago) do mesmo procedimento se liga a ele. */}
        {isActive && podeGerenciar && !appointment.pagoAntes && (
          <UsarOQueJaFoiPago appointmentId={appointment.id} onUsou={() => { onClose(); router.refresh() }} />
        )}

        {/* Os termos e contratos: assinados ou não, e o que bloqueia o início (A34). */}
        {isActive && <DocumentosDaJanela appointmentId={appointment.id} slug={slug} />}

        {/* A ficha de pré-atendimento: pendente (com o link) ou respondida. */}
        {isActive && <PreAtendimentoDoAgendamento appointmentId={appointment.id} slug={slug} podeMandar={!isProfessional} />}

        {/* Ações de status */}
        {isActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* A20 da 10ª: quem não inicia nem conclui (sem o Atendimento em
                Gerenciar, ou o de outra pessoa com "só os meus") lê por quê, onde
                estaria o Iniciar. A9 da 20ª: a permissão e quem conclui, pelo nome.
                A12 da 21ª: aviso à vista, acima dos botões. */}
            {chegaAoInicio && !podeAtenderEste && (
              <p data-quem-conclui role="note" style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderRadius: 'var(--radius-field-token)',
                background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', color: 'var(--warning)',
                fontSize: 'var(--text-sm-sz)', fontWeight: 700,
              }}>
                <Lock size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                <span><strong>Você não inicia nem conclui este atendimento.</strong> <span>{textoDeQuemConclui(quemConclui)}</span></span>
              </p>
            )}
            {/* A profissional no agendamento que ainda não chegou: o mesmo
                check-in e o mesmo início, num gesto (A21, 2026-10-27). Ela não
                via "Iniciar" no "Agendado", e a janela não dizia por quê. É o
                gesto DELA, então vem primeiro (A5 da 10ª). */}
            {mostraChegarEIniciar && (
              <button disabled={loading} onClick={() => chegarEComecar()} className={principal === 'chegarEIniciar' ? 'btn-primary' : 'btn-secondary'} style={{ width: '100%', justifyContent: 'center' }}>
                <Play size={14} /> Marcar chegada e iniciar
              </button>
            )}
            {/* Confirmar: só admins/recepcionistas */}
            {mostraConfirmar && (
              <button disabled={loading} onClick={() => changeStatus('CONFIRMED')} className={principal === 'confirmar' ? 'btn-primary' : 'btn-secondary'} style={{ width: '100%', justifyContent: 'center' }}>
                <CheckCircle2 size={14} /> Confirmar agendamento
              </button>
            )}
            {/* Chegou (o check-in): a recepção marca quem está na sala de espera. */}
            {mostraChegou && (
              <button disabled={loading} onClick={() => changeStatus('ARRIVED')}
                className={principal === 'chegou' ? 'btn-primary' : 'btn-secondary'} style={{ width: '100%', justifyContent: 'center' }}>
                <DoorOpen size={14} /> Chegou
              </button>
            )}
            {/* A5 da 10ª: três botões quase iguais, dois em rosé. Um só em
                destaque (o próximo passo) e, com mais de um, o que cada um faz —
                na dica desde 2026-11-16 ("A explicação mora na dica"). */}
            {[mostraConfirmar, mostraChegou, mostraChegarEIniciar].filter(Boolean).length > 1 && (
              <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                <span>O que cada botão faz</span>
                <Dica rotulo="O que cada botão faz">
                  <span data-o-que-cada-um-faz>
                    {[
                      mostraConfirmar && 'Confirmar: a cliente confirmou que vem.',
                      mostraChegou && 'Chegou: ela está na espera.',
                      mostraChegarEIniciar && 'Marcar chegada e iniciar: ela chegou e o atendimento começa agora.',
                    ].filter(Boolean).join(' ')}
                  </span>
                </Dica>
              </p>
            )}
            {mostraIniciar && (
              <button disabled={loading} onClick={() => changeStatus('IN_PROGRESS')} className={principal === 'iniciar' ? 'btn-primary' : 'btn-secondary'} style={{ width: '100%', justifyContent: 'center' }}>
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
                o que arrastar. Aqui o horário novo é digitado. D20 (F75): com
                "só os meus" e Gerenciar, remarca o PRÓPRIO — como cancela e marca
                a falta dele; a action (`remarcarCore`) já deixava. */}
            {(!isProfessional || ehMeu) && podeGerenciar && appointment.status !== 'IN_PROGRESS' && (
              <button disabled={loading} onClick={() => setRemarcando(v => !v)} className="btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}>
                <CalendarClock size={14} /> Remarcar
              </button>
            )}

            {remarcando && (
              <form action={remarcaAction} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'var(--bg-app)', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)' }}>
                <input type="hidden" name="_appointmentId" value={appointment.id} />
                <input type="hidden" name="_slug"          value={slug} />
                <input type="hidden" name="scheduled_at"   value={novoDT ? instanteDe(novoDT) : ''} />
                <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>
                  Novo horário
                </label>
                <input
                  type="datetime-local" className="field"
                  value={novoDT}
                  onChange={e => setNovoDT(e.target.value)}
                  style={{ background: 'var(--surface)' }}
                />
                {(avisosRemarcar.length > 0 || (conflitoRemarcar && !recusadoPorChoque)) && (
                  <div data-aviso-do-remarcar role="status" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {conflitoRemarcar && !recusadoPorChoque && (
                      <p style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 700 }}>
                        <Ban size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} /> Não vai ser remarcado: {conflitoRemarcar}
                      </p>
                    )}
                    {avisosRemarcar.map(a => (
                      <p key={a} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 600 }}>
                        <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} /> {a}
                      </p>
                    ))}
                  </div>
                )}
                {remarcaState?.error && (
                  <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 600 }}>
                    {recusadoPorChoque ? `Não foi remarcado: ${conflitoRemarcar}` : remarcaState.error}
                  </p>
                )}
                <button type="submit" disabled={remarcaPending || !novoDT || novoDT === inicioLocal || conferindoRemarcar} className="btn-primary" style={{ justifyContent: 'center' }}>
                  {remarcaPending ? 'Remarcando…' : conferindoRemarcar ? 'Conferindo o horário…' : 'Confirmar novo horário'}
                </button>
              </form>
            )}

            {/* A22 da 8ª: trocar a profissional pela janela, não só arrastando.
                Com a Agenda "só os meus" e Gerenciar, passa a outra pessoa o
                atendimento DELA (o Heitor, 2026-11-18; a action confere). */}
            {(!isProfessional || ehMeu) && podeGerenciar && (
              <TrocarProfissional appointmentId={appointment.id} slug={slug} atual={appointment.professionalName}
                onTrocou={() => { onClose(); router.refresh() }} />
            )}
            {/* A33 da 9ª: mudar a UNIDADE (a cliente é da clínica — H5). */}
            {!isProfessional && podeGerenciar && ['SCHEDULED', 'CONFIRMED'].includes(appointment.status) && (
              <MudarDeUnidade appointmentId={appointment.id} unidadeAtual={appointment.unidade ?? null}
                onMudou={() => { onClose(); router.refresh() }} />
            )}

            {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
            {/* O início muito antes do horário (A32): o servidor pergunta. */}
            {perguntaDoInicio && (
              <div data-inicio-adiantado role="alert" style={{ padding: '10px 12px', borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', fontWeight: 700 }}>{perguntaDoInicio.texto}</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" className="btn-secondary" disabled={loading} onClick={() => setPerguntaDoInicio(null)}>Agora não</button>
                  <button type="button" className="btn-primary" disabled={loading}
                    onClick={() => (perguntaDoInicio.chegar ? chegarEComecar(true) : changeStatus('IN_PROGRESS', true))}>Iniciar mesmo assim</button>
                </div>
              </div>
            )}

            {/* Falta e cancelamento: a recepção e, com "só os meus" e a agenda em
                Gerenciar, a profissional no DELA (agenda-06, 2026-11-02). A
                janela mostra só o que a action deixa fazer. */}
            {podeCancelar && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {jaComecou && !emAtendimento && (
                <button disabled={loading} onClick={() => { setConfirmandoFalta(true); setShowCancelReason(false) }} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                  <AlertCircle size={14} /> Não compareceu
                </button>
              )}
              <button disabled={loading} onClick={() => { setShowCancelReason(true); setConfirmandoFalta(false) }} className="btn-ghost" style={{ flex: 1, justifyContent: 'center', color: 'var(--warning)' }}>
                <Ban size={14} /> Cancelar
              </button>
              {/* A27 da 12ª (princípio 3): a regra fica — a falta é de quem não veio
                  NA HORA —, e a janela diz quando ela aparece: na dica, ao lado do
                  "Cancelar" (2026-11-16). O rótulo não diz "Não compareceu": seria
                  o nome de um botão que ainda não existe. */}
              {!jaComecou && !emAtendimento && (
                <Dica rotulo="Sobre a falta">
                  <span data-falta-depois-do-horario>
                    “Não compareceu” aparece a partir do horário marcado ({dateStr}, {timeStr}): antes dele, a cliente ainda pode vir. Para desmarcar agora, é “Cancelar”, com o motivo.
                  </span>
                </Dica>
              )}
            </div>
            )}

            {confirmandoFalta && podeCancelar && jaComecou && !emAtendimento && (
              <div data-confirmar-falta role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--warning-border)' }}>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', fontWeight: 'var(--weight-bold)', lineHeight: 1.5 }}>
                  Marcar que {appointment.clientName} não compareceu às {timeStr}? Os termos em aberto deste horário são cancelados, e o que estava pago (pacote, plano, pré-pago) volta para ela.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" className="btn-secondary" disabled={loading} onClick={() => setConfirmandoFalta(false)}>Voltar</button>
                  <button type="button" className="btn-primary" disabled={loading} onClick={() => changeStatus('NO_SHOW')}>Confirmar a falta</button>
                </div>
              </div>
            )}

            {showCancelReason && podeCancelar && (
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
                {emAtendimento && (
                  <p data-sessao-paga-conta style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', lineHeight: 1.5 }}>
                    {TEXTO_DA_SESSAO_NA_DESISTENCIA}
                  </p>
                )}
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
            "encerrado". Desde o PDV (PDV7/CX3, 2026-11-13) a porta é a COMANDA
            do atendimento no PDV — a tela do atendimento não recebe mais.
            O de R$ 0 diz que não há cobrança (D9). */}
        {appointment.status === 'COMPLETED' && cobranca?.situacao === 'A_RECEBER' && (
          cobranca.podeReceber && cobranca.comanda ? (
            <Link href={rotaDaComanda(pathname, slug, cobranca.comanda.unidadeId, cobranca.comanda.id)} onClick={onClose}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <HandCoins size={14} /> Receber no PDV
            </Link>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--warning)', fontSize: 'var(--text-sm-sz)', fontWeight: 700, marginBottom: 10 }}>
              Pagamento a receber no PDV.
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
        {/* A29: o cancelado e a falta ganham "Reagendar" — o novo agendamento
            já com a cliente (o `?novo=1&cliente=` da agenda). */}
        {(appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') && podeCancelar && appointment.clientId && (
          <button type="button" className="btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
            onClick={() => {
              const q = new URLSearchParams(window.location.search)
              q.set('novo', '1'); q.set('cliente', appointment.clientId!)
              // A27 da 7ª: o novo agendamento já vem com o procedimento e a
              // profissional da falta; o horário é o próximo livre dela.
              if (appointment.procedureId) q.set('procedimento', appointment.procedureId)
              if (appointment.professionalId) q.set('profissional', appointment.professionalId)
              onClose()
              router.push(`${pathname}?${q.toString()}`)
            }}>
            <CalendarClock size={14} /> Reagendar
          </button>
        )}
        {/* A14 da 10ª: com o pagamento ainda a receber, o atendimento não está
            "encerrado" — a frase contradizia o "Receber no PDV" logo acima. */}
        {isDone && cobranca?.situacao !== 'A_RECEBER' && (
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
                  {' · '}{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: fuso }).format(new Date(h.quando))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </JanelaModal>
  )
}
