'use client'

import { useActionState, useState, useRef, useMemo, useEffect, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  ArrowLeft, Check, X, Loader2, AlertTriangle,
  Plus, Search, Trash2, Pencil, CheckCircle2, Play,
  XCircle, Clock, Lock, LockOpen, Send, Save, CreditCard, ClipboardList,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatDate, idadeEm, iniciaisDoNome } from '@estetica-os/utils'
import {
  checkinAppointment,
  chegarEIniciar,
  startAppointment,
  finishSession,
  confirmPayment,
  previaDoPagamento,
  cancelAppointmentSession,
  saveDraftNotes,
  reassignProfessional,
} from '@/actions/appointments'
import { generateEvaluationPlan, getCheckoutPlan, receberDoPlano } from '@/actions/treatment-plans'
import { CheckoutWizard } from '@/components/branch/checkout-wizard'
import { PainelPlanejamento } from '@/components/branch/painel-planejamento'
import type { CheckoutPlan } from '@/components/branch/checkout-wizard'
import { AnamneseGeralCartao, AnamneseNaAvaliacao, type AnamneseNaAvaliacaoHandle, type AnamneseGeralCartaoHandle } from '@/components/branch/anamnese-geral'
import { alergiasDaAnamnese, anamneseRespondida, type AnamneseGeral, type FichaDePreAtendimento } from '@/lib/anamnese-geral'
import { AlertaDeAlergia } from '@/components/shared/alerta-de-alergia'
import { AnamnesisFormRenderer, type AnamnesisAnswers, type AnamnesisFormHandle } from '@/components/branch/anamnesis-form-renderer'
import { AttendanceRecordCard } from '@/components/branch/attendance-record-card'
import { FotosDoAtendimento, type FotoDoAtendimento } from '@/components/branch/fotos-do-atendimento'
import { lerRascunho, gravarRascunho, limparRascunho, type RespostaDaFicha } from '@/lib/atendimento/rascunho'
import { salvarFichaDoProcedimento } from '@/actions/anamnesis'
import type { AnamnesisRow } from '@/lib/anamnesis'
import { rotaAgenda } from '@/lib/rotas'
import { abaterDoPacote } from '@/actions/a-receber'
import { TermosDoCliente, type ItemDeTermo } from '@/components/shared/termos-do-cliente'
import { TreatmentPlanEditor } from '@/components/branch/treatment-plan-editor'
import { calcularDescontoComPontos, maximoDePontos } from '@/lib/fidelidade/resgate'
import { formatarPontos } from '@/lib/fidelidade/formato'
import { CampoDoDesconto, contaDoDesconto, descontoDoEstado, estadoDoDesconto } from '@/components/shared/campo-do-desconto'
import type { TreatmentProcedure, TreatmentPackage, ExistingPlan, TreatmentPlanEditorRef } from '@/components/branch/treatment-plan-editor'
import { JanelaModal } from '@/components/shared/janela-modal'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { AvisoDaTaxa } from '@/components/shared/aviso-da-taxa'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'


// -- Types ----------------------------------------------------------------------

export interface SessionAppointment {
  id:                  string
  status:              string
  scheduledAt:         string
  startedAt:           string | null
  completedAt:         string | null
  cancelledAt:         string | null
  cancellationReason:  string | null
  price:               number
  durationMin:         number
  clientNotes:         string | null
  procedureName:       string
  procedureCategory:   string
  professionalId:      string
  professionalName:    string
  roomName:            string | null
  savedNotes:          string | null
  savedIntercurrences: string | null
  complaints:          string | null
  /** A observação INTERNA do agendamento (`appointments.notes`) — não é dor do cliente (A17). */
  internalNotes?:      string | null
  clientConfirmedAt:   string | null
  /** A cliente tem o app (login): só então se espera a confirmação por ele. */
  clientTemApp?:       boolean
  clientRating:        number | null
  procedureRating:     number | null
  clientFeedback:      string | null
}

export interface SessionClient {
  id:        string
  name:      string
  phone:     string | null
  birthDate: string | null
  /** O cadastro: "cliente desde". */
  createdAt: string | null
  tags:      string[]
  notes:     string | null
  document:  string | null
}

export interface SessionProduct {
  productId: string
  name:      string
  unit:      string
  quantity:  number
}

export interface AvailableProduct {
  id:   string
  name: string
  unit: string
}

export interface SessionProfessional {
  id:   string
  name: string
}

export interface HistoryEntry {
  id:            string
  changedByName: string
  action:        string
  description:   string
  createdAt:     string
}

interface Props {
  appointment:        SessionAppointment
  client:             SessionClient
  /** A anamnese geral da cliente: as perguntas da ficha de pré-atendimento (2026-10-20). */
  anamnesis:          AnamneseGeral | null
  /** A ficha de pré-atendimento ATUAL da rede (para responder ou corrigir). */
  fichaPreAtendimento: FichaDePreAtendimento
  /** A ficha do procedimento — uma só desde 2026-09-25. */
  ficha:              { name: string; rows: AnamnesisRow[] } | null
  respostasDaFicha:   Record<string, unknown>
  products:           SessionProduct[]
  availableProducts:  AvailableProduct[]
  professionals:      SessionProfessional[]
  history:            HistoryEntry[]
  branchId:           string
  slug:               string
  canCheckin:         boolean
  canManage:          boolean
  /** Quem vê é a profissional DESTE atendimento: a chegada e o início são um gesto só (A21). */
  ehDaProfissional?:  boolean
  /** Escrever no prontuário exige o módulo, não só ser o responsável. */
  canEditRecords:     boolean
  /** Ver a evolução (prontuário). Sem o módulo, a tela nem recebe as anotações. */
  canViewRecords?:    boolean
  /** As fotos clínicas deste atendimento (A30). Nulo = quem vê não tem o prontuário. */
  fotosDoAtendimento?: FotoDoAtendimento[] | null
  canReassign:        boolean
  canPayment:         boolean
  isProfessional:     boolean
  paymentTransaction: { id: string; paymentMethod: string; amount: number; cartaoVezes?: number | null } | null
  /** O último recebimento ESTORNADO, quando não há outro vivo: a cobrança reabriu (D6, 2026-10-28). */
  pagamentoEstornado?: { paymentMethod: string; amount: number; cartaoVezes?: number | null; motivo: string | null } | null
  /** Sessões livres de pacote da cliente, do mesmo procedimento: "Abater do pacote" (D9). */
  pacotesParaAbater?: PacoteParaAbater[]
  treatmentProcedures:   TreatmentProcedure[]
  treatmentPackages:     TreatmentPackage[]
  existingPlan:          ExistingPlan | null
  procedureProductsMap:  Record<string, { productId: string; name: string; unit: string; quantity: number }[]>
  isPartOfPlan?:         boolean
  /** O plano da rede inclui planos de tratamento? Sem ele, a sessão é a simples. */
  podeMontarPlano?:      boolean
  /** E o planejador de injetáveis? Sem ele, o campo da ficha fica só para ver. */
  podeInjetaveis?:       boolean
  /** Sessão de pacote: já paga na venda do pacote — não se cobra de novo (2026-09-27). */
  isPackageSession?:     boolean
  /** Procedimento pré-pago: pago na venda, a recepção não cobra de novo. */
  isPrePago?:            boolean
  /**
   * Pode receber (caixa ou financeiro) — quem fecha a venda da avaliação sem
   * mandar o cliente para a recepção. O mesmo critério de "Confirmar pagamento".
   */
  podeReceber?:          boolean
  /** O pagamento combinado no contrato do procedimento (o recebimento já vem com o meio). */
  pagamentoCombinado?:   { metodo: string | null; rotulo: string } | null
  /**
   * Saldo do plano de tratamento ligado a este atendimento. Nulo quando não há
   * plano ou quando não sobrou nada a receber.
   */
  planoEmAberto?:        { planId: string; nome: string | null; emAberto: number; recebido: number; aVencer: number; proximoVencimento: string | null } | null
  /** Termos e contratos deste atendimento. Nulo = cargo sem o módulo `documents`. */
  documentos?:           { itens: ItemDeTermo[]; podeColher: boolean; pelaConversa?: boolean } | null
  /**
   * Abre a janela do pagamento ao chegar (`?receber=1`): é para onde levam o
   * "Receber pagamento" da agenda, o Fechamento do dia e a ficha (D5, 2026-10-27).
   */
  abrirRecebimento?:     boolean
}

// -- Helpers -------------------------------------------------------------------

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function initials(name: string) {
  return iniciaisDoNome(name)
}

function calcAge(birthDate: string | null) {
  return idadeEm(birthDate)
}

function fmtTimer(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function realDurationMin(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null
  return Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000)
}

const STATUS_OVERLINE: Record<string, { label: string; color: string }> = {
  SCHEDULED:   { label: 'Agendado',          color: 'var(--text-muted)' },
  CONFIRMED:   { label: 'Confirmado',         color: 'var(--info)' },
  ARRIVED:     { label: 'Chegou — na espera', color: 'var(--success)' },
  IN_PROGRESS: { label: 'Atendimento em andamento', color: 'var(--brand)' },
  COMPLETED:   { label: 'Concluído',          color: 'var(--success)' },
  CANCELLED:   { label: 'Cancelado',          color: 'var(--warning)' },
  NO_SHOW:     { label: 'Não compareceu',     color: 'var(--text-faint)' },
}

const PAYMENT_METHODS = [
  { value: 'PIX',             label: 'Pix' },
  { value: 'CASH',            label: 'Dinheiro' },
  { value: 'DEBIT_CARD',      label: 'Débito' },
  { value: 'CREDIT_CARD',     label: 'Crédito' },
  { value: 'INTERNAL_CREDIT', label: 'Crédito interno' },
]

// -- Modais --------------------------------------------------------------------

function CancelModal({ appointmentId, slug, onClose }: { appointmentId: string; slug: string; onClose: () => void }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(cancelAppointmentSession, null)
  if (state !== null && !state?.error && !pending) { onClose(); router.refresh(); return null }
  return (
    <JanelaModal onFechar={onClose} rotulo="Cancelar atendimento" largura={460} travado={pending}>
      <div>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Cancelar atendimento</h2>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={15} /></button>
        </div>
        <form action={action} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="appointment_id" value={appointmentId} />
          <input type="hidden" name="slug" value={slug} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Motivo do cancelamento *</label>
            <textarea name="cancellation_reason" required rows={3} placeholder="Descreva o motivo…" className="field" style={{ resize: 'vertical' }} />
          </div>
          {state?.error && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn-secondary"><X size={13} /> Voltar</button>
            <button type="submit" disabled={pending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--warning)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-base-sz)', cursor: 'pointer' }}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
              {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </form>
      </div>
    </JanelaModal>
  )
}

// Modal 1: Profissional confirma conclusão clínica (sem pagamento)
function FinishModal({ appointmentId, slug, initialNotes, initialIntercurrences, insumos, queixas, anamnese = null, ficha = null, onClose }: {
  appointmentId: string; slug: string
  initialNotes: string | null; initialIntercurrences: string | null
  insumos: SessionProduct[]
  /** As dores da tela (D3): `undefined` = a tela não tem o campo, e nada muda. */
  queixas?: string
  /** A anamnese digitada na tela (D3); nula quando ninguém mexeu. */
  anamnese?: Record<string, unknown> | null
  /** As respostas da ficha do procedimento na tela (D1, 2026-10-29); nulas quando ninguém mexeu. */
  ficha?: Record<string, unknown> | null
  onClose: () => void
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(finishSession, null)
  // Concluiu, mas faltou insumo (o saldo ficou negativo): o modal não some
  // calado — mostra o que faltou e a pessoa fecha. Decisão de 2026-09-27:
  // avisar e deixar concluir.
  const avisos = state !== null && !state?.error ? state.avisos ?? [] : []
  if (state !== null && !state?.error && !pending && avisos.length === 0) { onClose(); router.refresh(); return null }
  if (avisos.length > 0 && !pending) {
    return (
      <JanelaModal onFechar={() => { onClose(); router.refresh() }} rotulo="Atendimento concluído — faltou insumo" papel="alertdialog" largura={500} fechaNoFundo={false}>
        <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
            <h2 id="titulo-falta-insumo" style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
              Atendimento concluído — faltou insumo
            </h2>
          </div>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            O estoque da unidade não cobria o que foi usado. O saldo ficou negativo para a falta aparecer no estoque:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {avisos.map(a => (
              <li key={a} style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{a}</li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-primary" onClick={() => { onClose(); router.refresh() }}>Entendi</button>
          </div>
        </div>
      </JanelaModal>
    )
  }
  return (
    <JanelaModal onFechar={onClose} rotulo="Finalizar atendimento" largura={500} travado={pending}>
      <div>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Finalizar atendimento</h2>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', marginTop: 1 }}>O pagamento será confirmado pela recepcionista.</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={15} /></button>
        </div>
        <form action={action} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="hidden" name="appointment_id" value={appointmentId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="products_used" value={JSON.stringify(insumos)} />
          {/* As dores e a anamnese da tela vão NA MESMA conclusão (D3, 2026-10-28). */}
          {queixas !== undefined && <input type="hidden" name="queixas" value={queixas} />}
          {anamnese && <input type="hidden" name="anamnese" value={JSON.stringify(anamnese)} />}
          {/* E a ficha do procedimento, também na mesma conclusão (D1, 2026-10-29). */}
          {ficha && <input type="hidden" name="ficha" value={JSON.stringify(ficha)} />}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
            <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--success)', fontWeight: 600 }}>O procedimento foi realizado com sucesso?</p>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', marginTop: 3 }}>Confirme para liberar o cliente. Adicione observações se necessário.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Observações finais <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(opcional)</span></label>
            <textarea name="notes" rows={3} defaultValue={initialNotes ?? ''} placeholder="Técnicas, áreas tratadas, produtos utilizados…" className="field" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Intercorrências <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(opcional)</span></label>
            <textarea name="intercurrences" rows={2} defaultValue={initialIntercurrences ?? ''} placeholder="Reações ou observações…" className="field" style={{ resize: 'vertical' }} />
          </div>
          {state?.error && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-secondary"><X size={13} /> Voltar</button>
            <button type="submit" disabled={pending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 9, border: 'none', background: 'var(--success)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-base-sz)', cursor: 'pointer', minWidth: 180, justifyContent: 'center' }}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {pending ? 'Finalizando…' : 'Confirmar conclusão'}
            </button>
          </div>
        </form>
      </div>
    </JanelaModal>
  )
}

// Modal 2: Recepcionista/admin confirma pagamento
/** Uma sessão livre de pacote da cliente, do mesmo procedimento do atendimento. */
export interface PacoteParaAbater { sessaoId: string; pacote: string; restantes: number; preco: number }

/**
 * "Abater do pacote" (D9 da simulação de 2026-10-28): a cliente tem pacote
 * com sessão sobrando do MESMO procedimento — o atendimento vira uma sessão
 * dele, sem cobrança nova. Fica no topo da janela do pagamento: é a primeira
 * pergunta (cobrar ou não), antes da forma de pagamento.
 */
function AbaterDoPacote({ appointmentId, pacotes, onFeito }: {
  appointmentId: string; pacotes: PacoteParaAbater[]; onFeito: () => void
}) {
  const [gravando, setGravando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  async function abater(sessaoId: string) {
    setGravando(sessaoId); setErro(null)
    const r = await abaterDoPacote(appointmentId, sessaoId)
    setGravando(null)
    if (r.error) { setErro(r.error); return }
    onFeito()
  }
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pacotes.map(p => (
        <div key={p.sessaoId} data-abater-do-pacote style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)',
          borderRadius: 'var(--radius-row)', padding: '12px 14px',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{p.pacote}</p>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              {p.restantes} {p.restantes === 1 ? 'sessão sobrando' : 'sessões sobrando'} deste procedimento · a sessão vale {brl(p.preco)} no pacote
            </p>
          </div>
          <button type="button" className="btn-primary" disabled={gravando !== null} onClick={() => abater(p.sessaoId)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {gravando === p.sessaoId ? <Loader2 size={13} className="animate-spin" /> : null}
            Abater do pacote
          </button>
        </div>
      ))}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
        Abater usa uma sessão do pacote e não cobra nada. Para cobrar avulso, siga abaixo.
      </p>
    </div>
  )
}

function PaymentModal({ appointmentId, slug, price, pagamentoCombinado, pacotesParaAbater = [], onClose }: {
  appointmentId: string; slug: string; price: number
  /** O pagamento combinado no contrato do procedimento: o meio (e o desconto) já vêm escolhidos. */
  pagamentoCombinado?: { metodo: string | null; rotulo: string; desconto?: number } | null
  /** Sessões de pacote da cliente que podem pagar este atendimento (D9). */
  pacotesParaAbater?: PacoteParaAbater[]
  onClose: () => void
}) {
  const metodoInicial = PAYMENT_METHODS.some(m => m.value === pagamentoCombinado?.metodo) ? pagamentoCombinado!.metodo! : 'PIX'
  // Controlado só para saber se é crédito: aí aparecem as vezes na maquininha.
  const [metodoEscolhido, setMetodoEscolhido] = useState(metodoInicial)
  const [vezes, setVezes] = useState(1)
  // Até quantas vezes a clínica parcela no crédito (D-15).
  const opcoesDeVezes = useOpcoesDeVezes()
  const router = useRouter()
  const [state, action, pending] = useActionState(confirmPayment, null)
  // Pontos de fidelidade: só aparecem com o programa ligado e saldo positivo
  // (`previaDoPagamento` devolve nulo fora disso). A conta mostrada aqui é a
  // mesma que o servidor refaz — o valor que sai do navegador não é usado.
  const [previa, setPrevia] = useState<Awaited<ReturnType<typeof previaDoPagamento>>>(null)
  const [pontos, setPontos] = useState('')
  const [voucherId, setVoucherId] = useState('')
  // Desconto comercial (2026-09-30): o combinado no contrato já vem preenchido.
  const [descontoEstado, setDescontoEstado] = useState(() => estadoDoDesconto(pagamentoCombinado?.desconto))
  useEffect(() => {
    let vivo = true
    previaDoPagamento(appointmentId).then(r => { if (vivo) setPrevia(r) }).catch(() => { /* sem pontos a oferecer */ })
    return () => { vivo = false }
  }, [appointmentId])
  // O voucher desconta primeiro, depois o desconto comercial; os pontos valem
  // sobre o que sobra — a mesma ordem do servidor.
  const voucher = previa?.vouchers.find(v => v.id === voucherId) ?? null
  const aposVoucher = Math.round((price - (voucher?.desconto ?? 0)) * 100) / 100
  const doDesconto  = contaDoDesconto(aposVoucher, descontoEstado)
  const pedidoDeDesconto = doDesconto.recusa ? null : descontoDoEstado(descontoEstado)
  const base    = doDesconto.liquido
  const regras  = previa ? { valorDoPonto: previa.valorDoPonto, minimo: previa.minimo, tetoPct: previa.tetoPct } : null
  const resgate = previa && regras
    ? calcularDescontoComPontos({ saldo: previa.saldo, preco: base, pedido: Number(pontos) || 0, regras })
    : { pontos: 0, desconto: 0, restante: base }
  const maximo  = previa && regras ? maximoDePontos(previa.saldo, base, regras) : 0
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const totalZero = resgate.restante === 0 && !resgate.motivo
  if (state !== null && !state?.error && !pending) { onClose(); router.refresh(); return null }
  return (
    <JanelaModal onFechar={onClose} rotulo="Confirmar pagamento" largura={440} travado={pending}>
      <div>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={16} style={{ color: 'var(--brand)' }} />
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Confirmar pagamento</h2>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={15} /></button>
        </div>
        <form action={action} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="hidden" name="appointment_id" value={appointmentId} />
          <input type="hidden" name="slug" value={slug} />
          {pacotesParaAbater.length > 0 && (
            <AbaterDoPacote appointmentId={appointmentId} pacotes={pacotesParaAbater}
              onFeito={() => { onClose(); router.refresh() }} />
          )}
          {pedidoDeDesconto && <input type="hidden" name="desconto_tipo" value={pedidoDeDesconto.tipo} />}
          {pedidoDeDesconto && <input type="hidden" name="desconto_valor" value={String(pedidoDeDesconto.valor)} />}
          <CampoDoDesconto estado={descontoEstado} aoMudar={e => { setDescontoEstado(e); setPontos('') }} total={aposVoucher} />
          {/* J-47: o porquê do desconto, opcional — fica no lançamento e na linha do tempo. */}
          {pedidoDeDesconto && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
              Motivo do desconto (opcional)
              <input name="desconto_motivo" className="field" maxLength={300} placeholder="Ex.: cliente fiel, retorno, cortesia da casa" />
            </label>
          )}
          {previa && previa.vouchers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="field-label" htmlFor="voucher-do-pagamento">Aplicar voucher</label>
              <select id="voucher-do-pagamento" name="voucher_id" className="filtro-select" value={voucherId}
                onChange={e => { setVoucherId(e.target.value); setPontos('') }}>
                <option value="">Nenhum</option>
                {previa.vouchers.map(v => (
                  <option key={v.id} value={v.id}>{v.name} (−{brl(v.desconto)})</option>
                ))}
              </select>
            </div>
          )}
          {previa && previa.saldo > 0 && base > 0 && (
            <div data-testid="usar-pontos" style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)',
              borderRadius: 'var(--radius-row)', padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span className="field-label" style={{ margin: 0 }}>Usar pontos</span>
                <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  Saldo: <strong style={{ color: 'var(--text)' }}>{formatarPontos(previa.saldo)}</strong>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input name="pontos" type="number" min={0} step={1} inputMode="numeric" className="field"
                  value={pontos} onChange={e => setPontos(e.target.value)} placeholder="0" style={{ flex: 1 }} />
                <button type="button" className="btn-ghost" disabled={maximo <= 0}
                  onClick={() => setPontos(String(maximo))}>
                  Usar o máximo
                </button>
              </div>
              {resgate.motivo ? (
                <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{resgate.motivo}</p>
              ) : resgate.pontos > 0 ? (
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-soft)' }}>
                  {formatarPontos(resgate.pontos)} = <strong style={{ color: 'var(--brand)' }}>−{brl(resgate.desconto)}</strong>
                </p>
              ) : (
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                  Cada ponto vale {brl(previa.valorDoPonto)}.
                  {previa.minimo > 0 && ` Mínimo de ${previa.minimo} pontos.`}
                  {previa.tetoPct < 100 && ` Pontos pagam até ${String(previa.tetoPct).replace('.', ',')}% do valor.`}
                </p>
              )}
            </div>
          )}
          <div className="form-2col">
            {totalZero ? (
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', alignSelf: 'end' }}>
                Nada a receber — sem forma de pagamento.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="field-label">Forma de pagamento *</label>
                <select name="payment_method" className="field" value={metodoEscolhido} onChange={e => setMetodoEscolhido(e.target.value)} aria-label="Forma de pagamento">
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {metodoEscolhido === 'CREDIT_CARD' && (
                  <>
                    <select name="cartao_vezes" className="field" value={vezes} onChange={e => setVezes(Number(e.target.value))} aria-label="Vezes no cartão">
                      {opcoesDeVezes.map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x no cartão`}</option>)}
                    </select>
                    <AvisoDaTaxa vezes={vezes} />
                  </>
                )}
                {pagamentoCombinado && (
                  <p data-testid="pagamento-combinado" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    Combinado no contrato: {pagamentoCombinado.rotulo}.
                  </p>
                )}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="field-label">{resgate.pontos > 0 || voucher || doDesconto.reais > 0 ? 'Total a receber' : 'Valor (R$)'}</label>
              <p data-testid="total-a-receber" style={{
                fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.02em',
                color: resgate.pontos > 0 || voucher || doDesconto.reais > 0 ? 'var(--brand)' : 'var(--text)', padding: '6px 0',
              }}>
                {brl(resgate.motivo ? base : resgate.restante)}
              </p>
            </div>
          </div>
          {state?.error && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-secondary"><X size={13} /> Voltar</button>
            <button type="submit" disabled={pending || !!doDesconto.recusa} className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', fontSize: 'var(--text-base-sz)', minWidth: 170, justifyContent: 'center' }}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {pending ? 'Registrando…' : 'Confirmar pagamento'}
            </button>
          </div>
        </form>
      </div>
    </JanelaModal>
  )
}

// -- Plano em aberto: receber no check-in --------------------------------------

/**
 * O saldo do plano de tratamento, cobrado quando a pessoa chega.
 *
 * Aceitar o plano e pagar por ele são gestos diferentes: a profissional aceita
 * na sala, o dinheiro entra no balcão. Antes o plano ficava numa fila de
 * checkout esperando alguém da recepção resolver uma decisão que já tinha sido
 * tomada — e podia ficar lá semanas, porque um plano nem sempre nasce no dia da
 * avaliação. Agora o saldo aparece aqui, no atendimento marcado.
 */
function PlanoEmAbertoBanner({ plano, appointmentId, slug, podeReceber }: {
  plano:         { planId: string; nome: string | null; emAberto: number; recebido: number; aVencer: number; proximoVencimento: string | null }
  appointmentId: string
  slug:          string
  podeReceber:   boolean
}) {
  const router = useRouter()
  const [aberto,  setAberto]  = useState(false)
  const [forma,   setForma]   = useState<'AVISTA' | 'PARCELADO'>('AVISTA')
  const [metodo,  setMetodo]  = useState('PIX')
  const [entrada, setEntrada] = useState(0)
  const [parcelas, setParcelas] = useState(3)
  const [vezes,   setVezes]   = useState(1)
  const opcoesDeVezes = useOpcoesDeVezes()
  const [venc,    setVenc]    = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [salvando, setSalvando] = useState(false)
  const [erro,     setErro]     = useState<string | null>(null)

  async function receber() {
    setSalvando(true); setErro(null)
    const res = await receberDoPlano(
      plano.planId,
      forma === 'AVISTA'
        ? (metodo === 'CREDIT_CARD' && vezes > 1 ? { forma: 'AVISTA', metodo, vezes } : { forma: 'AVISTA', metodo })
        : { forma: 'PARCELADO', metodo, entrada, parcelas, primeiroVencimento: new Date(`${venc}T12:00:00`).toISOString() },
      appointmentId,
      slug,
    )
    setSalvando(false)
    if (res.error) { setErro(res.error); return }
    setAberto(false)
    router.refresh()
  }

  const restante = Math.max(0, Math.round((plano.emAberto - entrada) * 100) / 100)

  return (
    <>
      <div style={{
        padding: '12px 20px', borderRadius: 'var(--radius-field-token)', background: 'var(--brand-soft)',
        border: '1.5px solid var(--brand-soft-border)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CreditCard size={15} style={{ color: 'var(--brand)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>
            {plano.nome ?? 'Plano de tratamento'} · {plano.emAberto > 0
              ? <>em aberto {fmtBRL(plano.emAberto)}</>
              : <>{fmtBRL(plano.aVencer)} a vencer</>}
          </p>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
            {plano.emAberto > 0
              ? (plano.recebido > 0 || plano.aVencer > 0
                  ? `Já recebido: ${fmtBRL(plano.recebido)}. O que venceu é cobrado no check-in.`
                  : 'O plano foi aceito sem cobrança. O valor é recebido agora, no check-in.')
              : `Parcelas combinadas, recebidas no financeiro${plano.proximoVencimento ? ` — a próxima vence em ${formatDate(plano.proximoVencimento)}` : ''}. Nada a cobrar agora.`}
            {plano.emAberto > 0 && plano.aVencer > 0 && ` Mais ${fmtBRL(plano.aVencer)} a vencer.`}
          </p>
        </div>
        {podeReceber && plano.emAberto > 0 && (
          <button type="button" onClick={() => setAberto(true)} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', fontSize: 'var(--text-base-sz)' }}>
            <CreditCard size={14} /> Receber {fmtBRL(plano.emAberto)}
          </button>
        )}
      </div>

      {aberto && (
        <JanelaModal onFechar={() => setAberto(false)} rotulo="Receber o plano de tratamento" largura={460}>
          <div>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <CreditCard size={16} style={{ color: 'var(--brand)' }} />
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Receber o plano de tratamento</h2>
              <button type="button" onClick={() => setAberto(false)} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={15} /></button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)' }}>Em aberto</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{fmtBRL(plano.emAberto)}</p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {([['AVISTA', 'À vista'], ['PARCELADO', 'Entrada + parcelas']] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setForma(v)}
                    className={forma === v ? 'btn-primary' : 'btn-secondary'}
                    style={{ flex: 1, padding: '9px 12px', fontSize: 'var(--text-sm-sz)', justifyContent: 'center' }}>
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="field-label">Forma de pagamento *</label>
                <select className="field" value={metodo} onChange={e => setMetodo(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              {forma === 'AVISTA' && metodo === 'CREDIT_CARD' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="field-label" htmlFor="vezes-no-cartao">Vezes no cartão</label>
                  <select id="vezes-no-cartao" className="field" value={vezes} onChange={e => setVezes(Number(e.target.value))}>
                    {opcoesDeVezes.map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
                  </select>
                  <AvisoDaTaxa vezes={vezes} />
                </div>
              )}

              {forma === 'PARCELADO' && (
                <>
                  <div className="form-2col">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label className="field-label">Entrada (R$)</label>
                      <input type="number" className="field" min={0} max={plano.emAberto} step="0.01"
                        value={entrada} onChange={e => setEntrada(Math.max(0, Number(e.target.value)))} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label className="field-label">Parcelas</label>
                      <input type="number" className="field" min={1} max={48}
                        value={parcelas} onChange={e => setParcelas(Math.max(1, Number(e.target.value)))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label className="field-label">1º vencimento</label>
                    <input type="date" className="field" value={venc} onChange={e => setVenc(e.target.value)} />
                  </div>
                  <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                    {restante > 0
                      ? `${fmtBRL(restante)} em ${parcelas}x de ${fmtBRL(Math.round((restante / parcelas) * 100) / 100)}.`
                      : 'Sem saldo a parcelar — a entrada cobre o total.'}
                  </p>
                </>
              )}

              {erro && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{erro}</p>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button type="button" onClick={() => setAberto(false)} className="btn-secondary"><X size={13} /> Voltar</button>
                <button type="button" onClick={receber} disabled={salvando} className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', fontSize: 'var(--text-base-sz)', minWidth: 170, justifyContent: 'center' }}>
                  {salvando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {salvando ? 'Registrando…' : 'Confirmar recebimento'}
                </button>
              </div>
            </div>
          </div>
        </JanelaModal>
      )}
    </>
  )
}

// -- Insumos -------------------------------------------------------------------

function InsumoCard({ items, available, checkedIds, onToggle, onChangeQty, onAdd, onRemove, readonly, embedded }: {
  items:       SessionProduct[]
  available:   AvailableProduct[]
  checkedIds:  Set<string>
  onToggle:    (id: string) => void
  onChangeQty: (id: string, qty: number) => void
  onAdd:       (p: AvailableProduct) => void
  onRemove:    (id: string) => void
  readonly:    boolean
  embedded?:   boolean
}) {
  const [adding,  setAdding]  = useState(false)
  const [search,  setSearch]  = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const alreadyIn = useMemo(() => new Set(items.map(i => i.productId)), [items])
  const filtered  = useMemo(() => {
    const q = search.toLowerCase()
    return available.filter(p => !alreadyIn.has(p.id) && p.name.toLowerCase().includes(q))
  }, [available, search, alreadyIn])

  return (
    <div className={embedded ? '' : 'card'} style={embedded ? { position: 'relative' } : { padding: 0, overflow: 'hidden' }}>
      {embedded ? (
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 4 }}>Baixa automática no estoque</p>
      ) : (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Insumos utilizados</h3>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', fontWeight: 500 }}>Baixa automática no estoque</span>
        </div>
      )}

      {adding && !readonly && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--hairline)', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--brand)', borderRadius: 8, padding: '6px 10px', background: 'var(--surface)' }}>
            <Search size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar produto…"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--text-base-sz)', color: 'var(--text)', width: '100%' }} />
            <button type="button" onClick={() => { setAdding(false); setSearch('') }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: 0 }}>
              <X size={13} />
            </button>
          </div>
          {filtered.length > 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% - 2px)', left: 16, right: 16, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-popover)', maxHeight: 200, overflowY: 'auto' }}>
              {filtered.map((p, i) => (
                <button key={p.id} type="button" onMouseDown={() => { onAdd(p); setSearch(''); setAdding(false) }}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: i < filtered.length - 1 ? '1px solid var(--hairline)' : 'none', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-base-sz)', color: 'var(--text)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{p.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: items.length === 0 ? '20px' : '0 0 4px' }}>
        {items.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', textAlign: 'center' }}>Nenhum insumo registrado.</p>
        ) : items.map((item, i) => {
          const checked = checkedIds.has(item.productId)
          return (
            <div key={item.productId} data-insumo={item.productId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: i < items.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
              {/* Checkbox */}
              <div
                onClick={() => !readonly && onToggle(item.productId)}
                style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  border: `2px solid ${checked ? 'var(--brand)' : 'var(--border)'}`,
                  background: checked ? 'var(--brand)' : 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: readonly ? 'default' : 'pointer', transition: 'all 0.15s',
                }}
              >
                {checked && <Check size={11} color="var(--surface)" strokeWidth={3} />}
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: checked ? 'var(--text)' : 'var(--text-faint)', lineHeight: 1.3 }}>{item.name}</p>
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 1 }}>{item.unit}</p>
              </div>
              {/* Qty */}
              {readonly || !checked ? (
                <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: checked ? 'var(--text-muted)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                  {item.quantity} {item.unit}
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="number" step="0.001" min="0" defaultValue={item.quantity}
                    // A dose vale ao digitar (o rascunho a guarda já), não só ao sair do campo (D3).
                    onChange={e => {
                      const v = parseFloat(e.target.value.replace(',', '.'))
                      if (!isNaN(v) && v >= 0) onChangeQty(item.productId, v)
                    }}
                    onBlur={e => {
                      const v = parseFloat(e.target.value.replace(',', '.'))
                      if (!isNaN(v) && v >= 0) onChangeQty(item.productId, v)
                    }}
                    style={{ width: 68, textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 700, border: '1px solid var(--border)', borderRadius: 7, padding: '4px 8px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                    onFocus={e => e.target.select()} />
                  <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', minWidth: 24 }}>{item.unit}</span>
                  <button type="button" onClick={() => onRemove(item.productId)}
                    style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, border: '1px solid var(--border)', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!readonly && (
        <div style={{ padding: '10px 20px', borderTop: items.length > 0 ? '1px solid var(--hairline)' : 'none' }}>
          <button type="button"
            onClick={() => { setAdding(v => !v); setTimeout(() => searchRef.current?.focus(), 50) }}
            style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> Adicionar insumo
          </button>
        </div>
      )}
    </div>
  )
}

// -- Observações ---------------------------------------------------------------

function ObservacoesCard({ notes, intercurrences, onNotesChange, onIntercurrencesChange, readonly }: {
  notes: string; intercurrences: string
  onNotesChange: (v: string) => void; onIntercurrencesChange: (v: string) => void
  readonly: boolean
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Observações do atendimento</h3>
      </div>
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label">O que foi realizado</label>
          <textarea rows={4} value={notes} onChange={e => onNotesChange(e.target.value)} readOnly={readonly}
            placeholder={readonly ? '—' : 'Descreva técnicas, áreas tratadas, produtos utilizados…'}
            className="field" style={{ resize: 'vertical', background: readonly ? 'var(--bg-app)' : undefined }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label">Intercorrências</label>
          <textarea rows={2} value={intercurrences} onChange={e => onIntercurrencesChange(e.target.value)} readOnly={readonly}
            placeholder={readonly ? '—' : 'Reações, intercorrências ou observações…'}
            className="field" style={{ resize: 'vertical', background: readonly ? 'var(--bg-app)' : undefined }} />
        </div>
      </div>
    </div>
  )
}

// -- Dores / Queixas do cliente (controlado pelo pai) --------------------------

function DorasCard({ value, onChange, readonly }: {
  value:    string
  onChange: (v: string) => void
  readonly: boolean
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Dores do cliente</h3>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', marginTop: 2 }}>Queixas e necessidades relatadas pelo cliente</p>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <textarea
          rows={4} value={value} readOnly={readonly}
          onChange={e => onChange(e.target.value)}
          placeholder={readonly ? '—' : 'Anote o que o cliente relatou: queixas estéticas, objetivos, histórico de tratamentos anteriores…'}
          className="field" style={{ resize: 'vertical', background: readonly ? 'var(--bg-app)' : undefined }}
        />
      </div>
    </div>
  )
}

// -- Linha de anamnese ---------------------------------------------------------

// -- Main component ------------------------------------------------------------

export function AppointmentSession({
  appointment, client, anamnesis, fichaPreAtendimento, ficha, respostasDaFicha, products, availableProducts,
  professionals, history, branchId, slug,
  canCheckin, canManage, ehDaProfissional = false, canEditRecords, canViewRecords = true, fotosDoAtendimento = null, canReassign, canPayment, isProfessional, paymentTransaction, pagamentoEstornado = null, pacotesParaAbater = [],
  treatmentProcedures, treatmentPackages, existingPlan, procedureProductsMap,
  isPartOfPlan = false, isPackageSession = false, isPrePago = false, podeReceber = false, planoEmAberto = null, documentos = null, podeMontarPlano = true, podeInjetaveis = true,
  pagamentoCombinado = null, abrirRecebimento = false,
}: Props) {
  const router   = useRouter()
  // Portal de onde se está vendo o atendimento — `slug` é o endereço da
  // FILIAL dele, usado pelas actions; a volta tem de respeitar quem veio de
  // /admin, senão a rede é trocada pela unidade no meio do caminho.
  const pathname = usePathname()

  const [showCancel,    setShowCancel]    = useState(false)
  const [showFinish,    setShowFinish]    = useState(false)
  // O mesmo critério do botão "Confirmar pagamento", logo abaixo.
  const aReceber = appointment.status === 'COMPLETED' && !paymentTransaction && canPayment
    && !isPartOfPlan && !isPackageSession && !isPrePago && appointment.price > 0
  // Atendimento de R$ 0 (a avaliação) não tem o que receber (D9, 2026-10-27).
  const semCobranca = !(appointment.price > 0) && !isPartOfPlan && !isPackageSession && !isPrePago
  const [showPayment,   setShowPayment]   = useState(() => abrirRecebimento && aReceber)
  const [starting,      setStarting]      = useState(false)
  const [erroAoIniciar, setErroAoIniciar] = useState<string | null>(null)
  const [checkingIn,    setCheckingIn]    = useState(false)
  const [insumos,       setInsumos]       = useState<SessionProduct[]>(products)
  const [checkedIds,    setCheckedIds]    = useState<Set<string>>(() => new Set(products.map(p => p.productId)))
  // Os insumos entram no rascunho só depois que alguém mexe neles (D3); a
  // versão remonta o cartão quando o rascunho os devolve (a dose é um campo
  // que só lê o valor ao nascer).
  const [insumosAlterados, setInsumosAlterados] = useState(false)
  const [versaoDosInsumos, setVersaoDosInsumos] = useState(0)
  const [editingProf,   setEditingProf]   = useState(false)
  const [savingProf,    setSavingProf]    = useState(false)
  const [selectedProfId, setSelectedProfId] = useState(appointment.professionalId)
  const [elapsed,        setElapsed]       = useState(0)
  const [isUnlocked,     setIsUnlocked]    = useState(false)

  // Estado do formulário unificado de avaliação
  const [evalComplaints,         setEvalComplaints]         = useState(appointment.complaints ?? '')
  // A anamnese da avaliação: a ficha de pré-atendimento, colhida ao gerar o plano.
  const anamneseDaAvaliacao = useRef<AnamneseNaAvaliacaoHandle>(null)
  // A anamnese dos outros formatos da tela (o cartão da ficha de atendimento).
  const anamneseDoCartao = useRef<AnamneseGeralCartaoHandle>(null)
  // A anamnese DIGITADA na tela (nula enquanto ninguém mexe): vai na conclusão
  // e no rascunho (D3 da simulação de 2026-10-28). A do rascunho remonta o
  // formulário com ela, que só lê o valor inicial ao nascer.
  const [anamneseDigitada,   setAnamneseDigitada]   = useState<Record<string, unknown> | null>(null)
  const [anamneseDoRascunho, setAnamneseDoRascunho] = useState<Record<string, unknown> | null>(null)
  // As respostas da ficha do PROCEDIMENTO na tela (nulas enquanto ninguém
  // mexe): o "Finalizar" as leva na conclusão (D1 da simulação de 2026-10-29).
  const [fichaDigitada, setFichaDigitada] = useState<Record<string, unknown> | null>(null)
  // A ficha também vai ao rascunho (revisão do Heitor, 2026-10-29): a do
  // rascunho remonta o formulário com ela, como a anamnese.
  const [fichaDoRascunho, setFichaDoRascunho] = useState<Record<string, unknown> | null>(null)
  // Salvar a ficha no servidor tira a ficha do rascunho: o "Finalizar" leva a salva.
  const salvarFicha: typeof salvarFichaDoProcedimento = async args => {
    const r = await salvarFichaDoProcedimento(args)
    if (!r.error) setFichaDigitada(null)
    return r
  }
  const [evalPlanNotes,          setEvalPlanNotes]          = useState(existingPlan?.notes ?? '')
  const [evalSessionNotes,       setEvalSessionNotes]       = useState(appointment.savedNotes ?? '')
  const [evalSessionInterc,      setEvalSessionInterc]      = useState(appointment.savedIntercurrences ?? '')
  const [generating,             setGenerating]             = useState(false)
  const [genError,               setGenError]               = useState<string | null>(null)
  const evalEditorRef = useRef<TreatmentPlanEditorRef>(null)

  // Checkout aberto sobre a tela, quando quem atende também recebe.
  const [checkoutPlan, setCheckoutPlan] = useState<CheckoutPlan | null>(null)
  const [planejamentoAberto, setPlanejamentoAberto] = useState(false)

  /** Total do plano — some os preços das sessões, como o checkout faz. */
  const totalDoPlano = (existingPlan?.sessions ?? []).reduce(
    (soma, s) => soma + s.procedures.reduce((t, p) => t + Number(p.price || 0), 0),
    0,
  )

  /**
   * Salva a avaliação inteira e decide o que fazer com o plano.
   *
   * `fecharAgora` abre o checkout aqui mesmo; senão o plano fica `PROPOSED`, que
   * é a fila da recepção. Desistir no meio do checkout não perde nada: o plano
   * já está na fila de qualquer jeito.
   */
  async function gerarPlano(fecharAgora: boolean) {
    setGenError(null)
    // A avaliação CONCLUÍDA também gera o plano (revisão do Heitor, 2026-10-29:
    // "é preciso avaliar primeiro pra depois decidir o que fazer") — só o
    // plano: o registro daquele dia está travado e nada dele vai junto (o
    // servidor também não o regrava). As obrigatórias já passaram no "Finalizar".
    const concluida = appointment.status === 'COMPLETED'
    // A obrigatória sem resposta barra o plano (revisão do Heitor, 2026-10-29).
    const falta = concluida ? null : conferirObrigatorias()
    if (falta) { setGenError(falta); return }
    setGenerating(true)
    const currentSessions = evalEditorRef.current?.getSessions() ?? []
    const currentNotes    = evalEditorRef.current?.getNotes()    ?? evalPlanNotes
    const anamnese = concluida ? null : await anamneseDaAvaliacao.current?.coletar()
    if (anamnese?.error) { setGenerating(false); setGenError(anamnese.error); return }
    // A ficha do procedimento vai NA MESMA gravação do plano (revisão do
    // Heitor, 2026-10-29): era salva antes, numa action à parte, e o plano que
    // falhava a deixava gravada pela metade. Sem mexer nela, a salva fica.
    const res = concluida
      ? await generateEvaluationPlan(appointment.id, '', null, currentSessions, currentNotes, '', '', slug, null)
      : await generateEvaluationPlan(
          appointment.id, evalComplaints, anamnese?.respostas ?? null, currentSessions, currentNotes,
          evalSessionNotes, evalSessionInterc, slug, fichaDigitada,
        )
    if (res.error || !res.planId) {
      setGenerating(false)
      setGenError(res.error ?? 'Não foi possível gerar o plano.')
      return
    }
    // A evolução e a ficha da avaliação foram gravadas junto: o rascunho não serve mais.
    limparRascunho(appointment.id)
    setAnamneseDigitada(null)
    setFichaDigitada(null)
    if (!fecharAgora) {
      setGenerating(false)
      router.refresh()
      return
    }
    const checkout = await getCheckoutPlan(res.planId)
    setGenerating(false)
    if (checkout.error || !checkout.plan) {
      setGenError(checkout.error ?? 'Plano gerado, mas o checkout não abriu. Ele está na fila da recepção.')
      router.refresh()
      return
    }
    setCheckoutPlan(checkout.plan)
  }

  /** Abre o checkout de um plano que já está na fila. */
  async function abrirCheckout(planId: string) {
    setGenError(null)
    const checkout = await getCheckoutPlan(planId)
    if (checkout.error || !checkout.plan) {
      setGenError(checkout.error ?? 'Não foi possível abrir o checkout.')
      return
    }
    setCheckoutPlan(checkout.plan)
  }

  const selectedProfName = professionals.find(p => p.id === selectedProfId)?.name ?? appointment.professionalName

  const status    = appointment.status
  const overline  = STATUS_OVERLINE[status] ?? STATUS_OVERLINE['SCHEDULED']!
  const isActive  = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'].includes(status)
  const isDone    = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)
  const age       = calcAge(client.birthDate)
  // Somente BRANCH_ADMIN e NETWORK_ADMIN podem desbloquear edição pós-conclusão
  const editLocked = isDone && !isUnlocked

  // Observações (controladas) + salvar unificado da ficha
  const [notes,          setNotes]          = useState(appointment.savedNotes ?? '')
  const [intercurrences, setIntercurrences] = useState(appointment.savedIntercurrences ?? '')
  const fichaRef = useRef<AnamnesisFormHandle>(null)

  /**
   * "Tudo que for obrigatório é obrigatório e barra qualquer progressão"
   * (revisão do Heitor, 2026-10-29): antes de abrir o "Finalizar" ou de gerar
   * o plano, a tela aponta a primeira obrigatória vazia — a anamnese, depois a
   * ficha do procedimento (a ordem da página) — e não segue. O servidor
   * confere de novo. Quem não vê o clínico não tem os campos na tela: aí quem
   * decide é o servidor, e a recusa dele aparece na janela.
   */
  function conferirObrigatorias(): string | null {
    if (!canViewRecords) return null
    const anamnese = (anamneseDaAvaliacao.current ?? anamneseDoCartao.current)?.validar()
    if (anamnese?.error) return anamnese.error
    const daFicha = fichaRef.current?.validar()
    return daFicha?.error ?? null
  }

  // O rascunho das anotações (A31, 2026-10-27): recarregar a página perdia o
  // que a profissional escreveu antes de finalizar. Vai para o
  // sessionStorage, por agendamento — morre com a aba, não fica na máquina
  // da recepção — e some ao encerrar ou salvar no servidor.
  const podeRascunhar  = !editLocked && canEditRecords
  const rascunhoPronto = useRef(false)
  useEffect(() => {
    if (!podeRascunhar) return
    const r = lerRascunho(appointment.id)
    /* eslint-disable react-hooks/set-state-in-effect -- o sessionStorage só existe no navegador: ler na renderização desencontraria a hidratação */
    if (r?.notes !== undefined)          setNotes(r.notes)
    if (r?.intercurrences !== undefined) setIntercurrences(r.intercurrences)
    if (r?.evalNotes !== undefined)      setEvalSessionNotes(r.evalNotes)
    if (r?.evalInterc !== undefined)     setEvalSessionInterc(r.evalInterc)
    if (r?.queixas !== undefined)        setEvalComplaints(r.queixas)
    if (r?.anamnese) { setAnamneseDoRascunho(r.anamnese); setAnamneseDigitada(r.anamnese) }
    if (r?.ficha)    { setFichaDoRascunho(r.ficha); setFichaDigitada(r.ficha) }
    if (r?.insumos) {
      setInsumos(r.insumos.map(i => ({ productId: i.productId, name: i.name, unit: i.unit, quantity: i.quantity })))
      setCheckedIds(new Set(r.insumos.filter(i => i.marcado).map(i => i.productId)))
      setInsumosAlterados(true)
      setVersaoDosInsumos(v => v + 1)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    rascunhoPronto.current = true
  }, [appointment.id, podeRascunhar])
  useEffect(() => {
    if (!rascunhoPronto.current || !podeRascunhar) return
    gravarRascunho(appointment.id, {
      notes, intercurrences, evalNotes: evalSessionNotes, evalInterc: evalSessionInterc,
      // As dores, a anamnese e os insumos também (D3): recarregar apagava os três.
      ...(evalComplaints !== (appointment.complaints ?? '') ? { queixas: evalComplaints } : {}),
      ...(anamneseDigitada ? { anamnese: anamneseDigitada as Record<string, string | string[]> } : {}),
      ...(insumosAlterados ? { insumos: insumos.map(i => ({ ...i, marcado: checkedIds.has(i.productId) })) } : {}),
      // E a ficha do procedimento (2026-10-29), com o planejamento escolhido no planejador.
      ...(fichaDigitada ? { ficha: fichaDigitada as Record<string, RespostaDaFicha> } : {}),
    })
  }, [appointment.id, appointment.complaints, podeRascunhar, notes, intercurrences, evalSessionNotes, evalSessionInterc,
      evalComplaints, anamneseDigitada, insumosAlterados, insumos, checkedIds, fichaDigitada])
  useEffect(() => { if (isDone) limparRascunho(appointment.id) }, [isDone, appointment.id])

  const [savingAll,   setSavingAll]   = useState(false)
  const [saveAllError, setSaveAllError] = useState<string | null>(null)
  const [savedAllAt,  setSavedAllAt]  = useState<number | null>(null)

  async function handleSaveAll() {
    setSavingAll(true); setSaveAllError(null)
    const fd = new FormData()
    fd.set('appointment_id', appointment.id)
    fd.set('notes', notes)
    fd.set('intercurrences', intercurrences)
    const results = await Promise.all([
      fichaRef.current?.save() ?? Promise.resolve({ error: undefined }),
      saveDraftNotes(null, fd),
    ])
    setSavingAll(false)
    const err = results.find(r => (r as { error?: string })?.error) as { error?: string } | undefined
    if (err?.error) { setSaveAllError(err.error); return }
    limparRascunho(appointment.id)
    setSavedAllAt(Date.now())
    router.refresh()
  }

  // Qual formulário de evolução está à vista (o mesmo critério do corpo da página).
  const usaFormularioDaAvaliacao = !isPartOfPlan && podeMontarPlano
    && !['PROPOSED', 'ACCEPTED', 'COMPLETED'].includes(existingPlan?.status ?? '')

  const confirmedInsumos = useMemo(
    () => insumos.filter(i => checkedIds.has(i.productId)),
    [insumos, checkedIds],
  )

  // Live timer
  useEffect(() => {
    if (status !== 'IN_PROGRESS' || !appointment.startedAt) return
    const startMs = new Date(appointment.startedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [status, appointment.startedAt])

  async function handleCheckin() {
    setCheckingIn(true)
    await checkinAppointment(appointment.id, slug)
    router.refresh()
    setCheckingIn(false)
  }

  // A profissional no agendamento que ainda não chegou: o mesmo check-in e o
  // mesmo início, num clique (A21, 2026-10-27).
  async function handleChegarEIniciar() {
    setStarting(true)
    setErroAoIniciar(null)
    const r = await chegarEIniciar(appointment.id, slug).catch(() => ({ error: 'Não foi possível marcar a chegada.' }))
    if (r?.error) setErroAoIniciar(r.error)
    router.refresh()
    setStarting(false)
  }

  async function handleStart() {
    setStarting(true)
    setErroAoIniciar(null)
    // A recusa ("Falta assinar: …", ou o check-in que faltou) tem de aparecer:
    // antes o `{ error }` era descartado e o botão só voltava ao normal.
    const r = await startAppointment(appointment.id, slug)
    if (r?.error) setErroAoIniciar(r.error)
    router.refresh()
    setStarting(false)
  }

  // O que BLOQUEIA o início sem assinatura. O banco recusa de qualquer jeito
  // (gatilho); aqui é para o botão já dizer o porquê.
  const documentosQueBloqueiam = (documentos?.itens ?? []).filter(d =>
    d.exigencia === 'BLOQUEIA' && (d.status === 'A_GERAR' || d.status === 'PENDENTE' || d.status === 'INCOMPLETO'))

  // Bloco "Dados do procedimento" (profissional com reassign, horários, sala/valor, duração).
  const procedureNode = (
    <div className="form-2col">
      {!isProfessional && (
        <>
          <div>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Profissional</p>
            {editingProf && canReassign ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select value={selectedProfId} onChange={e => setSelectedProfId(e.target.value)} className="field" style={{ fontSize: 'var(--text-sm-sz)', padding: '4px 8px', height: 30 }} autoFocus>
                  {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button type="button" disabled={savingProf}
                  onClick={async () => { setSavingProf(true); await reassignProfessional(appointment.id, selectedProfId, slug); setSavingProf(false); setEditingProf(false); router.refresh() }}
                  style={{ height: 30, padding: '0 10px', borderRadius: 6, border: 'none', background: 'var(--brand)', color: 'var(--surface)', fontSize: 'var(--text-xs-sz)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {savingProf ? <Loader2 size={11} className="animate-spin" /> : 'Salvar'}
                </button>
                <button type="button" onClick={() => { setEditingProf(false); setSelectedProfId(appointment.professionalId) }}
                  style={{ height: 30, width: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{selectedProfName}</p>
                {canReassign && !isDone && professionals.length > 1 && (
                  <button type="button" onClick={() => setEditingProf(true)}
                    style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Pencil size={10} />
                  </button>
                )}
              </div>
            )}
          </div>
          <div>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Procedimento</p>
            <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{appointment.procedureName}{appointment.procedureCategory ? ` · ${appointment.procedureCategory}` : ''}</p>
          </div>
        </>
      )}

      <div>
        <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Agendado para</p>
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>
          {format(new Date(appointment.scheduledAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>

      <div>
        <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Duração prevista</p>
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock size={12} style={{ color: 'var(--text-faint)' }} /> {appointment.durationMin} min
        </p>
      </div>

      {!isProfessional && (
        <div>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{appointment.roomName ? 'Sala / Cabine' : 'Valor'}</p>
          {appointment.roomName ? (
            <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{appointment.roomName}</p>
          ) : (
            <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{fmtBRL(appointment.price)}</p>
          )}
        </div>
      )}

      {appointment.startedAt && (
        <div>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Início real</p>
          <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{format(new Date(appointment.startedAt), 'HH:mm', { locale: ptBR })}</p>
        </div>
      )}
      {appointment.completedAt && (
        <div>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Término</p>
          <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{format(new Date(appointment.completedAt), 'HH:mm', { locale: ptBR })}</p>
        </div>
      )}
      {(() => {
        const real = realDurationMin(appointment.startedAt, appointment.completedAt)
        if (real === null) return null
        const delta = real - appointment.durationMin
        return (
          <div style={{ gridColumn: 'span 2' }}>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Duração real</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={13} style={{ color: 'var(--brand)' }} /> {real} min
              </p>
              <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-chip-token)',
                background: delta <= 0 ? 'var(--success-soft)' : delta <= 10 ? 'var(--warning-soft)' : 'var(--danger-soft)',
                color:      delta <= 0 ? 'var(--success)' : delta <= 10 ? 'var(--warning)' : 'var(--danger)' }}>
                {delta === 0 ? '= previsto' : delta > 0 ? `▲ ${delta} min vs previsto` : `▼ ${Math.abs(delta)} min vs previsto`}
              </span>
            </div>
          </div>
        )
      })()}
    </div>
  )

  // Documento único: Dados do cliente (+ anamnese geral do cliente), Dados do
  // procedimento (com insumos) e a Ficha do procedimento (construtor).
  //
  // A "anamnese geral" aqui é o questionário de saúde do CLIENTE, preenchido
  // uma vez — outra coisa da ficha por procedimento, que era duplicada em
  // "anamnese" e "atendimento" até 2026-09-25.
  //
  // unified = botão único "Salvar" externo salva a ficha (oculta o interno).
  const renderFichaCard = (insumosNode?: ReactNode, unified = false) => (
    <AttendanceRecordCard
      client={{ name: client.name, document: client.document, birthDate: client.birthDate, phone: client.phone }}
      generalAnamnesis={
        <AnamneseGeralCartao ref={anamneseDoCartao} embedded anamnese={anamnesis} fichaAtual={fichaPreAtendimento} clientId={client.id} canEdit={canEditRecords}
          key={anamneseDoRascunho ? 'rascunho' : 'gravada'} rascunho={anamneseDoRascunho} onMudou={setAnamneseDigitada} />
      }
      procedureNode={procedureNode}
      insumos={insumosNode ?? null}
      ficha={ficha && ficha.rows.length > 0 ? {
        name: ficha.name,
        node: (
          <AnamnesisFormRenderer
            ref={fichaRef}
            appointmentId={appointment.id} slug={slug}
            formName={ficha.name} rows={ficha.rows}
            key={fichaDoRascunho ? 'rascunho' : 'gravada'}
            initial={(fichaDoRascunho ?? respostasDaFicha) as AnamnesisAnswers} canEdit={canEditRecords}
            saveAction={salvarFicha}
            hideSaveButton={unified}
            semInjetaveis={!podeInjetaveis}
            onAnswersChange={setFichaDigitada}
            injetaveis={{ clientId: client.id, branchId }}
          />
        ),
      } : null}
    />
  )

  // A ficha própria do procedimento no formulário da avaliação (D1 da simulação
  // de 2026-10-29): todo atendimento fora de plano, na rede que monta plano,
  // abre neste formulário — e ele nunca mostrou a ficha. A profissional
  // concluía sem ela ser pedida. Cartão próprio: a anamnese e os insumos já
  // têm os deles aqui. O "Finalizar" leva as respostas (fichaDigitada); o
  // "Salvar ficha" e o "Enviar para a recepção" a gravam pela action dela.
  const fichaNaAvaliacao = ficha && ficha.rows.length > 0 ? (
    <section data-ficha-do-procedimento aria-label="Ficha do procedimento" className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Ficha do procedimento</h3>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', marginTop: 2 }}>{ficha.name}</p>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <AnamnesisFormRenderer
          ref={fichaRef}
          appointmentId={appointment.id} slug={slug}
          formName={ficha.name} rows={ficha.rows}
          key={fichaDoRascunho ? 'rascunho' : 'gravada'}
          initial={(fichaDoRascunho ?? respostasDaFicha) as AnamnesisAnswers} canEdit={canEditRecords && !editLocked}
          saveAction={salvarFicha}
          semInjetaveis={!podeInjetaveis}
          onAnswersChange={setFichaDigitada}
          injetaveis={{ clientId: client.id, branchId }}
        />
      </div>
    </section>
  ) : null

  // Mexer nos insumos os põe no rascunho (D3): a dose ajustada sobrevive ao recarregar.
  const insumoProps = {
    items:       insumos,
    available:   availableProducts,
    checkedIds,
    readonly:    isDone,
    onToggle:    (id: string) => {
      setInsumosAlterados(true)
      setCheckedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
    },
    onChangeQty: (id: string, qty: number) => {
      setInsumosAlterados(true)
      setInsumos(prev => prev.map(i => i.productId === id ? { ...i, quantity: qty } : i))
    },
    // O adicionado já entra MARCADO: só o marcado baixa, e adicionar é dizer
    // "usei" — desmarcado, ele sumia da conclusão sem ninguém perceber.
    onAdd:       (p: AvailableProduct) => {
      setInsumosAlterados(true)
      setInsumos(prev => [...prev, { productId: p.id, name: p.name, unit: p.unit, quantity: 1 }])
      setCheckedIds(prev => new Set(prev).add(p.id))
    },
    onRemove:    (id: string) => {
      setInsumosAlterados(true)
      setInsumos(prev => prev.filter(i => i.productId !== id)); setCheckedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    },
  }
  const insumosSection = <InsumoCard key={versaoDosInsumos} embedded {...insumoProps} />

  return (
    <>
      {/* Planejamento do cliente aberto sobre o atendimento.
          O plano é do CLIENTE, não deste atendimento: aqui ele só é aberto —
          e o atendimento fica registrado como a origem de um plano novo. */}
      {planejamentoAberto && (
        <JanelaModal onFechar={() => setPlanejamentoAberto(false)} rotulo="Planejamento de tratamento" largura={760}>
          <div style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {client.name}
                </p>
                <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Planejamento de tratamento</h3>
              </div>
              <button type="button" onClick={() => setPlanejamentoAberto(false)} className="btn-ghost" style={{ padding: '6px 10px' }}>
                Fechar
              </button>
            </div>
            <PainelPlanejamento
              clientId={client.id}
              branchId={branchId}
              slug={slug}
              appointmentId={appointment.id}
              procedures={treatmentProcedures}
              availableProducts={availableProducts}
              podeEditar={canEditRecords}
              // Injetáveis é prontuário: o clínico desta sessão.
              podeVerInjetaveis={canViewRecords}
              podeReceber={podeReceber}
              // Registro bloqueado: a avaliação não monta mais o plano na tela
              // (A30), então o "Novo plano" volta a ser o caminho.
              // A avaliação concluída voltou a montar o plano na tela (2026-10-29).
              planoNaTela={!isPartOfPlan && podeMontarPlano && (status === 'COMPLETED' || !isDone) && !['PROPOSED', 'ACCEPTED', 'COMPLETED'].includes(existingPlan?.status ?? '')}
            />
          </div>
        </JanelaModal>
      )}

      {/* Checkout sobre a tela do atendimento: o mesmo wizard da página, sem
          tirar quem atende de perto do cliente. */}
      {checkoutPlan && (
        <JanelaModal onFechar={() => setCheckoutPlan(null)} rotulo="Checkout" largura={700} fechaNoFundo={false}>
          <div style={{ padding: '22px 24px' }}>
            <div className="esconde-impressao" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Novo paciente
                </p>
                <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Checkout</h3>
              </div>
              <button type="button" onClick={() => setCheckoutPlan(null)} className="btn-ghost" style={{ padding: '6px 10px' }}>
                Fechar
              </button>
            </div>
            <CheckoutWizard
              plan={checkoutPlan}
              slug={slug}
              podeAgendar={canCheckin}
              onDone={() => { setCheckoutPlan(null); router.refresh() }}
            />
          </div>
        </JanelaModal>
      )}

      {showCancel  && <CancelModal appointmentId={appointment.id} slug={slug} onClose={() => setShowCancel(false)} />}
      {showFinish  && (
        <FinishModal
          appointmentId={appointment.id} slug={slug}
          // O que está NA TELA, não o que foi gravado: a evolução escrita na
          // página sem "Salvar" se perdia ao finalizar (simulação de 2026-10-20).
          // A avaliação ainda sem plano tem o formulário dela; os outros, o de sempre.
          initialNotes={usaFormularioDaAvaliacao ? evalSessionNotes : notes}
          initialIntercurrences={usaFormularioDaAvaliacao ? evalSessionInterc : intercurrences}
          insumos={confirmedInsumos}
          // As dores e a anamnese da tela vão na conclusão (D3, 2026-10-28). As
          // dores só existem no formulário da avaliação; a anamnese, onde foi digitada.
          queixas={usaFormularioDaAvaliacao && canViewRecords ? evalComplaints : undefined}
          anamnese={anamneseDigitada}
          ficha={fichaDigitada}
          onClose={() => setShowFinish(false)}
        />
      )}
      {showPayment && (
        <PaymentModal
          appointmentId={appointment.id} slug={slug} price={appointment.price} pagamentoCombinado={pagamentoCombinado}
          pacotesParaAbater={pacotesParaAbater}
          onClose={() => setShowPayment(false)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* -- Top bar --------------------------------------------------- */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <Link href={rotaAgenda(pathname, slug)} style={{ display: 'flex', alignItems: 'center', marginTop: 6, color: 'var(--text-faint)', textDecoration: 'none', flexShrink: 0 }}>
            <ArrowLeft size={18} />
          </Link>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: overline.color, marginBottom: 3 }}>
              {overline.label}
            </p>
            <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {appointment.procedureName}
            </h1>
          </div>

          {/* Ações do topo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginTop: 4 }}>
            {/* Timer IN_PROGRESS */}
            {status === 'IN_PROGRESS' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.01em' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)', display: 'inline-block', animation: 'pulse 1.4s ease-in-out infinite' }} />
                {fmtTimer(elapsed)}
              </div>
            )}

            {/* Check-in (SCHEDULED + canCheckin) */}
            {/* O planejamento é do cliente e abre de qualquer atendimento —
                não só da consulta de avaliação, como era antes. */}
            <button type="button" onClick={() => setPlanejamentoAberto(true)} className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', fontSize: 'var(--text-base-sz)' }}>
              <ClipboardList size={14} /> Planejamento
            </button>

            {/* A profissional deste atendimento: chegada e início num gesto só (A21). */}
            {(status === 'SCHEDULED' || status === 'CONFIRMED') && canCheckin && canManage && ehDaProfissional && (
              <button type="button" onClick={handleChegarEIniciar} disabled={starting || documentosQueBloqueiam.length > 0} className="btn-primary"
                title={documentosQueBloqueiam.length ? `Falta assinar: ${documentosQueBloqueiam.map(d => d.titulo).join(', ')}` : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, fontSize: 'var(--text-base-sz)' }}>
                {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {starting ? 'Iniciando…' : 'Marcar chegada e iniciar'}
              </button>
            )}
            {/* Sem o check-in no cargo, a tela diz quem marca a chegada. */}
            {status === 'SCHEDULED' && !canCheckin && canManage && (
              <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', fontWeight: 600 }}>
                A recepção marca a chegada; depois você inicia.
              </span>
            )}

            {(status === 'SCHEDULED' || status === 'CONFIRMED') && canCheckin && !(canManage && ehDaProfissional) && (
              <button type="button" onClick={handleCheckin} disabled={checkingIn}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--success)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-base-sz)', cursor: 'pointer' }}>
                {checkingIn ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {checkingIn ? 'Registrando…' : 'Check-in'}
              </button>
            )}

            {/* Iniciar (Confirmado ou Chegou + canManage) */}
            {(status === 'ARRIVED' || (status === 'CONFIRMED' && !(canCheckin && ehDaProfissional))) && canManage && (
              <button type="button" onClick={handleStart} disabled={starting || documentosQueBloqueiam.length > 0} className="btn-primary"
                title={documentosQueBloqueiam.length ? `Falta assinar: ${documentosQueBloqueiam.map(d => d.titulo).join(', ')}` : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, fontSize: 'var(--text-base-sz)' }}>
                {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {starting ? 'Iniciando…' : 'Iniciar atendimento'}
              </button>
            )}

            {/* Finalizar (IN_PROGRESS + canManage) — conclui clinicamente. Concluir
                grava a evolução no prontuário: sem o módulo, a tela diz quem conclui. */}
            {status === 'IN_PROGRESS' && canManage && !canEditRecords && (
              <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', fontWeight: 600 }}>
                Quem conclui é o profissional (concluir grava o prontuário).
              </span>
            )}
            {status === 'IN_PROGRESS' && canManage && canEditRecords && (
              <button type="button" onClick={() => { if (!conferirObrigatorias()) setShowFinish(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--brand)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-base-sz)', cursor: 'pointer', boxShadow: 'var(--shadow-brand-btn)' }}>
                <CheckCircle2 size={14} /> Finalizar atendimento
              </button>
            )}

            {/* Confirmar pagamento (COMPLETED sem pagamento + canPayment) — oculto para sessões de plano */}
            {/* Atendimento sem preço não tem o que receber: o botão aparecia
                mesmo em avaliação de R$ 0,00. E quando há plano fechado, o
                rótulo diz de QUE valor se trata — o do plano já foi pago no
                checkout, este é o do atendimento. */}
            {aReceber && (
              <button type="button" onClick={() => setShowPayment(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--brand)', color: 'var(--surface)', fontWeight: 700, fontSize: 'var(--text-base-sz)', cursor: 'pointer', boxShadow: 'var(--shadow-brand-btn)' }}>
                <CheckCircle2 size={14} />
                Confirmar pagamento
              </button>
            )}

            {/* Pagamento confirmado — badge informativo */}
            {status === 'COMPLETED' && paymentTransaction && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
                <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--success)' }}>Pago</span>
              </div>
            )}

            {/* Cancelar (qualquer ativo) */}
            {isActive && (canCheckin || canManage) && (
              <button type="button" onClick={() => setShowCancel(true)}
                className="btn-ghost" style={{ padding: '9px 14px', fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)', gap: 5 }}>
                <XCircle size={14} /> Cancelar
              </button>
            )}
          </div>
        </div>

        {/* A alergia em destaque, acima de tudo (só com o prontuário à vista). */}
        <AlertaDeAlergia alergias={alergiasDaAnamnese(anamnesis)} />

        {erroAoIniciar && (
          <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erroAoIniciar}</p>
        )}

        {/* -- Termos e contratos do atendimento ----------------------------- */}
        {documentos && documentos.itens.length > 0 && (
          <section aria-label="Documentos do atendimento" className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <p className="overline">Termos e contratos</p>
              {documentosQueBloqueiam.length > 0 && status !== 'IN_PROGRESS' && status !== 'COMPLETED' && (
                <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>
                  O atendimento só começa depois da assinatura
                </span>
              )}
            </div>
            <TermosDoCliente itens={documentos.itens} slug={slug} podeColher={documentos.podeColher} pelaConversa={documentos.pelaConversa} compacto />
          </section>
        )}

        {/* -- Client strip ----------------------------------------------- */}
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Avatar */}
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-squircle)', background: 'var(--brand)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-card-title)', fontWeight: 800, flexShrink: 0 }}>
              {initials(client.name)}
            </div>

            {/* Nome + info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                <span style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{client.name}</span>
                {client.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 'var(--text-overline)', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: tag === 'VIP' ? 'var(--brand-soft)' : 'var(--warning-soft)',
                    color: tag === 'VIP' ? 'var(--brand)' : 'var(--warning)',
                    border: `1px solid ${tag === 'VIP' ? 'var(--brand-soft-border)' : 'var(--warning-border)'}`,
                  }}>{tag}</span>
                ))}
              </div>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                {[
                  age ? `${age} anos` : null,
                  typeof anamnesis?.respostas.skinType === 'string' ? `Pele ${anamnesis.respostas.skinType}` : null,
                  // Desde quando é CLIENTE (o cadastro) — mostrava o mês de nascimento.
                  client.createdAt ? `Cliente desde ${format(new Date(client.createdAt), 'MMM yyyy', { locale: ptBR })}` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>

            {/* Right badges */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              {/* Só com resposta: a ficha gravada vazia não é "revisada" (D2, 2026-10-28). */}
              {anamneseRespondida(anamnesis) && (
                <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-chip-token)', background: 'var(--success-soft)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={11} strokeWidth={3} /> Anamnese revisada
                </span>
              )}
              {appointment.clientNotes && (
                <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-chip-token)', background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                  Obs. da cliente
                </span>
              )}
            </div>
          </div>

          {appointment.clientNotes && (
            <>
              <div style={{ height: 1, background: 'var(--hairline)', margin: '12px 0' }} />
              <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Solicitação da cliente</p>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.55 }}>{appointment.clientNotes}</p>
            </>
          )}

          {/* A observação interna do agendamento, à mostra como observação —
              ela aparecia como "Dores do cliente" (A17 da simulação de 2026-10-28). */}
          {appointment.internalNotes && (
            <div data-observacao-do-agendamento>
              <div style={{ height: 1, background: 'var(--hairline)', margin: '12px 0' }} />
              <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Observação do agendamento</p>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{appointment.internalNotes}</p>
            </div>
          )}
        </div>

        {/* -- Plano em aberto: a cobrança acontece na chegada ------------- */}
        {planoEmAberto && (planoEmAberto.emAberto > 0 || planoEmAberto.aVencer > 0) && (
          <PlanoEmAbertoBanner
            plano={planoEmAberto}
            appointmentId={appointment.id}
            slug={slug}
            podeReceber={podeReceber}
          />
        )}

        {/* -- Banner de bloqueio / edição -------------------------------- */}
        {isDone && (
          <div style={{
            padding: '12px 20px', borderRadius: 'var(--radius-field-token)',
            background: isUnlocked ? 'var(--warning-soft)' : 'var(--surface)',
            border: `1.5px solid ${isUnlocked ? 'var(--warning-border)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: isUnlocked ? 'var(--warning-soft)' : 'var(--bg-app)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isUnlocked
                ? <LockOpen size={15} style={{ color: 'var(--warning)' }} />
                : <Lock     size={15} style={{ color: 'var(--text-faint)' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: isUnlocked ? 'var(--warning)' : 'var(--text-muted)' }}>
                {isUnlocked ? 'Editando registro finalizado' : 'Registro bloqueado para edição'}
              </p>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: isUnlocked ? 'var(--warning)' : 'var(--text-faint)', marginTop: 2 }}>
                {isUnlocked
                  ? 'Todas as alterações serão registradas no histórico do atendimento.'
                  : 'Atendimento concluído. Apenas gerentes podem editar este registro.'}
              </p>
            </div>
            {canReassign && (
              isUnlocked ? (
                <button type="button" onClick={() => setIsUnlocked(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--warning-border)', background: 'transparent', color: 'var(--warning)', fontWeight: 700, fontSize: 'var(--text-sm-sz)', cursor: 'pointer' }}>
                  <Lock size={13} /> Bloquear
                </button>
              ) : (
                <button type="button" onClick={() => setIsUnlocked(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 700, fontSize: 'var(--text-sm-sz)', cursor: 'pointer' }}>
                  <LockOpen size={13} /> Editar registro
                </button>
              )
            )}
          </div>
        )}

        {/* -- Concluído / Cancelado banner ------------------------------- */}
        {isDone && (
          <div style={{
            padding: '14px 20px', borderRadius: 'var(--radius-field-token)',
            background: status === 'COMPLETED' ? 'var(--success-bg)' : 'var(--bg-app)',
            border: `1.5px solid ${status === 'COMPLETED' ? 'var(--success-border)' : 'var(--brand-soft-border)'}`,
          }}>
            {status === 'COMPLETED' && appointment.completedAt && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--success)', fontWeight: 600 }}>
                  ✓ Atendimento concluído em {format(new Date(appointment.completedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
                {paymentTransaction ? (
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)' }}>
                    Pagamento confirmado — {rotuloDaForma(paymentTransaction.paymentMethod, paymentTransaction.cartaoVezes)} · {fmtBRL(paymentTransaction.amount)}
                  </p>
                ) : isPartOfPlan ? (
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)' }}>
                    Pagamento realizado no checkout do plano de tratamento.
                  </p>
                ) : isPackageSession ? (
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)' }}>
                    Sessão de pacote — paga na venda do pacote.
                  </p>
                ) : isPrePago ? (
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)' }}>
                    Procedimento pré-pago — pago na venda.
                  </p>
                ) : semCobranca ? (
                  // R$ 0: nada a confirmar (D9). Ficava "aguardando" para sempre.
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)' }}>
                    Sem cobrança — atendimento de R$ 0,00, não há o que receber.
                  </p>
                ) : (
                  <>
                    {pagamentoEstornado && (
                      // O estorno reabre a cobrança (D6, 2026-10-28): diz o que
                      // foi estornado, e o "Confirmar pagamento" volta a valer.
                      <p data-pagamento-estornado style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                        Pagamento estornado — {rotuloDaForma(pagamentoEstornado.paymentMethod, pagamentoEstornado.cartaoVezes)} · {fmtBRL(pagamentoEstornado.amount)}
                        {pagamentoEstornado.motivo ? ` (${pagamentoEstornado.motivo})` : ''}. O atendimento voltou a receber.
                      </p>
                    )}
                    <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>
                      ⏳ Aguardando confirmação de pagamento pela recepcionista
                    </p>
                  </>
                )}

                {/* Confirmação do cliente pelo app (prova que substitui a ficha de papel) */}
                {appointment.clientConfirmedAt ? (
                  <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--success-border)' }}>
                    <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 700 }}>
                      ✓ Confirmado pelo cliente em {format(new Date(appointment.clientConfirmedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    {(appointment.procedureRating != null || appointment.clientRating != null) && (
                      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', marginTop: 2 }}>
                        {appointment.procedureRating != null && <>Procedimento {appointment.procedureRating}/5</>}
                        {appointment.procedureRating != null && appointment.clientRating != null && ' · '}
                        {appointment.clientRating != null && <>Profissional {appointment.clientRating}/5</>}
                      </p>
                    )}
                    {appointment.clientFeedback && (
                      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', marginTop: 2, fontStyle: 'italic' }}>
                        “{appointment.clientFeedback}”
                      </p>
                    )}
                  </div>
                ) : appointment.clientTemApp ? (
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600, marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--success-border)' }}>
                    ⏳ Aguardando confirmação do cliente pelo app
                  </p>
                ) : (
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--success-border)' }}>
                    Cliente sem o app: a confirmação pelo app não se aplica.
                  </p>
                )}
              </div>
            )}
            {status === 'CANCELLED' && (
              <>
                <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--warning)', fontWeight: 700 }}>Atendimento cancelado</p>
                {appointment.cancellationReason && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 4 }}>Motivo: {appointment.cancellationReason}</p>}
              </>
            )}
            {status === 'NO_SHOW' && <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)', fontWeight: 600 }}>Cliente não compareceu.</p>}
          </div>
        )}

        {/* -- Conteúdo do atendimento (coluna única) --------------------- */}
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>


            {/* Montar plano de tratamento durante o atendimento.
                Era o fluxo EXCLUSIVO da avaliação, que deixou de existir como
                entidade em 2026-09-25. A condição que sobrou é a que sempre
                importou de verdade: não se propõe um plano novo dentro de uma
                sessão que já pertence a um plano. */}
            {!isPartOfPlan && podeMontarPlano ? (() => {
              // Plano já gerado e enviado para recepção → modo leitura
              const planGenerated = ['PROPOSED', 'ACCEPTED', 'COMPLETED'].includes(existingPlan?.status ?? '')
              if (planGenerated) return (
                <>
                  {/* Plano já fechado: o que a tela precisa dizer é que a venda
                      saiu, não convidar a fechar de novo. */}
                  {existingPlan?.status === 'ACCEPTED' && (
                    <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}>
                      <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--success)' }}>
                          Plano fechado · {fmtBRL(totalDoPlano)}
                        </p>
                        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', marginTop: 2 }}>
                          O pagamento do plano foi registrado no checkout.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Plano na fila e quem está na tela pode receber: fecha aqui,
                      sem ir até a lista da recepção. */}
                  {podeReceber && existingPlan?.status === 'PROPOSED' && (
                    <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Plano aguardando checkout</p>
                        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                          Está na fila da recepção — você também pode fechar por aqui.
                        </p>
                      </div>
                      <button type="button" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-base-sz)' }}
                        onClick={() => abrirCheckout(existingPlan.id)}>
                        <CreditCard size={14} /> Fechar checkout
                      </button>
                    </div>
                  )}

                  {genError && (
                    <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600, padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 8 }}>
                      {genError}
                    </p>
                  )}

                  {appointment.complaints && (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)' }}>
                        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Dores do cliente</h3>
                      </div>
                      <div style={{ padding: '16px 20px' }}>
                        <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{appointment.complaints}</p>
                      </div>
                    </div>
                  )}
                  {renderFichaCard()}
                  <TreatmentPlanEditor
                    appointmentId={appointment.id} slug={slug}
                    procedures={treatmentProcedures} servicePackages={treatmentPackages}
                    existingPlan={existingPlan} procedureProductsMap={procedureProductsMap}
                    availableProducts={availableProducts}
                  />
                  <ObservacoesCard
                    notes={notes}
                    intercurrences={intercurrences}
                    onNotesChange={setNotes}
                    onIntercurrencesChange={setIntercurrences}
                    readonly={editLocked}
                  />
                </>
              )

              // Plano ainda não gerado → formulário unificado
              return (
                <>
                  {/* As dores são prontuário (D3): sem o módulo, nem aparecem. */}
                  {canViewRecords && <DorasCard
                    value={evalComplaints}
                    onChange={setEvalComplaints}
                    readonly={editLocked}
                  />}

                  {/* Registro bloqueado (concluído): a anamnese se LÊ, não abre
                      em branco com as obrigatórias marcadas (A30). */}
                  {editLocked ? (
                    canViewRecords && <AnamneseGeralCartao anamnese={anamnesis} fichaAtual={fichaPreAtendimento} clientId={client.id} canEdit={false} />
                  ) : (
                    <AnamneseNaAvaliacao ref={anamneseDaAvaliacao} anamnese={anamnesis} fichaAtual={fichaPreAtendimento}
                      key={anamneseDoRascunho ? 'rascunho' : 'gravada'} rascunho={anamneseDoRascunho} onMudou={setAnamneseDigitada} />
                  )}

                  {fichaNaAvaliacao}

                  <TreatmentPlanEditor
                    appointmentId={appointment.id} slug={slug}
                    ref={evalEditorRef}
                    branchId={branchId}
                    procedures={treatmentProcedures} servicePackages={treatmentPackages}
                    existingPlan={existingPlan} procedureProductsMap={procedureProductsMap}
                    availableProducts={availableProducts}
                    hideActions={true}
                    onPlanChange={(_items, notes) => setEvalPlanNotes(notes)}
                  />

                  {/* O que foi USADO hoje. O formulário da avaliação não tinha
                      onde lançar: a profissional lançava no editor do plano e o
                      estoque nunca baixava (simulação de 2026-10-20). */}
                  {canEditRecords && <InsumoCard key={versaoDosInsumos} {...insumoProps} />}

                  {/* Observações do atendimento — controladas, sem save individual.
                      São prontuário: só para quem o escreve. */}
                  {canEditRecords && <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)' }}>
                      <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Observações do atendimento</h3>
                    </div>
                    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label className="field-label">Anotações clínicas</label>
                        <textarea
                          rows={4} value={evalSessionNotes} readOnly={editLocked}
                          onChange={e => setEvalSessionNotes(e.target.value)}
                          placeholder="Técnicas utilizadas, regiões tratadas, evolução do cliente…"
                          className="field" style={{ resize: 'vertical' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label className="field-label">Intercorrências</label>
                        <textarea
                          rows={2} value={evalSessionInterc} readOnly={editLocked}
                          onChange={e => setEvalSessionInterc(e.target.value)}
                          placeholder="Reações, intercorrências ou observações…"
                          className="field" style={{ resize: 'vertical' }}
                        />
                      </div>
                    </div>
                  </div>}

                  {/* Fim da avaliação.
                      Quem pode receber fecha a venda aqui mesmo, com o cliente
                      na sala — antes o plano saía da tela e ficava esperando a
                      recepção, mesmo quando era a mesma pessoa.
                      Também na avaliação CONCLUÍDA (revisão do Heitor,
                      2026-10-29: "é preciso avaliar primeiro pra depois decidir
                      o que fazer"): o A30 tirou os botões porque gerar o plano
                      regravava o registro fechado — agora o plano nasce sozinho,
                      ligado a ela, e o registro fica como está. */}
                  {canManage && (status === 'COMPLETED' || !isDone) && (
                    <div className="card" style={{ padding: '20px 24px' }}>
                      {status === 'COMPLETED' && (
                        <p data-plano-da-avaliacao-concluida style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginBottom: 12 }}>
                          A avaliação está concluída: o plano nasce ligado a ela, e o registro daquele dia (dores, evolução, ficha e anamnese) fica como está.
                        </p>
                      )}
                      {genError && (
                        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600, marginBottom: 12, padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 8 }}>
                          {genError}
                        </p>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {podeReceber && (
                          <button
                            type="button"
                            disabled={generating}
                            onClick={() => gerarPlano(true)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                              padding: '14px 20px', borderRadius: 'var(--radius-field-token)', fontSize: 'var(--text-base-sz)', fontWeight: 800,
                              background: generating ? 'var(--bg-app)' : 'var(--brand)',
                              color:      generating ? 'var(--text-faint)' : 'var(--on-brand)',
                              border:     generating ? '1px solid var(--border)' : 'none',
                              cursor:     generating ? 'wait' : 'pointer',
                              boxShadow:  generating ? 'none' : '0 2px 12px rgba(195,77,107,0.3)',
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {generating
                              ? <><Loader2 size={16} className="animate-spin" /> Preparando…</>
                              : <><CreditCard size={16} /> Fechar agora</>}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={generating}
                          onClick={() => gerarPlano(false)}
                          className={podeReceber ? 'btn-ghost' : undefined}
                          style={podeReceber ? {
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '12px 20px', fontSize: 'var(--text-base-sz)', fontWeight: 700,
                          } : {
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            padding: '14px 20px', borderRadius: 'var(--radius-field-token)', fontSize: 'var(--text-base-sz)', fontWeight: 800,
                            background: generating ? 'var(--bg-app)' : 'var(--brand)',
                            color:      generating ? 'var(--text-faint)' : 'var(--on-brand)',
                            border:     generating ? '1px solid var(--border)' : 'none',
                            cursor:     generating ? 'wait' : 'pointer',
                            boxShadow:  generating ? 'none' : '0 2px 12px rgba(195,77,107,0.3)',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {generating
                            ? <><Loader2 size={16} className="animate-spin" /> Gerando plano…</>
                            : <><Send size={16} /> Enviar para a recepção</>}
                        </button>
                      </div>

                      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', textAlign: 'center', marginTop: 10 }}>
                        {status === 'COMPLETED'
                          ? (podeReceber
                              ? 'Salva o plano. "Fechar agora" abre o checkout aqui mesmo; enviar deixa o plano na fila da recepção.'
                              : 'Salva o plano e o envia para a recepção realizar o checkout.')
                          : podeReceber
                            ? 'Salva a avaliação e o plano. "Fechar agora" abre o checkout aqui mesmo; enviar deixa o plano na fila da recepção.'
                            : 'Salva todas as informações e envia o plano para a recepção realizar o checkout.'}
                      </p>
                    </div>
                  )}
                </>
              )
            })() : (
              <>
                {renderFichaCard(insumosSection, true)}

                {/* A evolução é prontuário: sem o módulo, nem aparece (vazia e
                    editável, daria a entender que não há evolução). */}
                {canViewRecords && (
                  <ObservacoesCard
                    notes={notes}
                    intercurrences={intercurrences}
                    onNotesChange={setNotes}
                    onIntercurrencesChange={setIntercurrences}
                    readonly={editLocked || !canEditRecords}
                  />
                )}

                {/* Salvar tudo de uma vez */}
                {!editLocked && canEditRecords && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button type="button" onClick={handleSaveAll} disabled={savingAll} className="btn-primary" style={{ gap: 7, fontSize: 'var(--text-base-sz)', padding: '10px 22px' }}>
                      {savingAll ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      {savingAll ? 'Salvando…' : 'Salvar'}
                    </button>
                    {savedAllAt && !savingAll && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-base-sz)', color: 'var(--success)', fontWeight: 700 }}>
                        <CheckCircle2 size={15} /> Tudo salvo
                      </span>
                    )}
                    {saveAllError && <span style={{ fontSize: 'var(--text-base-sz)', color: 'var(--warning)', fontWeight: 600 }}>{saveAllError}</span>}
                  </div>
                )}
              </>
            )}

            {/* As fotos clínicas DESTE atendimento (A30, 2026-10-27): antes só
                entravam pela ficha, sem saber de qual atendimento eram. */}
            {fotosDoAtendimento && (
              <FotosDoAtendimento
                fotos={fotosDoAtendimento}
                clientId={client.id}
                branchId={branchId}
                slug={slug}
                appointmentId={appointment.id}
                podeAnexar={canEditRecords}
              />
            )}

            {/* Histórico */}
            <div className="card" style={{ padding: '18px 20px' }}>
              <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                Histórico
              </p>
              {history.length === 0 ? (
                <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', fontStyle: 'italic' }}>Nenhum registro ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {history.map((entry, idx) => {
                    const dt = new Date(entry.createdAt)
                    return (
                      <div key={entry.id} style={{ display: 'flex', gap: 14, paddingBottom: idx < history.length - 1 ? 14 : 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 18 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 3, background: entry.action === 'COMPLETED' ? 'var(--success)' : 'var(--brand)' }} />
                          {idx < history.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
                        </div>
                        <div style={{ flex: 1, paddingBottom: 2 }}>
                          <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--text)', marginBottom: 1 }}>{entry.description}</p>
                          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                            {entry.changedByName} · {dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
