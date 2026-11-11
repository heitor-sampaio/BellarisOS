'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { rotaAtendimento } from '@/lib/rotas'
import { X, Calendar, Play, CheckCircle2, Loader2, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  getClientPackageSessions,
  schedulePackageSession,
  getPlannedSessionAppointments,
  schedulePlanSession,
  getSchedulingBranchProfessionals,
  getSchedulingDaySlots,
  salasParaAgendar,
} from '@/actions/appointments'
import type { SalaParaAgendar } from '@/lib/appointments/salas'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { JanelaModal } from '@/components/shared/janela-modal'
import { GradeDeHorarios } from '@/components/shared/grade-de-horarios'
import type { Horario } from '@/lib/agenda/horario'
import { ocupanteDoHorario } from '@/lib/agenda/horario-livre'
import { AvisoDoPacoteEmAberto } from '@/components/shared/aviso-do-pacote-em-aberto'

// -- Types ---------------------------------------------------------------------

type Session = {
  id:               string
  sessionNumber:    number
  status:           string
  appointmentId:    string | null
  scheduledAt:      string | null
  apptStatus:       string | null
  professionalName: string | null
  procedureName:    string | null
  procedureId?:     string
  /** A duração da sessão do plano (a soma dos procedimentos dela — D5 da 9ª). */
  durationMin?:     number
}

interface Props {
  // Package mode (client_packages)
  clientPackageId?: string
  // Plan mode (avulso treatment_plan)
  planId?:          string
  planStatus?:      string
  // Common
  packageName:      string
  totalSessions:    number
  usedSessions:     number
  clientId:         string
  procedureId:      string   // used in package mode; in plan mode may be per-session
  procedureName:    string
  price:            number
  durationMin:      number
  slug:             string
  branches:         { id: string; name: string }[]
  currentBranchId:  string
  canManageProcedures: boolean
  isNetworkWide:       boolean
  onClose:          () => void
  /**
   * Cancelar o plano fechado (D4 da 9ª simulação; decisão 2 do Heitor: "usa a
   * mesma coisa do pacote"): abre a janela do cancelamento — a conta, o
   * crediário que cai, o que volta e as sessões agendadas, com um motivo só
   * (o A19: cancelar sessão a sessão pedia o motivo a cada uma). Só para quem
   * tem o Financeiro em Gerenciar; era o "Cancelar tratamento", que não mexia
   * no dinheiro.
   */
  onCancelarPlano?: () => void
  /** A41 da 11ª: o crediário deste pacote ainda em aberto (só a quem recebe). */
  emAberto?: { valor: number; parcelas: number } | null
}

// -- Helpers -------------------------------------------------------------------

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  AVAILABLE:   { label: 'Não agendado',  color: 'var(--text-faint)' },
  SCHEDULED:   { label: 'Agendado',      color: 'var(--info)' },
  IN_PROGRESS: { label: 'Em andamento',  color: 'var(--warning)' },
  USED:        { label: 'Realizada',     color: 'var(--success)' },
  COMPLETED:   { label: 'Realizada',     color: 'var(--success)' },
  CANCELLED:   { label: 'Cancelada',     color: 'var(--danger)' },
}

/** "5× Limpeza + 3× Drenagem", das sessões carregadas (o pacote é um conjunto de procedimentos). */
function composicaoDasSessoes(sessoes: Session[]): string {
  const contagem = new Map<string, number>()
  for (const s of sessoes) if (s.procedureName) contagem.set(s.procedureName, (contagem.get(s.procedureName) ?? 0) + 1)
  return [...contagem].map(([nome, n]) => `${n}× ${nome}`).join(' + ')
}

// -- Mini-scheduler inline -----------------------------------------------------
// Exportado: a ficha agenda a unidade pré-paga com ele (fase 3 de "Vender").

export function SessionScheduler({
  branches,
  currentBranchId,
  procedimento = null,
  onSave,
  onCancel,
}: {
  branches:        { id: string; name: string }[]
  currentBranchId: string
  /**
   * O procedimento da sessão (o pacote e o plano já o decidem): o formulário o
   * diz, e com ele oferece a sala (A24 da 6ª simulação — não dizia nem um nem
   * outro). Sem ele (a unidade pré-paga), só o horário.
   */
  procedimento?:   { id: string; nome: string; duracaoMin: number } | null
  onSave:          (params: { branchId: string; professionalId: string; scheduledAt: string; roomId: string | null }) => Promise<{ error?: string }>
  onCancel:        () => void
}) {
  const [branchId,     setBranchId]     = useState(currentBranchId)
  const [profs,        setProfs]        = useState<{ id: string; name: string }[]>([])
  // Nasce carregando quando já há filial; cada troca liga de novo no handler.
  const [loadingProfs, setLoadingProfs] = useState(!!currentBranchId)
  const [profId,       setProfId]       = useState('')
  const [date,         setDate]         = useState('')
  const [slots,        setSlots]        = useState<{ scheduledAt: string; durationMin: number; clientName: string | null }[]>([])
  const [bloqueios,    setBloqueios]    = useState<{ inicio: string; fim: string; motivo: string }[]>([])
  // Os horários da unidade e do profissional: a grade cobre a janela da unidade (D8).
  const [horarios,     setHorarios]     = useState<{ unidade: Horario | null; profissional: Horario | null }>({ unidade: null, profissional: null })
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [time,         setTime]         = useState('')
  // A sala é opcional (H1): só aparece com salas na unidade que servem ao procedimento.
  const [salas,        setSalas]        = useState<SalaParaAgendar[]>([])
  const [roomId,       setRoomId]       = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Os resets acontecem no handler que muda a escolha; os efeitos só buscam.
  function trocarFilial(id: string) {
    setBranchId(id)
    if (!id) return
    setLoadingProfs(true)
    setProfId('')
    setDate('')
    setSlots([])
    setTime('')
  }

  /** Profissional ou data mudou: com os três escolhidos, uma busca nova começa. */
  function trocarProfissionalOuData(novoProf: string, novaData: string) {
    setProfId(novoProf)
    setDate(novaData)
    if (branchId && novoProf && novaData) {
      setLoadingSlots(true)
      setTime('')
    }
  }

  useEffect(() => {
    if (!branchId) return
    getSchedulingBranchProfessionals(branchId).then(res => {
      setProfs(res.professionals)
      setLoadingProfs(false)
    })
  }, [branchId])

  useEffect(() => {
    if (!branchId || !profId || !date) return
    getSchedulingDaySlots(branchId, profId, date).then(res => {
      setSlots(res.slots)
      setBloqueios(res.bloqueios ?? [])
      setHorarios({ unidade: res.horarioDaUnidade ?? null, profissional: res.horarioDoProfissional ?? null })
      setLoadingSlots(false)
    })
  }, [branchId, profId, date])

  // As salas que servem ao procedimento, com a ocupação no horário escolhido.
  const procId = procedimento?.id ?? null
  const procDuracao = procedimento?.duracaoMin ?? 60
  // A32 e A58 da 8ª: a sala aparece desde o início (antes só depois do horário,
  // e o "Agendar a 1ª sessão" da venda do pacote parecia não pedir a sala);
  // com o horário escolhido, ela diz qual está ocupada.
  useEffect(() => {
    if (!procId || !branchId) return
    let vivo = true
    salasParaAgendar(branchId, procId, date && time ? new Date(`${date}T${time}:00-03:00`).toISOString() : null, procDuracao)
      .then(r => {
        if (!vivo) return
        setSalas(r.salas)
        setRoomId(atual => (atual && r.salas.some(x => x.id === atual && x.livre)) ? atual : (r.sugerida ?? ''))
      })
      .catch(() => { if (vivo) setSalas([]) })
    return () => { vivo = false }
  }, [procId, procDuracao, branchId, date, time])

  // D5 da 8ª simulação: o intervalo INTEIRO da sessão contra os agendamentos
  // dela e os bloqueios (a régua de lib/agenda/horario-livre). Só o início
  // caindo dentro de um ocupado oferecia 10:00 livre para 60 min com outro às
  // 10:30 — e o Confirmar recusava. Sem o procedimento (a unidade pré-paga, que
  // o servidor decide), o passo da grade.
  function isBooked(t: string) {
    return ocupanteDoHorario(new Date(`${date}T${t}:00-03:00`), procedimento?.duracaoMin ?? 30, slots, bloqueios)
  }

  async function handleSave() {
    if (!branchId || !profId || !date || !time) return
    setSaving(true)
    setError(null)
    const result = await onSave({
      branchId,
      professionalId: profId,
      scheduledAt: new Date(`${date}T${time}:00-03:00`).toISOString(),
      roomId: roomId || null,
    })
    setSaving(false)
    if (result.error) setError(result.error)
  }

  const minDate = format(new Date(), 'yyyy-MM-dd')

  return (
    <div data-agendar-sessao style={{ background: 'var(--bg-app)', borderRadius: 'var(--radius-field-token)', padding: '16px', marginTop: 10, border: '1px solid var(--border)' }}>

      {procedimento && (
        <p data-procedimento-da-sessao style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginBottom: 12 }}>
          Procedimento: <strong style={{ color: 'var(--text)' }}>{procedimento.nome}</strong>
        </p>
      )}

      {branches.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 8 }}>UNIDADE</p>
          <select
            className="filtro-select"
            aria-label="Unidade da sessão"
            value={branchId ?? ''}
            onChange={e => trocarFilial(e.target.value)}
          >
            {/* Sem unidade escolhida (a ficha da rede — D1 da 8ª), nenhuma vem marcada. */}
            {!branchId && <option value="">Selecione a unidade…</option>}
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      <div className="form-2col" style={{ marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6 }}>PROFISSIONAL</p>
          {loadingProfs ? (
            <Loader2 size={14} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
          ) : (
            <select aria-label="Profissional" value={profId} onChange={e => trocarProfissionalOuData(e.target.value, date)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 'var(--text-base-sz)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}>
              <option value="">Selecionar…</option>
              {profs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6 }}>DATA</p>
          <input type="date" aria-label="Data" min={minDate} value={date} onChange={e => trocarProfissionalOuData(profId, e.target.value)}
            disabled={!profId}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 'var(--text-base-sz)', background: 'var(--surface)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' as const }} />
        </div>
      </div>

      {/* A22 da 12ª (princípio 3): os horários só vêm depois da profissional e da data — a tela diz. */}
      {!(profId && date) && (
        <p data-dica-dos-horarios style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginBottom: 12 }}>
          {profId ? 'Escolha a data para ver os horários livres.' : 'Escolha a profissional e a data para ver os horários livres.'}
        </p>
      )}
      {profId && date && (
        <div style={{ marginBottom: 12 }}>
          <GradeDeHorarios
            data={date}
            horarioDaUnidade={horarios.unidade}
            horarioDoProfissional={horarios.profissional}
            nomeDoProfissional={profs.find(p => p.id === profId)?.name}
            ocupado={isBooked}
            selecionado={time}
            onEscolher={setTime}
            carregando={loadingSlots}
          />
        </div>
      )}

      {procedimento && salas.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6 }}>SALA (OPCIONAL)</p>
          <select className="filtro-select" aria-label="Sala" value={roomId} onChange={e => setRoomId(e.target.value)}>
            <option value="">Sem sala</option>
            {salas.map(x => <option key={x.id} value={x.id} disabled={!x.livre}>{x.name}{x.livre ? '' : ' (ocupada)'}</option>)}
          </select>
        </div>
      )}

      {error && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600, marginBottom: 10 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
          Cancelar
        </button>
        <button type="button" onClick={handleSave} disabled={saving || !branchId || !profId || !date || !time}
          className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
          {saving ? <><Loader2 size={13} className="animate-spin" /> Agendando…</> : 'Confirmar agendamento'}
        </button>
      </div>
    </div>
  )
}

// -- Modal principal -----------------------------------------------------------

export function TreatmentSessionsModal({
  clientPackageId, planId, planStatus,
  packageName, totalSessions,
  clientId, procedureId, procedureName, price, durationMin,
  slug, branches, currentBranchId, onClose, onCancelarPlano, emAberto = null,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [sessions,      setSessions]      = useState<Session[]>([])
  const [loading,       setLoading]       = useState(true)
  const [schedulingId,  setSchedulingId]  = useState<string | null>(null)

  const isPlanMode = !!planId && !clientPackageId
  const podeCancelarPlano = isPlanMode && planStatus === 'ACCEPTED' && !!onCancelarPlano

  /** Busca as sessões — sem tocar em estado; quem aplica é quem chamou. */
  const buscarSessoes = useCallback(async (): Promise<Session[] | null> => {
    if (isPlanMode) {
      const res = await getPlannedSessionAppointments(planId!)
      return res.sessions.map(s => ({ ...s, procedureId: s.procedureId, durationMin: s.durationMin }))
    }
    if (clientPackageId) {
      const res = await getClientPackageSessions(clientPackageId)
      // Cada sessão com o SEU procedimento (o pacote é um conjunto deles); a
      // de antes da mudança cai no procedimento do pacote.
      return res.sessions.map(s => ({ ...s, procedureId: s.procedureId ?? undefined, procedureName: s.procedureName ?? procedureName }))
    }
    return null
  }, [isPlanMode, planId, clientPackageId, procedureName])

  // Re-carga disparada pelo realtime e pelas ações da tela.
  const load = useCallback(async () => {
    setLoading(true)
    const lidas = await buscarSessoes()
    if (lidas) setSessions(lidas)
    setLoading(false)
  }, [buscarSessoes])

  // Outro plano/pacote: volta a "carregando" (ajustado durante o render).
  const alvo = `${planId ?? ''}|${clientPackageId ?? ''}`
  const [alvoVisto, setAlvoVisto] = useState(alvo)
  if (alvoVisto !== alvo) {
    setAlvoVisto(alvo)
    setLoading(true)
  }

  // Busca ao abrir: o "carregando" já nasce ligado; a resposta é aplicada no `.then`.
  useEffect(() => {
    let vivo = true
    buscarSessoes().then(lidas => {
      if (!vivo) return
      if (lidas) setSessions(lidas)
      setLoading(false)
    })
    return () => { vivo = false }
  }, [buscarSessoes])

  // Realtime: re-carrega sessões quando agendamentos ou plano mudarem
  useEffect(() => {
    const supabase = createSupabaseClient()
    const channel  = supabase.channel(`tsm-${planId ?? clientPackageId}`)

    if (planId) {
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `treatment_plan_id=eq.${planId}` },
        () => load(),
      )
      // `treatment_plans` não chega pelo Realtime: a sessão não lê planos
      // (têm a anotação clínica do profissional) — é tudo pelo servidor.
    }

    if (clientPackageId) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'package_sessions', filter: `client_package_id=eq.${clientPackageId}` },
        () => load(),
      )
    }

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [planId, clientPackageId, load])

  const completedCount = sessions.filter(s => s.status === 'USED' || s.status === 'COMPLETED').length
  const pct = totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0

  return (
    <JanelaModal onFechar={onClose} rotulo={packageName} largura={560}>

      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 48px)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', marginBottom: 4 }}>TRATAMENTO EM ANDAMENTO</p>
            <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{packageName}</p>
            {!isPlanMode && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 3 }}>{composicaoDasSessoes(sessions) || procedureName}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--hairline)' }}>
                <div style={{ height: '100%', borderRadius: 3, background: 'var(--brand)', width: `${pct}%`, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                {completedCount} / {totalSessions} sessões
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, borderRadius: 6, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px 20px' }}>
          {/* A41 da 11ª: ao agendar a sessão, o que falta pagar do pacote (as sessões seguem liberadas). */}
          {emAberto && <div style={{ marginBottom: 12 }}><AvisoDoPacoteEmAberto valor={emAberto.valor} parcelas={emAberto.parcelas} /></div>}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: 'var(--text-faint)' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 'var(--text-base-sz)' }}>Carregando sessões…</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {sessions.map((sess, i) => {
                const rawStatus = sess.apptStatus ?? sess.status
                const st        = STATUS_LABEL[rawStatus] ?? { label: rawStatus, color: 'var(--text-faint)' }
                const isLast    = i === sessions.length - 1
                const isScheduling = schedulingId === sess.id
                const isDone    = rawStatus === 'USED' || rawStatus === 'COMPLETED'
                const isBooked  = rawStatus === 'SCHEDULED' || rawStatus === 'IN_PROGRESS'
                // A sessão do pacote cancelado (F2b) não se agenda mais.
                const isAvail   = !isDone && !isBooked && sess.status !== 'CANCELLED'

                return (
                  <div key={sess.id} style={{
                    padding: '14px 0',
                    borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Número */}
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: isDone ? 'var(--success-soft)' : isBooked ? 'var(--info-soft)' : 'var(--bg-app)',
                        border: `1.5px solid ${isDone ? 'var(--success)' : isBooked ? 'var(--info)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 'var(--text-sm-sz)', fontWeight: 800,
                        color: isDone ? 'var(--success)' : isBooked ? 'var(--info)' : 'var(--text-faint)',
                      }}>
                        {isDone ? <CheckCircle2 size={14} /> : sess.sessionNumber}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>
                          Sessão {sess.sessionNumber}
                          {sess.procedureName && (
                            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>· {sess.procedureName}</span>
                          )}
                        </p>
                        {sess.scheduledAt ? (
                          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                            <Calendar size={10} style={{ display: 'inline', marginRight: 3 }} />
                            {format(new Date(sess.scheduledAt), "EEE, dd MMM · HH:mm", { locale: ptBR })}
                            {sess.professionalName && ` · ${sess.professionalName}`}
                          </p>
                        ) : isDone && !sess.appointmentId ? (
                          // A57: a sessão do pacote trazido de fora já usada no sistema de antes.
                          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>Usada antes do sistema</p>
                        ) : (
                          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 2 }}>Sem agendamento</p>
                        )}
                      </div>

                      {/* Status + Ações */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: st.color }}>{st.label}</span>

                        {isAvail && !isScheduling && (
                          <button type="button" onClick={() => setSchedulingId(sess.id)}
                            style={{ padding: '5px 10px', borderRadius: 7, fontSize: 'var(--text-2xs)', fontWeight: 700, cursor: 'pointer', background: 'var(--brand-soft)', color: 'var(--brand)', border: 'none' }}>
                            Agendar
                          </button>
                        )}

                        {isBooked && sess.appointmentId && (
                          <button type="button"
                            onClick={() => router.push(rotaAtendimento(pathname, slug, sess.appointmentId!))}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, fontSize: 'var(--text-2xs)', fontWeight: 700, cursor: 'pointer', background: 'var(--brand)', color: 'var(--surface)', border: 'none' }}>
                            <Play size={10} /> Iniciar
                          </button>
                        )}

                        {isDone && sess.appointmentId && (
                          <button type="button"
                            onClick={() => router.push(rotaAtendimento(pathname, slug, sess.appointmentId!))}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, fontSize: 'var(--text-2xs)', fontWeight: 700, cursor: 'pointer', background: 'var(--bg-app)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            Ver <ChevronRight size={10} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Mini-scheduler inline */}
                    {isScheduling && (
                      <SessionScheduler
                        branches={branches}
                        currentBranchId={currentBranchId}
                        procedimento={(sess.procedureId ?? procedureId)
                          ? { id: (sess.procedureId ?? procedureId)!, nome: sess.procedureName ?? procedureName, duracaoMin: sess.durationMin ?? (durationMin || 60) }
                          : null}
                        onCancel={() => setSchedulingId(null)}
                        onSave={async (params) => {
                          const sessProcedureId = sess.procedureId ?? procedureId

                          let result: { error?: string }
                          if (isPlanMode) {
                            result = await schedulePlanSession({
                              planId:    planId!,
                              sessionId: sess.id,
                              clientId,
                              procedureId: sessProcedureId,
                              price,
                              durationMin,
                              slug,
                              ...params,
                            })
                          } else {
                            result = await schedulePackageSession({
                              packageSessionId: sess.id,
                              clientId,
                              procedureId: sessProcedureId,
                              price,
                              durationMin,
                              slug,
                              ...params,
                            })
                          }
                          if (!result.error) {
                            setSchedulingId(null)
                            load()
                          }
                          return result
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer — cancelar o plano (D4 da 9ª): a janela do cancelamento, a mesma do pacote. */}
        {podeCancelarPlano && (
          <div style={{ borderTop: '1px solid var(--hairline)', padding: '14px 24px' }}>
            <button type="button" className="btn-ghost" onClick={() => { onClose(); onCancelarPlano!() }}>
              Cancelar plano
            </button>
          </div>
        )}
      </div>
    </JanelaModal>
  )
}
