'use client'

import React, { useActionState, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Mail, Calendar, MoreHorizontal, Star, Stethoscope, Plus, X, Loader2, Clock, CheckCircle2, Receipt, Check, UserPlus, Smartphone, CalendarPlus, XCircle, AlertCircle, CreditCard, ClipboardList, ClipboardCheck, Package, FileCheck } from 'lucide-react'
import { grantInternalCredit, updateClientContactData, lookupClientByCpf } from '@/actions/clients'
import { TreatmentSessionsModal } from './treatment-sessions-modal'
import { TreatmentFileModal } from './treatment-file-modal'
import { ClientDocumentsTab } from './client-documents-tab'
import type { ClientDocumentItem } from './client-documents-tab'
import { AnamnesisFormRenderer, type AnamnesisAnswers } from './anamnesis-form-renderer'
import { AttendanceRecordCard } from './attendance-record-card'
import { AnamnesisTab, type GeneralAnamnesis } from './anamnesis-tab'
import type { AnamnesisRow } from '@/lib/anamnesis'
import { format, isSameDay, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// -- Types --------------------------------------------------------------------

export interface ProfileClient {
  id:                 string
  name:               string
  phone:              string
  email:              string | null
  document:           string | null
  birthDate:          string | null
  tags:               string[]
  notes:              string | null
  isActive:           boolean
  createdAt:          string
  zipCode:            string | null
  address:            string | null
  addressNumber:      string | null
  addressComplement:  string | null
  neighborhood:       string | null
  city:               string | null
  state:              string | null
}

export interface ProfileStats {
  totalSessions:  number
  totalInvested:  number
  ticketMedio:    number
  age:            number | null
}

export interface ProfileAppointment {
  id:              string
  scheduledAt:     string
  price:           number
  status:          string
  procedureName:   string
  professionalName: string
}

export interface ProfilePackage {
  id:            string
  name:          string
  totalSessions: number
  usedSessions:  number
  procedureId:   string
  procedureName: string
  price:         number
  durationMin:   number
  planId?:       string   // set for avulso multi-session plans (no client_package)
  planStatus?:   string
}

export interface ProfileInstallment {
  id:     string
  number: number
  total:  number
  amount: number
  dueDate: string
  isPaid: boolean
  paidAt: string | null
}

export interface ProfileTransaction {
  id:            string
  description:   string
  amount:        number
  paymentMethod: string | null
  isPaid:        boolean
  paidAt:        string | null
  createdAt:     string
  procedureName: string | null
  scheduledAt:   string | null
  installments:  ProfileInstallment[]
  isCheckout?:   boolean
}

export interface ProfileInternalCredit {
  id:          string
  amount:      number
  description: string
  createdAt:   string
}

export interface ClientHistoryEvent {
  id:       string
  date:     string
  type:
    | 'CLIENT_CREATED'
    | 'APP_ACCOUNT'
    | 'APPOINTMENT_SCHEDULED'
    | 'APPOINTMENT_COMPLETED'
    | 'APPOINTMENT_CANCELLED'
    | 'APPOINTMENT_NO_SHOW'
    | 'PAYMENT'
    | 'PLAN_PROPOSED'
    | 'PLAN_ACCEPTED'
    | 'PLAN_CANCELLED'
    | 'PACKAGE_PURCHASED'
    | 'CONSENT_SIGNED'
  title:    string
  subtitle: string | null
  amount:   number | null
  link:     string | null
}

export interface ProfileFormSnapshot {
  name:    string
  rows:    AnamnesisRow[]
  answers: Record<string, unknown>
}

export interface ProfileRecordEntry {
  appointmentId: string
  createdAt:     string
  procedureName: string | null
  anamnesis:     ProfileFormSnapshot | null
  attendance:    ProfileFormSnapshot | null
}

interface Props {
  client:                ProfileClient
  branchId:              string
  stats:                 ProfileStats
  upcomingAppointments:  ProfileAppointment[]
  recentAppointments:    ProfileAppointment[]
  allAppointments:       ProfileAppointment[]
  loyaltyBalance:        number
  activePackage:         ProfilePackage | null
  sessionNotes:          string
  transactions:          ProfileTransaction[]
  internalCredits:       ProfileInternalCredit[]
  documents:             ClientDocumentItem[]
  recordForms?:          ProfileRecordEntry[]
  generalAnamnesis?:     GeneralAnamnesis | null
  canGrantCredit:        boolean
  branches:              { id: string; name: string }[]
  currentBranchId:       string
  slug:                  string
  role:                  string
  clientHistory:         ClientHistoryEvent[]
}

// -- Helpers ------------------------------------------------------------------

function getInitials(name: string) {
  const p = name.trim().split(' ')
  return ((p[0]?.[0] ?? '') + (p[p.length - 1]?.[0] ?? p[0]?.[1] ?? '')).toUpperCase()
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function maskCPF(doc: string) {
  return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

// -- Sub-components -----------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  COMPLETED:   'Concluído',
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  CANCELLED:   'Cancelado',
  NO_SHOW:     'Não compareceu',
}

type TabKey = 'visao' | 'historico' | 'fichas' | 'financeiro' | 'documentos' | 'dados'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'visao',      label: 'Visão geral' },
  { key: 'historico',  label: 'Histórico' },
  { key: 'fichas',     label: 'Fichas' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'dados',      label: 'Dados' },
]

// -- Payment method labels -----------------------------------------------------

const PAYMENT_LABEL: Record<string, string> = {
  CASH:            'Dinheiro',
  PIX:             'Pix',
  DEBIT_CARD:      'Débito',
  CREDIT_CARD:     'Crédito',
  INTERNAL_CREDIT: 'Crédito interno',
}

type HistoryCfg = {
  dotColor: string
  bgColor:  string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon:     React.FC<any>
}
const HISTORY_CONFIG: Record<ClientHistoryEvent['type'], HistoryCfg> = {
  CLIENT_CREATED:        { dotColor: '#c34d6b', bgColor: '#fce7ec', Icon: UserPlus },
  APP_ACCOUNT:           { dotColor: '#3b6cbf', bgColor: '#e7f0fc', Icon: Smartphone },
  APPOINTMENT_SCHEDULED: { dotColor: '#3b6cbf', bgColor: '#e7f0fc', Icon: CalendarPlus },
  APPOINTMENT_COMPLETED: { dotColor: '#2e7d32', bgColor: '#e7fce7', Icon: CheckCircle2 },
  APPOINTMENT_CANCELLED: { dotColor: '#9e9e9e', bgColor: '#f5f5f5', Icon: XCircle },
  APPOINTMENT_NO_SHOW:   { dotColor: '#ed6c02', bgColor: '#fff3e0', Icon: AlertCircle },
  PAYMENT:               { dotColor: '#2e7d32', bgColor: '#e7fce7', Icon: CreditCard },
  PLAN_PROPOSED:         { dotColor: '#6a3baa', bgColor: '#f0e7fc', Icon: ClipboardList },
  PLAN_ACCEPTED:         { dotColor: '#c34d6b', bgColor: '#fce7ec', Icon: ClipboardCheck },
  PLAN_CANCELLED:        { dotColor: '#9e9e9e', bgColor: '#f5f5f5', Icon: XCircle },
  PACKAGE_PURCHASED:     { dotColor: '#3b6cbf', bgColor: '#e7f0fc', Icon: Package },
  CONSENT_SIGNED:        { dotColor: '#2e7d32', bgColor: '#e7fce7', Icon: FileCheck },
}

function fmtHistoryDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  if (isSameDay(date, today))
    return `Hoje, ${format(date, 'HH:mm')}`
  if (isSameDay(date, subDays(today, 1)))
    return `Ontem, ${format(date, 'HH:mm')}`
  return format(date, "dd 'de' MMM 'de' yyyy", { locale: ptBR })
}

function HistoryEventRow({ ev, isLast, slug }: { ev: ClientHistoryEvent; isLast: boolean; slug: string }) {
  const cfg = HISTORY_CONFIG[ev.type]

  const content = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 32 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: cfg.bgColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <cfg.Icon size={15} color={cfg.dotColor} />
        </div>
        {!isLast && (
          <div style={{ width: 1, flex: 1, minHeight: 10, background: 'var(--border)', marginTop: 4 }} />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{ev.title}</span>
          {ev.amount != null && ev.amount > 0 && (
            <span style={{ fontSize: 13, fontWeight: 800, color: '#2e7d32', whiteSpace: 'nowrap' }}>
              {fmtBRL(ev.amount)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmtHistoryDate(ev.date)}</span>
          {ev.subtitle && (
            <>
              <span style={{ fontSize: 11, color: 'var(--hairline)' }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.subtitle}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )

  const rowStyle: React.CSSProperties = {
    display: 'block', textDecoration: 'none', color: 'inherit',
    padding: '0 20px',
    borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
  }

  if (ev.link) {
    return (
      <a
        href={ev.link} style={rowStyle}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        {content}
      </a>
    )
  }
  return <div style={rowStyle}>{content}</div>
}

// -- Dados sub-component -------------------------------------------------------

function applyDocMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

function applyCepMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d)/, '$1-$2')
}

function DadosTab({ client, slug }: { client: ProfileClient; slug: string }) {
  const router = useRouter()

  const [cpf,        setCpf]        = useState(client.document ? applyDocMask(client.document) : '')
  const [phone,      setPhone]      = useState(client.phone ?? '')
  const [email,      setEmail]      = useState(client.email ?? '')
  const [birthDate,  setBirthDate]  = useState(client.birthDate ? client.birthDate.slice(0, 10) : '')
  const [zipCode,    setZipCode]    = useState(client.zipCode   ? applyCepMask(client.zipCode) : '')
  const [address,    setAddress]    = useState(client.address ?? '')
  const [addrNum,    setAddrNum]    = useState(client.addressNumber ?? '')
  const [addrComp,   setAddrComp]   = useState(client.addressComplement ?? '')
  const [neighborhood, setNeighborhood] = useState(client.neighborhood ?? '')
  const [city,       setCity]       = useState(client.city ?? '')
  const [state,      setState]      = useState(client.state ?? '')

  const [selectedTags, setSelectedTags] = useState<string[]>(client.tags ?? [])

  const [cpfStatus,  setCpfStatus]  = useState<'idle' | 'checking' | 'ok' | 'self' | 'dup'>('idle')
  const [cpfDupName, setCpfDupName] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [saved,      setSaved]      = useState(false)
  const cpfTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleCpfChange(v: string) {
    const masked = applyDocMask(v)
    setCpf(masked)
    setCpfStatus('idle')
    setSaved(false)
    const digits = masked.replace(/\D/g, '')
    if (digits.length < 11) return
    if (cpfTimer.current) clearTimeout(cpfTimer.current)
    cpfTimer.current = setTimeout(async () => {
      setCpfStatus('checking')
      const res = await lookupClientByCpf(masked, client.id)
      if (!res.found)       setCpfStatus('ok')
      else if (res.isSelf)  setCpfStatus('self')
      else { setCpfStatus('dup'); setCpfDupName(res.name ?? '') }
    }, 500)
  }

  async function handleCepChange(v: string) {
    const masked = applyCepMask(v)
    setZipCode(masked)
    setSaved(false)
    const digits = masked.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setAddress(data.logradouro ?? '')
        setNeighborhood(data.bairro ?? '')
        setCity(data.localidade ?? '')
        setState(data.uf ?? '')
      }
    } catch {}
    setCepLoading(false)
  }

  async function handleSave() {
    if (cpfStatus === 'dup') return
    setSaving(true)
    setSaveError(null)
    const result = await updateClientContactData(
      client.id,
      { document: cpf, phone, email, birthDate, zipCode, address, addressNumber: addrNum, addressComplement: addrComp, neighborhood, city, state, tags: selectedTags },
      slug,
    )
    setSaving(false)
    if (result.error) { setSaveError(result.error); return }
    setSaved(true)
    router.refresh()
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1px solid var(--border)', fontSize: 13,
    fontFamily: 'inherit', color: 'var(--text)',
    background: 'var(--bg-app)', boxSizing: 'border-box' as const,
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5, display: 'block', letterSpacing: '0.04em' }

  return (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* CPF */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>CPF</p>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={e => handleCpfChange(e.target.value)}
            style={{ ...fieldStyle, paddingRight: 36 }}
          />
          {cpfStatus === 'checking' && (
            <Loader2 size={14} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
          )}
          {cpfStatus === 'ok' && (
            <CheckCircle2 size={14} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--success)' }} />
          )}
        </div>
        {cpfStatus === 'dup' && (
          <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 5 }}>
            CPF já cadastrado para <strong>{cpfDupName}</strong>.
          </p>
        )}
        {cpfStatus === 'self' && (
          <p style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginTop: 5 }}>CPF já vinculado a este cliente.</p>
        )}
      </div>

      {/* Contato */}
      <div className="form-2col">
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Telefone</p>
          <input
            type="tel"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={e => { setPhone(e.target.value); setSaved(false) }}
            style={fieldStyle}
          />
        </div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Data de nascimento</p>
          <input
            type="date"
            value={birthDate}
            onChange={e => { setBirthDate(e.target.value); setSaved(false) }}
            style={fieldStyle}
          />
        </div>
      </div>

      {/* E-mail */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>E-mail</p>
        <input
          type="email"
          placeholder="email@exemplo.com"
          value={email}
          onChange={e => { setEmail(e.target.value); setSaved(false) }}
          style={fieldStyle}
        />
      </div>

      {/* Endereço */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Endereço</p>

        <div className="form-2col" style={{ marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>CEP</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text" inputMode="numeric" placeholder="00000-000"
                value={zipCode} onChange={e => handleCepChange(e.target.value)}
                style={{ ...fieldStyle, paddingRight: cepLoading ? 32 : 12 }}
              />
              {cepLoading && <Loader2 size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Bairro</label>
            <input type="text" placeholder="Bairro" value={neighborhood} onChange={e => { setNeighborhood(e.target.value); setSaved(false) }} style={fieldStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Logradouro</label>
          <input type="text" placeholder="Rua, Avenida…" value={address} onChange={e => { setAddress(e.target.value); setSaved(false) }} style={fieldStyle} />
        </div>

        <div className="form-2col" style={{ marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Número</label>
            <input type="text" placeholder="Nº" value={addrNum} onChange={e => { setAddrNum(e.target.value); setSaved(false) }} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Complemento</label>
            <input type="text" placeholder="Apto, Sala…" value={addrComp} onChange={e => { setAddrComp(e.target.value); setSaved(false) }} style={fieldStyle} />
          </div>
        </div>

        <div className="form-2col">
          <div>
            <label style={labelStyle}>Cidade</label>
            <input type="text" placeholder="Cidade" value={city} onChange={e => { setCity(e.target.value); setSaved(false) }} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>UF</label>
            <input type="text" placeholder="SP" maxLength={2} value={state} onChange={e => { setState(e.target.value.toUpperCase()); setSaved(false) }} style={{ ...fieldStyle, textTransform: 'uppercase' }} />
          </div>
        </div>
      </div>

      {/* Tags */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Tags</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['VIP', 'Indicação', 'Retorno', 'Alergias', 'Gestante', 'Idoso', 'Plano', 'Desconto'].map(tag => {
            const active = selectedTags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
                  setSaved(false)
                }}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
                  background: active ? 'var(--brand-soft)' : 'var(--surface)',
                  color: active ? 'var(--brand)' : 'var(--text-muted)',
                  transition: 'all 0.12s',
                }}
              >
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      {saveError && <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{saveError}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || cpfStatus === 'dup'}
          className="btn-primary"
          style={{ minWidth: 120, justifyContent: 'center' }}
        >
          {saving   ? <><Loader2 size={13} className="animate-spin" /> Salvando…</> :
           saved    ? <><Check size={13} /> Salvo</>                                  :
                      'Salvar dados'}
        </button>
      </div>
    </div>
  )
}

// -- Financeiro sub-component --------------------------------------------------

function GrantCreditForm({
  clientId, branchId, slug, onClose,
}: { clientId: string; branchId: string; slug: string; onClose: () => void }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(grantInternalCredit, null)

  if (state !== null && !state?.error && !pending) {
    onClose()
    router.refresh()
    return null
  }

  return (
    <form
      action={action}
      style={{
        padding: '14px 20px',
        background: 'var(--brand-soft)',
        borderBottom: '1px solid var(--brand-soft-border)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="slug"      value={slug} />

      <div className="form-2col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label">Valor (R$) *</label>
          <input
            type="number" name="amount" required min="0.01" step="0.01"
            placeholder="0,00"
            className="field"
            style={{ background: 'var(--surface)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label">Motivo *</label>
          <input
            type="text" name="description" required
            placeholder="Ex: Estorno de pagamento duplicado"
            className="field"
            style={{ background: 'var(--surface)' }}
          />
        </div>
      </div>

      {state?.error && (
        <p style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary" style={{ fontSize: 12, gap: 6, minWidth: 130, justifyContent: 'center' }}>
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {pending ? 'Concedendo…' : 'Conceder crédito'}
        </button>
      </div>
    </form>
  )
}

function FinanceiroTab({
  transactions,
  internalCredits,
  canGrantCredit,
  clientId,
  branchId,
  slug,
}: {
  transactions:    ProfileTransaction[]
  internalCredits: ProfileInternalCredit[]
  canGrantCredit:  boolean
  clientId:        string
  branchId:        string
  slug:            string
}) {
  const [showGrantForm, setShowGrantForm] = useState(false)

  const totalPago      = transactions.filter(t => t.isPaid).reduce((s, t) => s + t.amount, 0)
  const totalPendente  = transactions.filter(t => !t.isPaid).reduce((s, t) => s + t.amount, 0)
  const creditoTotal   = internalCredits.reduce((s, c) => s + c.amount, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* KPIs */}
      <div className="rg-3" style={{ gap: 8 }}>
        {[
          { label: 'TOTAL PAGO',       value: fmtBRL(totalPago),     accent: false },
          { label: 'A RECEBER',        value: fmtBRL(totalPendente),  accent: totalPendente > 0 },
          { label: 'CRÉDITO INTERNO',  value: fmtBRL(creditoTotal),   accent: creditoTotal > 0 },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 18px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6 }}>
              {k.label}
            </p>
            <p style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: k.accent ? 'var(--brand)' : 'var(--text)' }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Transações */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', flex: 1 }}>Transações</h3>
          {transactions.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              {transactions.length}
            </span>
          )}
        </div>

        {transactions.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma transação registrada.</p>
          </div>
        ) : (
          <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                {['Data', 'Descrição', 'Forma', 'Valor', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => {
                const isLast = i === transactions.length - 1
                const hasInstallments = t.installments.length > 1
                const paidCount = t.installments.filter(p => p.isPaid).length

                return (
                  <tr key={t.id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--hairline)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {t.scheduledAt
                        ? format(new Date(t.scheduledAt), 'dd/MM/yyyy', { locale: ptBR })
                        : format(new Date(t.createdAt), 'dd/MM/yyyy', { locale: ptBR })
                      }
                    </td>
                    <td style={{ padding: '12px 16px', maxWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {t.isCheckout && (
                          <Receipt size={12} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                        )}
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.procedureName ?? t.description}
                        </p>
                      </div>
                      {hasInstallments && (
                        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                          {`${paidCount}/${t.installments[0]?.total ?? t.installments.length} parcelas · ${fmtBRL(t.installments[0]?.amount ?? 0)}/mês`}
                        </p>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {t.paymentMethod && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                          background: 'var(--bg-app)', color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                        }}>
                          {PAYMENT_LABEL[t.paymentMethod] ?? t.paymentMethod}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {fmtBRL(t.amount)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={t.isPaid ? 'chip chip-success' : 'chip chip-muted'} style={{ fontSize: 10 }}>
                        {t.isPaid ? 'Pago' : 'Pendente'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Crédito interno */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: (showGrantForm || internalCredits.length > 0) ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', flex: 1 }}>Crédito interno</h3>
          <span style={{ fontSize: 15, fontWeight: 800, color: creditoTotal > 0 ? 'var(--brand)' : 'var(--text-faint)', marginRight: 8 }}>
            {fmtBRL(creditoTotal)}
          </span>
          {canGrantCredit && (
            <button
              type="button"
              onClick={() => setShowGrantForm(v => !v)}
              className={showGrantForm ? 'btn-ghost' : 'btn-primary'}
              style={{ fontSize: 12, gap: 5 }}
            >
              {showGrantForm ? <><X size={12} /> Cancelar</> : <><Plus size={12} /> Conceder crédito</>}
            </button>
          )}
        </div>

        {showGrantForm && (
          <GrantCreditForm
            clientId={clientId}
            branchId={branchId}
            slug={slug}
            onClose={() => setShowGrantForm(false)}
          />
        )}

        {internalCredits.length === 0 && !showGrantForm ? (
          <div style={{ padding: '28px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {canGrantCredit ? 'Nenhum crédito concedido ainda.' : 'Sem crédito disponível.'}
            </p>
          </div>
        ) : (
          internalCredits.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', padding: '12px 20px',
                borderBottom: i < internalCredits.length - 1 ? '1px solid var(--hairline)' : 'none',
                gap: 14,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.description}</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                  {format(new Date(c.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--success)', flexShrink: 0 }}>
                +{fmtBRL(c.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// -- Main component ------------------------------------------------------------

const STATUS_ICON: Record<string, React.ReactNode> = {
  SCHEDULED:   <Clock size={11} />,
  CONFIRMED:   <Clock size={11} />,
  IN_PROGRESS: <Clock size={11} />,
  COMPLETED:   <CheckCircle2 size={11} />,
}

export function ClientProfile({
  client, branchId, stats, upcomingAppointments, recentAppointments, allAppointments,
  loyaltyBalance, activePackage, sessionNotes,
  transactions, internalCredits, documents, recordForms = [], generalAnamnesis = null, canGrantCredit, branches, currentBranchId, slug, role, clientHistory,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('visao')
  const visibleTabs = TABS.filter(t => t.key !== 'fichas' || recordForms.length > 0)
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false)

  const isVip    = client.tags.includes('VIP')
  const initials = getInitials(client.name)
  const since    = format(new Date(client.createdAt), "MMM yyyy", { locale: ptBR })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Ficha de tratamento */}
      {treatmentModalOpen && activePackage && (
        <TreatmentFileModal
          client={client}
          activePackage={activePackage}
          branches={branches}
          currentBranchId={currentBranchId}
          slug={slug}
          role={role}
          onClose={() => setTreatmentModalOpen(false)}
        />
      )}

      {/* -- Hero card ------------------------------------------------- */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          {/* Avatar + name + meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, flexShrink: 0,
              background: 'var(--brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800, color: '#fff',
            }}>
              {initials}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
                  {client.name}
                </h1>
                {isVip && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                    background: '#fce7ec', color: '#c34d6b',
                  }}>
                    VIP · Ouro
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
                {client.phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    <Phone size={11} style={{ color: 'var(--text-faint)' }} />
                    {client.phone}
                  </span>
                )}
                {client.email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    <Mail size={11} style={{ color: 'var(--text-faint)' }} />
                    {client.email}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                  <Calendar size={11} style={{ color: 'var(--text-faint)' }} />
                  Cliente desde {since}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => router.push(`/${slug}/agenda`)}
              className="btn-primary"
            >
              + Agendar
            </button>
            <button type="button" className="btn-ghost" style={{ padding: '8px 10px' }}>
              <MoreHorizontal size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* -- KPI row --------------------------------------------------- */}
      <div className="kpi-grid" style={{ gap: 8 }}>
        {[
          { label: 'SESSÕES',          value: String(stats.totalSessions) },
          { label: 'INVESTIDO TOTAL — LTV',  value: fmtBRL(stats.totalInvested) },
          { label: 'TICKET MÉDIO',     value: fmtBRL(stats.ticketMedio) },
          { label: 'PONTOS',           value: loyaltyBalance.toLocaleString('pt-BR') },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 18px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', marginBottom: 6 }}>
              {k.label}
            </p>
            <p style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* -- Tabs ------------------------------------------------------ */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {visibleTabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 18px',
              fontSize: 13, fontWeight: 700,
              background: 'none', border: 'none', cursor: 'pointer',
              color:       tab === t.key ? 'var(--brand)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.1s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* -- Tab: Visão geral ------------------------------------------ */}
      {tab === 'visao' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="rg-3" style={{ gap: 12, alignItems: 'start' }}>

          {/* 1. Tratamento em andamento */}
          {activePackage ? (
            <div role="button" onClick={() => setTreatmentModalOpen(true)} style={{
              borderRadius: 'var(--radius-card)',
              background: 'linear-gradient(135deg, var(--brand), var(--brand-deep, #a03358))',
              padding: '20px 24px', color: '#fff', cursor: 'pointer',
            }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.75, marginBottom: 6 }}>
                TRATAMENTO EM ANDAMENTO
              </p>
              <p style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{activePackage.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)' }}>
                  <div style={{
                    height: '100%', borderRadius: 3, background: '#fff',
                    width: `${Math.round((activePackage.usedSessions / activePackage.totalSessions) * 100)}%`,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 800, opacity: 0.95, flexShrink: 0 }}>
                  {activePackage.usedSessions} / {activePackage.totalSessions} sessões
                </p>
              </div>
              {activePackage.totalSessions - activePackage.usedSessions > 0 && (
                <p style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                  {activePackage.totalSessions - activePackage.usedSessions} sessões restantes
                </p>
              )}
            </div>
          ) : (
            <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, minHeight: 90 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-faint)' }}>TRATAMENTO EM ANDAMENTO</p>
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhum pacote ativo.</p>
            </div>
          )}

          {/* 2. Próximos agendamentos */}
          {upcomingAppointments.length > 0 ? (
            <div className="card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Clock size={14} style={{ color: 'var(--brand)' }} />
                <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Próximos agendamentos</h3>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'var(--brand-soft)', color: 'var(--brand)', marginLeft: 'auto' }}>
                  {upcomingAppointments.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {upcomingAppointments.map((a, i) => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                    borderBottom: i < upcomingAppointments.length - 1 ? '1px solid var(--hairline)' : 'none',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: 'var(--brand-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Stethoscope size={14} style={{ color: 'var(--brand)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{a.procedureName}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {format(new Date(a.scheduledAt), "EEE, dd MMM · HH:mm", { locale: ptBR })}
                        {a.professionalName !== '—' && ` · ${a.professionalName}`}
                      </p>
                    </div>
                    <span className={a.status === 'CONFIRMED' ? 'chip chip-success' : 'chip chip-brand'} style={{ fontSize: 10 }}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Clock size={14} style={{ color: 'var(--text-faint)' }} />
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhum agendamento futuro.</p>
            </div>
          )}

          {/* 3. Histórico de procedimentos */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Histórico de procedimentos</h3>
              {recentAppointments.length > 8 && (
                <button type="button" onClick={() => setTab('historico')} style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Ver tudo
                </button>
              )}
            </div>

            {recentAppointments.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '4px 0 8px' }}>
                Nenhum procedimento realizado ainda.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recentAppointments.slice(0, 8).map((a, i) => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0',
                    borderBottom: i < Math.min(recentAppointments.length, 8) - 1 ? '1px solid var(--hairline)' : 'none',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: a.status === 'COMPLETED' ? 'var(--success-soft)' : 'var(--bg-app)',
                      border: '1px solid var(--hairline)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Stethoscope size={12} style={{ color: a.status === 'COMPLETED' ? 'var(--success)' : 'var(--text-faint)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{a.procedureName}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                        {format(new Date(a.scheduledAt), "dd MMM yyyy", { locale: ptBR })}
                        {a.professionalName !== '—' && ` · ${a.professionalName}`}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmtBRL(a.price)}</p>
                      <p style={{ fontSize: 10, color: a.status === 'COMPLETED' ? 'var(--success)' : 'var(--text-faint)', fontWeight: 600, marginTop: 2 }}>
                        {STATUS_LABEL[a.status] ?? a.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>{/* fim grid 3 colunas */}

          {/* Pontos de fidelidade (rodapé discreto) */}
          {loyaltyBalance > 0 && (
            <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Star size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text)' }}>{loyaltyBalance.toLocaleString('pt-BR')} pontos</strong> de fidelidade acumulados
              </p>
            </div>
          )}
        </div>
      )}

      {/* -- Tab: Histórico -------------------------------------------- */}
      {tab === 'historico' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              Linha do tempo
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {clientHistory.length} evento{clientHistory.length !== 1 ? 's' : ''}
            </span>
          </div>

          {clientHistory.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhum evento registrado.
            </div>
          ) : (
            <div>
              {clientHistory.map((ev, i) => (
                <HistoryEventRow
                  key={ev.id}
                  ev={ev}
                  isLast={i === clientHistory.length - 1}
                  slug={slug}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* -- Tab: Fichas ---------------------------------------------- */}
      {tab === 'fichas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recordForms.length === 0 ? (
            <div className="card" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhuma ficha preenchida ainda.
            </div>
          ) : (
            recordForms.map(entry => (
              <AttendanceRecordCard
                key={entry.appointmentId}
                client={{ name: client.name, document: client.document, birthDate: client.birthDate, phone: client.phone }}
                subtitle={`${entry.procedureName ?? 'Atendimento'} · ${format(new Date(entry.createdAt), "dd/MM/yyyy", { locale: ptBR })}`}
                generalAnamnesis={
                  <AnamnesisTab embedded anamnesis={generalAnamnesis} clientId={client.id} branchId={branchId} slug={slug} canEdit={false} />
                }
                anamnesis={entry.anamnesis && entry.anamnesis.rows.length > 0 ? {
                  name: entry.anamnesis.name,
                  node: (
                    <AnamnesisFormRenderer
                      appointmentId={entry.appointmentId} slug={slug}
                      formName={entry.anamnesis.name} rows={entry.anamnesis.rows}
                      initial={entry.anamnesis.answers as AnamnesisAnswers} canEdit={false}
                    />
                  ),
                } : null}
                attendance={entry.attendance && entry.attendance.rows.length > 0 ? {
                  name: entry.attendance.name,
                  node: (
                    <AnamnesisFormRenderer
                      appointmentId={entry.appointmentId} slug={slug}
                      formName={entry.attendance.name} rows={entry.attendance.rows}
                      initial={entry.attendance.answers as AnamnesisAnswers} canEdit={false}
                    />
                  ),
                } : null}
              />
            ))
          )}
        </div>
      )}

      {/* -- Tab: Dados ------------------------------------------------ */}
      {tab === 'dados' && (
        <DadosTab client={client} slug={slug} />
      )}

      {/* -- Tab: Financeiro ------------------------------------------- */}
      {tab === 'financeiro' && (
        <FinanceiroTab
          transactions={transactions}
          internalCredits={internalCredits}
          canGrantCredit={canGrantCredit}
          clientId={client.id}
          branchId={branchId}
          slug={slug}
        />
      )}

      {/* -- Tab: Documentos ------------------------------------------- */}
      {tab === 'documentos' && (
        <ClientDocumentsTab
          documents={documents}
          clientId={client.id}
          branchId={branchId}
          slug={slug}
        />
      )}
    </div>
  )
}
