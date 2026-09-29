'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Check, ChevronRight, User, FileText, CreditCard, CalendarCheck, Stethoscope, Clock, FileSignature, ScrollText } from 'lucide-react'
import { checkoutTreatmentPlan, cancelCheckout } from '@/actions/treatment-plans'
import { prepararDocumentosDoCheckout, documentoParaAssinar } from '@/actions/documentos'
import { TelaDeAssinatura, type DocumentoNaTela } from '@/components/shared/tela-de-assinatura'
import type { ResumoDeDocumento } from '@/lib/documentos/leitura'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import type { SessionScheduleInput, PlanSessionForCheckout } from '@/actions/treatment-plans'
import { getSchedulingBranchProfessionals, getSchedulingDaySlots } from '@/actions/appointments'
import { rotaCliente } from '@/lib/rotas'
import { format } from 'date-fns'
import { SegSelect } from '@/components/shared/seg-select'

// -- Types ---------------------------------------------------------------------

export interface CheckoutPlan {
  id:                string
  status:            string
  professionalNotes: string | null
  clientName:        string
  clientDocument:    string | null
  clientPhone:       string | null
  clientId:          string
  branchName:        string
  medicalRecordId:   string | null
  sessions:         PlanSessionForCheckout[]
  total:            number
  professionals:    { id: string; name: string }[]
  branches:         { id: string; name: string }[]
  currentBranchId:  string
}

interface DaySlot {
  scheduledAt: string
  durationMin: number
  clientName:  string | null
}

// Slots de 30min das 08:00 às 20:00 (hora local)
const TIME_SLOTS: string[] = Array.from({ length: 25 }, (_, i) => {
  const h = String(8 + Math.floor(i / 2)).padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

interface Props {
  plan: CheckoutPlan
  slug: string
  /**
   * Quem recebe mas não gerencia agenda fecha a venda sem marcar horário — o
   * passo de agendamento some e as sessões ficam para marcar depois. A action
   * confere o mesmo, então esconder aqui não é a única defesa.
   */
  podeAgendar?: boolean
  /**
   * Pode cobrar agora (caixa ou financeiro). Sem isso, a única forma oferecida é
   * "receber no atendimento": a profissional aceita o plano e o dinheiro fica
   * para o balcão. A action confere o mesmo.
   */
  podeCobrar?: boolean
  /** Fechou tudo: usado quando o wizard roda dentro da tela do atendimento. */
  onDone?: (clientId: string) => void
}

// -- Helpers -------------------------------------------------------------------

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PAYMENT_METHODS = [
  { value: 'PIX',           label: 'Pix' },
  { value: 'CASH',          label: 'Dinheiro' },
  { value: 'DEBIT_CARD',    label: 'Débito' },
  { value: 'CREDIT_CARD',   label: 'Crédito' },
  { value: 'INTERNAL_CREDIT', label: 'Crédito interno' },
]

// Pagamento ANTES da documentação: o contrato de plano cita a forma de
// pagamento, e ele só pode ser montado depois de ela estar escolhida.
const STEPS = [
  { label: 'Plano',         icon: Stethoscope  },
  { label: 'Pagamento',     icon: CreditCard    },
  { label: 'Documentação',  icon: FileText      },
  { label: 'Agendamento',   icon: CalendarCheck },
]

// -- Componente principal ------------------------------------------------------

export function CheckoutWizard({ plan, slug, podeAgendar = true, podeCobrar = true, onDone }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const total  = plan.total

  const [step, setStep] = useState(0)

  // Documentação — os termos dos procedimentos e o contrato de plano
  // (§9.4.1), montados com o pagamento escolhido no passo anterior. O que
  // BLOQUEIA sem assinatura trava o passo; o servidor confere o mesmo.
  const [docs,       setDocs]       = useState<ResumoDeDocumento[] | null>(null)
  const [assinando,  setAssinando]  = useState<DocumentoNaTela | null>(null)
  const [preparando, startPreparar] = useTransition()
  const [abrindo,    startAbrir]    = useTransition()

  const aberto = (d: ResumoDeDocumento) => d.status === 'A_GERAR' || d.status === 'PENDENTE' || d.status === 'INCOMPLETO'
  const documentosQueTravam = (docs ?? []).filter(d => aberto(d) && d.exigencia === 'BLOQUEIA')

  // Pagamento — plano de milhares de reais raramente é à vista, então a forma
  // vem antes do método: nada agora, à vista, entrada + parcelas, ou a receber.
  //
  // O padrão é NADA_AGORA: aceitar o plano e pagar por ele são gestos
  // diferentes. Quem aceita é o cliente, na sala; quem recebe é o balcão, na
  // chegada da primeira sessão. Cobrar aqui obrigava a profissional a operar
  // caixa — ou o plano a ficar parado numa fila esperando a recepção.
  const [paymentMethod, setPaymentMethod] = useState('PIX')
  const [formaPgto,     setFormaPgto]     = useState<'NADA_AGORA' | 'AVISTA' | 'PARCELADO' | 'A_RECEBER'>('NADA_AGORA')
  const [entrada,       setEntrada]       = useState('')
  const [parcelas,      setParcelas]      = useState(3)
  const [primeiroVenc,  setPrimeiroVenc]  = useState(() =>
    format(new Date(Date.now() + 30 * 864e5), 'yyyy-MM-dd'),
  )

  const entradaNum = Math.max(0, Math.min(Number(entrada.replace(',', '.')) || 0, total))
  const saldo      = Math.round((total - entradaNum) * 100) / 100
  const valorParcela = parcelas > 0 ? saldo / parcelas : 0

  // Agendamento — compartilhado por todas as sessões
  const [schedBranchId, setSchedBranchId] = useState(plan.currentBranchId)
  const [schedProfs,    setSchedProfs]    = useState<{ id: string; name: string }[]>([])
  // Nasce carregando quando já há filial; cada troca liga de novo no handler.
  const [loadingProfs,  setLoadingProfs]  = useState(!!plan.currentBranchId)
  const [schedProfId,   setSchedProfId]   = useState('')

  // Por sessão: key = planSessionId → { date, time }
  const [sessionDates,  setSessionDates]  = useState<Record<string, { date: string; time: string }>>({})
  const [activeSession, setActiveSession] = useState(plan.sessions[0]?.id ?? '')

  const activeDate = sessionDates[activeSession]?.date ?? ''
  const activeTime = sessionDates[activeSession]?.time ?? ''

  // Os horários do dia valem para UMA combinação de filial, profissional, data
  // e sessão. Guardados junto com a chave dela: enquanto a resposta da chave
  // atual não chega, a lista é vazia e "carregando" — derivado, sem zerar nada
  // dentro de efeito.
  const chaveDosSlots = schedBranchId && schedProfId && activeDate
    ? `${schedBranchId}|${schedProfId}|${activeDate}|${activeSession}`
    : ''
  const [slotsLidos, setSlotsLidos] = useState<{ chave: string; slots: DaySlot[] }>({ chave: '', slots: [] })
  const daySlots     = chaveDosSlots && slotsLidos.chave === chaveDosSlots ? slotsLidos.slots : []
  const loadingSlots = !!chaveDosSlots && slotsLidos.chave !== chaveDosSlots

  const [submitting,   startSubmit]   = useTransition()
  const [error,        setError]      = useState<string | null>(null)
  const [cancelling,   startCancel]   = useTransition()
  const [showCancel,   setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  // Trocar a filial zera o profissional e liga o "carregando"; o efeito abaixo
  // só busca a equipe dela.
  function trocarFilialDoAgendamento(id: string) {
    setSchedBranchId(id)
    if (!id) return
    setLoadingProfs(true)
    setProfId('')
  }

  // Busca profissionais quando branch muda
  useEffect(() => {
    if (!schedBranchId) return
    getSchedulingBranchProfessionals(schedBranchId).then(res => {
      setSchedProfs(res.professionals)
      setLoadingProfs(false)
    })
  }, [schedBranchId])

  function setProfId(v: string) {
    setSchedProfId(v)
    setSessionDates({})
    setActiveSession(plan.sessions[0]?.id ?? '')
  }

  // Busca slots quando profissional + sessão ativa + data mudam
  useEffect(() => {
    if (!chaveDosSlots || !schedBranchId) return
    getSchedulingDaySlots(schedBranchId, schedProfId, activeDate).then(res => {
      setSlotsLidos({ chave: chaveDosSlots, slots: res.slots })
    })
  }, [chaveDosSlots, schedBranchId, schedProfId, activeDate])

  function setActiveDate(date: string) {
    setSessionDates(prev => ({ ...prev, [activeSession]: { date, time: '' } }))
  }

  function setActiveTime(time: string) {
    setSessionDates(prev => ({
      ...prev,
      [activeSession]: { date: prev[activeSession]?.date ?? '', time },
    }))
  }

  function isSlotBooked(time: string): DaySlot | null {
    if (!activeDate) return null
    const slotMs = new Date(`${activeDate}T${time}:00-03:00`).getTime()
    return daySlots.find(s => {
      const start = new Date(s.scheduledAt).getTime()
      const end   = start + s.durationMin * 60000
      return slotMs >= start && slotMs < end
    }) ?? null
  }

  // -- Documentação: monta os documentos com o pagamento escolhido -----------
  // Voltar ao pagamento e trocá-lo monta de novo — e o contrato já assinado
  // com o pagamento antigo é substituído (o servidor decide, não a tela).
  function irParaDocumentos() {
    setError(null)
    startPreparar(async () => {
      const r = await prepararDocumentosDoCheckout(plan.id, montarPagamento())
      if (r.error) { setError(r.error); return }
      setDocs(r.itens ?? [])
      setStep(2)
    })
  }

  function abrirParaAssinar(id: string) {
    setError(null)
    startAbrir(async () => {
      const r = await documentoParaAssinar(id)
      if (r.error || !r.doc) { setError(r.error ?? 'Não consegui abrir o documento.'); return }
      setAssinando(r.doc)
    })
  }

  // -- Finalizar checkout -------------------------------------------------------
  /** O que a action precisa saber sobre o dinheiro. */
  function montarPagamento(): PagamentoDoPlano | null {
    // `null` = aceito sem cobrar. O valor nasce em aberto e aparece no check-in
    // do primeiro atendimento, com o botão de receber.
    if (formaPgto === 'NADA_AGORA') return null
    if (formaPgto === 'PARCELADO') {
      return {
        forma:              'PARCELADO',
        metodo:             paymentMethod,
        entrada:            entradaNum,
        parcelas,
        primeiroVencimento: new Date(`${primeiroVenc}T12:00:00-03:00`).toISOString(),
      }
    }
    if (formaPgto === 'A_RECEBER') {
      return {
        forma:      'A_RECEBER',
        metodo:     paymentMethod,
        vencimento: new Date(`${primeiroVenc}T12:00:00-03:00`).toISOString(),
      }
    }
    return { forma: 'AVISTA', metodo: paymentMethod }
  }

  function handleFinish() {
    setError(null)
    const schedules: SessionScheduleInput[] = plan.sessions
      .filter(s => {
        const d = sessionDates[s.id]
        return d?.date && d?.time && schedProfId && schedBranchId
      })
      .map(s => {
        const d = sessionDates[s.id]!
        return {
          planSessionId:  s.id,
          scheduledAt:    new Date(`${d.date}T${d.time}:00-03:00`).toISOString(),
          professionalId: schedProfId,
          branchId:       schedBranchId,
        }
      })

    startSubmit(async () => {
      const result = await checkoutTreatmentPlan(plan.id, montarPagamento(), schedules, slug)
      if (result.error) { setError(result.error); return }
      if (onDone) { onDone(plan.clientId); return }
      router.push(rotaCliente(pathname, slug, plan.clientId))
    })
  }

  function handleCancel() {
    startCancel(async () => {
      const result = await cancelCheckout(plan.id, cancelReason, slug)
      if (result.error) { setError(result.error); setShowCancel(false); return }
      router.push(rotaCliente(pathname, slug, plan.clientId))
    })
  }

  const cancelBlock = showCancel ? (
    <div style={{ marginTop: 24, padding: '18px 20px', borderRadius: 'var(--radius-field-token)', border: '1.5px solid var(--danger-border)', background: 'var(--danger-soft)' }}>
      <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>
        Cancelar checkout
      </p>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', marginBottom: 12 }}>
        O plano voltará para rascunho e o profissional poderá revisá-lo antes de reenviar.
      </p>
      <textarea
        value={cancelReason}
        onChange={e => setCancelReason(e.target.value)}
        placeholder="Motivo do cancelamento (opcional)…"
        rows={2}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 'var(--text-base-sz)', resize: 'vertical',
          border: '1px solid var(--danger-border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none',
          boxSizing: 'border-box', marginBottom: 12,
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowCancel(false)}
          style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: 'var(--danger)', fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--surface)', cursor: cancelling ? 'wait' : 'pointer' }}
        >
          {cancelling ? 'Cancelando…' : 'Confirmar cancelamento'}
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setShowCancel(true)}
      style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 10, border: 'none', background: 'none', fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}
    >
      Cancelar checkout
    </button>
  )

  // -- Progress bar -------------------------------------------------------------
  // Sem permissão de agenda o checkout tem três passos, não quatro.
  const passos = podeAgendar ? STEPS : STEPS.slice(0, 3)

  const progressBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {passos.map((s, i) => {
        const done    = i < step
        const current = i === step
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < passos.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background:  done ? 'var(--success-soft)' : current ? 'var(--brand)' : 'var(--bg-app)',
                border:      done ? '1.5px solid var(--success)' : current ? 'none' : '1.5px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {done
                  ? <Check size={16} color="var(--success)" />
                  : <s.icon size={15} color={current ? 'var(--surface)' : 'var(--text-faint)'} />}
              </div>
              <span style={{
                fontSize: 'var(--text-2xs)', fontWeight: current ? 700 : 600,
                color: current ? 'var(--brand)' : done ? 'var(--success)' : 'var(--text-faint)',
                whiteSpace: 'nowrap',
              }}>
                {s.label}
              </span>
            </div>
            {i < passos.length - 1 && (
              <div style={{ flex: 1, height: 1.5, background: done ? 'var(--success)' : 'var(--hairline)', margin: '0 8px', marginBottom: 22 }} />
            )}
          </div>
        )
      })}
    </div>
  )

  // -- Renderização dos passos ---------------------------------------------------

  // PASSO 0: Revisão do plano
  if (step === 0) return (
    <div>
      {progressBar}

      {/* Card do cliente */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', background: 'var(--brand-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <User size={20} style={{ color: 'var(--brand)' }} />
        </div>
        <div>
          <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{plan.clientName}</p>
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
            {plan.clientDocument ? `CPF ${plan.clientDocument}` : 'CPF não informado'}
            {plan.clientPhone ? ` · ${plan.clientPhone}` : ''}
          </p>
        </div>
      </div>

      {/* Sessões do plano */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Plano de tratamento — {plan.sessions.length} sessão(ões)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plan.sessions.map((sess, i) => (
            <div key={sess.id} style={{
              borderRadius: 10, background: 'var(--bg-app)', border: '1px solid var(--hairline)', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid var(--hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-overline)', fontWeight: 800, flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>Sessão {i + 1}</span>
                </div>
                <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--brand)' }}>{fmtBRL(sess.totalPrice)}</span>
              </div>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sess.procedures.map((p, j) => (
                  <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Stethoscope size={11} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                      {p.name}
                    </span>
                    <span>{fmtBRL(p.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {plan.professionalNotes && (
          <p style={{ marginTop: 14, fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', fontStyle: 'italic', paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
            “{plan.professionalNotes}”
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Total: {fmtBRL(total)}</span>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-base-sz)', fontWeight: 600, marginBottom: 12 }}>{error}</p>}

      <button onClick={() => { setError(null); setStep(1) }}
        style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-field-token)', background: 'var(--brand)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-card-title)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-brand-btn)' }}>
        Confirmar plano <ChevronRight size={18} />
      </button>

      {cancelBlock}
    </div>
  )

  // PASSO 1: Pagamento
  if (step === 1) return (
    <div>
      {progressBar}

      {/* Como vai ser pago */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 14 }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Como vai ser pago
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <SegSelect
            options={[
              { key: 'NADA_AGORA', label: 'Receber no atendimento' },
              { key: 'AVISTA',     label: 'À vista' },
              { key: 'PARCELADO',  label: 'Entrada + parcelas' },
              { key: 'A_RECEBER',  label: 'A receber' },
            ].filter(o => podeCobrar || o.key === 'NADA_AGORA')}
            value={formaPgto}
            onSelect={k => setFormaPgto(k as typeof formaPgto)}
            ariaLabel="Como vai ser pago"
          />
        </div>

        {formaPgto === 'PARCELADO' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-2col">
              <div>
                <label style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Entrada (opcional)</label>
                <input
                  inputMode="decimal" value={entrada} onChange={e => setEntrada(e.target.value)}
                  placeholder="0,00" className="field" style={{ marginTop: 5 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Parcelas do saldo</label>
                <select value={parcelas} onChange={e => setParcelas(Number(e.target.value))} className="field" style={{ marginTop: 5 }}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n}x</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Vencimento da 1ª parcela</label>
              <input type="date" value={primeiroVenc} onChange={e => setPrimeiroVenc(e.target.value)} className="field" style={{ marginTop: 5 }} />
            </div>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', fontWeight: 600 }}>
              {entradaNum > 0 && <>Entrada de {fmtBRL(entradaNum)} agora · </>}
              {parcelas}× de {fmtBRL(valorParcela)} a partir de {primeiroVenc.split('-').reverse().join('/')}
            </p>
          </div>
        )}

        {formaPgto === 'A_RECEBER' && (
          <div>
            <label style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Vencimento</label>
            <input type="date" value={primeiroVenc} onChange={e => setPrimeiroVenc(e.target.value)} className="field" style={{ marginTop: 5, maxWidth: 220 }} />
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', marginTop: 8 }}>
              Nada entra no caixa agora — o valor fica como a receber.
            </p>
          </div>
        )}

        {formaPgto === 'NADA_AGORA' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.55, flex: 1, minWidth: 220 }}>
              O plano é aceito por {fmtBRL(total)} e o valor fica em aberto. A recepção
              recebe na chegada da primeira sessão, pela tela do atendimento.
            </p>
            <span style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{fmtBRL(total)}</span>
          </div>
        )}
      </div>

      {formaPgto !== 'NADA_AGORA' && (
      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          {formaPgto === 'AVISTA' ? 'Forma de pagamento' : 'Método'}
        </p>
        <div className="form-2col" style={{ marginBottom: 20 }}>
          {PAYMENT_METHODS.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => setPaymentMethod(m.value)}
              style={{
                padding: '14px', borderRadius: 10, textAlign: 'center', fontWeight: 700, fontSize: 'var(--text-base-sz)',
                border:     paymentMethod === m.value ? '2px solid var(--brand)'   : '1.5px solid var(--border)',
                background: paymentMethod === m.value ? 'var(--brand-soft)'        : 'var(--surface)',
                color:      paymentMethod === m.value ? 'var(--brand)'             : 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderTop: '1px solid var(--hairline)' }}>
          <span style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', fontWeight: 600 }}>
            {formaPgto === 'AVISTA' ? 'Total a cobrar' : formaPgto === 'PARCELADO' ? 'Recebido agora' : 'Total a receber'}
          </span>
          <span style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            {fmtBRL(formaPgto === 'AVISTA' ? total : formaPgto === 'PARCELADO' ? entradaNum : 0)}
          </span>
        </div>
        {formaPgto !== 'AVISTA' && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', textAlign: 'right' }}>
            Plano de {fmtBRL(total)}
          </p>
        )}
      </div>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-base-sz)', fontWeight: 600, marginBottom: 12 }}>{error}</p>}

      <button
        onClick={irParaDocumentos} disabled={preparando}
        style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-field-token)', background: 'var(--brand)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-card-title)', border: 'none', cursor: preparando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-brand-btn)' }}>
        {preparando ? 'Montando os documentos…' : 'Ir para a documentação'} <ChevronRight size={18} />
      </button>

      {cancelBlock}
    </div>
  )

  // PASSO 2: Documentação — os termos dos procedimentos e o contrato de plano,
  // já com o pagamento. Assinar abre a tela de assinatura AQUI dentro: sair da
  // página perderia o que foi escolhido no pagamento.
  if (step === 2) {
    if (assinando) return (
      <div>
        {progressBar}
        <TelaDeAssinatura doc={assinando} podeColher aoTerminar={() => { setAssinando(null); irParaDocumentos() }} />
      </div>
    )
    const podeSeguir = documentosQueTravam.length === 0
    return (
      <div>
        {progressBar}
        <div className="card" style={{ padding: '18px 20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Documentos para assinar
          </p>
          {(docs ?? []).length === 0 && (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              Nenhum documento configurado para este plano. O contrato de plano e os termos dos procedimentos
              se montam em Configurações → Documentos.
            </p>
          )}
          {(docs ?? []).map(d => {
            const Icone = d.tipo === 'CONTRATO_PLANO' ? ScrollText : FileSignature
            return (
              <div key={d.id} data-documento={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--hairline)', background: 'var(--bg-app)' }}>
                <Icone size={16} color="var(--brand)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{d.titulo}</p>
                  {d.status === 'INCOMPLETO' && (
                    <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 600 }}>
                      Falta no cadastro do cliente: {d.faltando.join(', ')}.
                    </p>
                  )}
                </div>
                {d.status === 'ASSINADO'
                  ? <span className="chip chip-success"><Check size={12} /> Assinado</span>
                  : d.status === 'DISPENSADO'
                    ? <span className="chip chip-muted">Dispensado</span>
                    : d.status === 'INCOMPLETO'
                      ? <span className="chip chip-warning">Faltam dados</span>
                      : <button type="button" className="btn-primary" disabled={abrindo || preparando} onClick={() => abrirParaAssinar(d.id)}
                          style={{ padding: '7px 14px', fontSize: 'var(--text-sm-sz)' }}>
                          Colher assinatura
                        </button>}
              </div>
            )
          })}
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-base-sz)', fontWeight: 600, marginBottom: 12 }}>{error}</p>}

        <button
          type="button"
          onClick={() => (podeAgendar ? setStep(3) : handleFinish())}
          // Enquanto a lista se atualiza (voltou de uma assinatura), ela ainda
          // mostra o estado de antes: nada se clica até ela chegar.
          disabled={!podeSeguir || submitting || preparando}
          className="btn-primary"
          style={{ width: '100%', padding: '14px', fontSize: 'var(--text-card-title)', justifyContent: 'center', gap: 8 }}
        >
          {podeSeguir
            ? (podeAgendar ? 'Ir para o agendamento' : formaPgto === 'NADA_AGORA' ? 'Aceitar plano' : 'Confirmar')
            : `Falta assinar: ${documentosQueTravam.map(d => d.titulo).join(', ')}`}
          <ChevronRight size={18} />
        </button>
        <button type="button" className="btn-ghost" onClick={() => setStep(1)} style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}>
          Voltar ao pagamento
        </button>

        {cancelBlock}
      </div>
    )
  }

  // PASSO 3: Agendamento
  const minDate = format(new Date(), 'yyyy-MM-dd')
  const scheduledCount = plan.sessions.filter(s => sessionDates[s.id]?.date && sessionDates[s.id]?.time).length

  return (
    <div>
      {progressBar}

      {/* Filial + Profissional (compartilhados) */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 14 }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Filial e profissional
        </p>

        {/* Filial */}
        {plan.branches.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <select
              className="filtro-select"
              aria-label="Filial do agendamento"
              value={schedBranchId ?? ''}
              onChange={e => trocarFilialDoAgendamento(e.target.value)}
            >
              {plan.branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.id === plan.currentBranchId ? ' (atual)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Profissional */}
        {loadingProfs ? (
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)' }}>Carregando profissionais…</p>
        ) : schedProfs.length === 0 ? (
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>Nenhum profissional nesta filial.</p>
        ) : (
          <select
            className="filtro-select"
            aria-label="Profissional do agendamento"
            value={schedProfId ?? ''}
            onChange={e => setProfId(e.target.value)}
          >
            <option value="">Escolher profissional</option>
            {schedProfs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* Tabs por sessão */}
      {schedProfId && (
        <div className="card" style={{ padding: '18px 20px', marginBottom: 14 }}>
          <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Agendamento por sessão
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {plan.sessions.map((sess, i) => {
              const hasDate  = !!(sessionDates[sess.id]?.date && sessionDates[sess.id]?.time)
              const isActive = activeSession === sess.id
              const label    = plan.sessions.length === 1
                ? 'Sessão única'
                : `Sessão ${i + 1}`
              const subLabel = sess.procedures.map(p => p.name).join(' · ')
              return (
                <button key={sess.id} type="button" onClick={() => setActiveSession(sess.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 700, cursor: 'pointer',
                    border:     isActive ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                    background: isActive ? 'var(--brand-soft)'      : hasDate ? 'var(--success-bg)' : 'var(--surface)',
                    color:      isActive ? 'var(--brand)'           : hasDate ? 'var(--success)' : 'var(--text-muted)',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                  }}>
                  <span>{hasDate ? <Check size={10} style={{ display: 'inline', marginRight: 3 }} /> : null}{label}</span>
                  {subLabel && <span style={{ fontSize: 'var(--text-overline)', fontWeight: 500, opacity: 0.7 }}>{subLabel}</span>}
                </button>
              )
            })}
          </div>

          {/* Data */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Data</label>
            <input
              type="date" min={minDate} value={activeDate}
              onChange={e => setActiveDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 'var(--text-base-sz)', fontFamily: 'inherit', color: 'var(--text)', background: 'var(--bg-app)', boxSizing: 'border-box' as const }}
            />
          </div>

          {/* Grade de horários */}
          {activeDate && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Horários</p>
                {loadingSlots && <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>carregando…</p>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {TIME_SLOTS.map(t => {
                  const booked = isSlotBooked(t)
                  const sel    = activeTime === t
                  return (
                    <button key={t} type="button" disabled={!!booked} onClick={() => setActiveTime(t)}
                      style={{
                        padding: '8px 4px', borderRadius: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 700,
                        cursor:     booked ? 'not-allowed' : 'pointer',
                        background: sel ? 'var(--brand)' : booked ? 'var(--bg-app)' : 'var(--surface)',
                        color:      sel ? 'var(--on-brand)'         : booked ? 'var(--text-faint)' : 'var(--text)',
                        border:     sel ? '2px solid var(--brand)' : booked ? '1px solid var(--hairline)' : '1.5px solid var(--border)',
                        textDecoration: booked ? 'line-through' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                      }}>
                      {sel && <Check size={10} />}{t}
                    </button>
                  )
                })}
              </div>

              {activeTime && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--brand-soft)' }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--brand)' }}>
                    <Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    {activeDate.split('-').reverse().join('/')} às {activeTime} · {schedProfs.find(p => p.id === schedProfId)?.name}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Resumo de sessões agendadas */}
      {scheduledCount > 0 && (
        <div className="card" style={{ padding: '14px 20px', marginBottom: 14 }}>
          <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--success)', letterSpacing: '0.06em' }}>
            <Check size={12} style={{ display: 'inline', marginRight: 4 }} />
            {scheduledCount} de {plan.sessions.length} sessão{plan.sessions.length !== 1 ? 'ões' : ''} com data definida
          </p>
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-base-sz)', fontWeight: 600, marginBottom: 12 }}>{error}</p>}

      <button
        type="button"
        onClick={() => handleFinish()}
        disabled={submitting}
        style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-field-token)', background: 'var(--brand)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-card-title)', border: 'none', cursor: submitting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-brand-btn)' }}>
        {submitting ? 'Finalizando…' : scheduledCount > 0 ? 'Concluir' : 'Concluir sem agendar'}
      </button>

      {cancelBlock}
    </div>
  )
}
