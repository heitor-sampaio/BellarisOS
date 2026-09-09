'use client'

import { useActionState } from 'react'
import { reviewMedicalData, type LgpdAdminRow } from '@/actions/lgpd'
import { ShieldCheck, Check, X, AlertTriangle } from 'lucide-react'

interface Props {
  requests: LgpdAdminRow[]
  /** Só quem gerencia prontuário pode liberar a parte clínica. */
  canReviewMedical: boolean
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: 'Em preparo', color: 'var(--warning)',    bg: 'var(--warning-soft)' },
  processing: { label: 'Em preparo', color: 'var(--warning)',    bg: 'var(--warning-soft)' },
  completed:  { label: 'Entregue',   color: 'var(--success)',    bg: 'var(--success-soft)' },
  failed:     { label: 'Falhou',     color: '#b42318',           bg: '#fee4e2' },
}

const MEDICAL: Record<string, { label: string; color: string; bg: string }> = {
  not_requested: { label: 'Sem prontuário',        color: 'var(--text-muted)', bg: '#f3eef0' },
  pending:       { label: 'Prontuário a liberar',  color: 'var(--warning)',    bg: 'var(--warning-soft)' },
  approved:      { label: 'Prontuário liberado',   color: 'var(--success)',    bg: 'var(--success-soft)' },
  denied:        { label: 'Prontuário negado',     color: 'var(--text-muted)', bg: '#f3eef0' },
}

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '5px 10px',
      borderRadius: 20, color, background: bg, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'

function ReviewButtons({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(reviewMedicalData, null)

  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 13px', borderRadius: 12, fontSize: 12.5,
    fontWeight: 700, cursor: pending ? 'default' : 'pointer',
    opacity: pending ? 0.6 : 1,
  } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      <form action={action} style={{ display: 'flex', gap: 8 }}>
        <input type="hidden" name="request_id" value={requestId} />
        <button
          type="submit" name="decision" value="approved" disabled={pending}
          style={{ ...base, border: 'none', background: 'var(--brand)', color: '#fff',
                   boxShadow: '0 4px 12px rgba(195,77,107,0.22)' }}
        >
          <Check size={14} /> Liberar
        </button>
        <button
          type="submit" name="decision" value="denied" disabled={pending}
          style={{ ...base, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        >
          <X size={14} /> Negar
        </button>
      </form>
      {state?.error && <span style={{ fontSize: 11.5, color: '#b42318' }}>{state.error}</span>}
    </div>
  )
}

export function SettingsLgpd({ requests, canReviewMedical }: Props) {
  const awaiting = requests.filter(r => r.medical_status === 'pending')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          Solicitações de dados (LGPD)
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3 }}>
          Quando um cliente pede uma cópia dos próprios dados, o pacote com cadastro, agenda,
          financeiro e fidelidade é gerado automaticamente. A parte do prontuário só entra
          se alguém com acesso a prontuário liberar aqui.
        </p>
      </div>

      {awaiting.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '12px 16px', borderRadius: 13,
          background: 'var(--warning-soft)', border: '1px solid #f0dcb8',
        }}>
          <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {awaiting.length === 1
              ? '1 solicitação aguarda liberação do prontuário'
              : `${awaiting.length} solicitações aguardam liberação do prontuário`}
          </span>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="card" style={{ padding: '28px 22px', textAlign: 'center' }}>
          <ShieldCheck size={22} style={{ color: 'var(--text-faint)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 8 }}>
            Nenhuma solicitação até agora.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {requests.map((r, i) => (
            <div
              key={r.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 16, padding: '14px 20px', flexWrap: 'wrap',
                borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  {r.client_name}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Chip {...(STATUS[r.status] ?? STATUS.pending!)} />
                  <Chip {...(MEDICAL[r.medical_status] ?? MEDICAL.not_requested!)} />
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    Pedido em {fmt(r.requested_at)}
                    {r.completed_at ? ` · entregue em ${fmt(r.completed_at)}` : ''}
                  </span>
                </div>
                {r.error_message && (
                  <span style={{ fontSize: 11.5, color: '#b42318' }}>{r.error_message}</span>
                )}
              </div>

              {r.medical_status === 'pending' && (
                canReviewMedical
                  ? <ReviewButtons requestId={r.id} />
                  : <span style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 220, textAlign: 'right' }}>
                      Só quem tem acesso a prontuário pode liberar esta parte.
                    </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
