'use client'

import { useActionState, useState, useTransition } from 'react'
import { requestDataExport, getExportDownloadUrls, type LgpdRequestRow } from '@/actions/lgpd'
import { ShieldCheck, Download, FileText, FileJson, Loader2 } from 'lucide-react'

interface Props {
  requests: LgpdRequestRow[]
}

const STATUS_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: 'Em preparo',  color: 'var(--warning)',    bg: 'var(--warning-soft)' },
  processing: { label: 'Em preparo',  color: 'var(--warning)',    bg: 'var(--warning-soft)' },
  completed:  { label: 'Pronto',      color: 'var(--success)',    bg: 'var(--success-soft)' },
  failed:     { label: 'Falhou',      color: '#b42318',           bg: '#fee4e2' },
}

const MEDICAL_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Prontuário em análise', color: 'var(--warning)',   bg: 'var(--warning-soft)' },
  approved: { label: 'Prontuário incluído',   color: 'var(--success)',   bg: 'var(--success-soft)' },
  denied:   { label: 'Prontuário não incluído', color: 'var(--text-muted)', bg: '#f3eef0' },
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

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function DownloadRow({ request }: { request: LgpdRequestRow }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function open(kind: 'pdf' | 'json') {
    setError(null)
    start(async () => {
      const res = await getExportDownloadUrls(request.id)
      if (res.error) { setError(res.error); return }
      const url = kind === 'pdf' ? res.pdf : res.json
      if (url) window.open(url, '_blank', 'noopener')
      else setError('Arquivo indisponível.')
    })
  }

  const btn = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 14px', borderRadius: 12,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
  } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => open('pdf')} disabled={pending} style={btn}>
          {pending ? <Loader2 size={14} /> : <FileText size={14} />} Baixar relatório (PDF)
        </button>
        <button type="button" onClick={() => open('json')} disabled={pending} style={btn}>
          <FileJson size={14} /> Baixar dados (JSON)
        </button>
      </div>
      {request.expires_at && (
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
          Disponível até {fmt(request.expires_at)}.
        </p>
      )}
      {error && <p style={{ fontSize: 12, color: '#b42318', margin: 0 }}>{error}</p>}
    </div>
  )
}

export function DataRequestCard({ requests }: Props) {
  const [state, action, pending] = useActionState(requestDataExport, null)

  const openRequest = requests.find(r => r.status === 'pending' || r.status === 'processing')
  const latestDone  = requests.find(r => r.status === 'completed' && r.has_files)

  return (
    <div className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <ShieldCheck size={17} style={{ color: 'var(--brand)' }} />
        <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Meus dados pessoais
        </h2>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        Você pode pedir uma cópia de tudo o que guardamos sobre você — cadastro,
        agendamentos, atendimentos, pagamentos e pontos. Preparamos o arquivo e
        avisamos aqui quando estiver pronto.
      </p>

      {openRequest ? (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          padding: '14px 16px', borderRadius: 13,
          background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Chip {...STATUS_CHIP[openRequest.status]!} />
            {openRequest.include_medical && MEDICAL_CHIP[openRequest.medical_status] && (
              <Chip {...MEDICAL_CHIP[openRequest.medical_status]!} />
            )}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
            Solicitado em {fmt(openRequest.requested_at)}. Estamos reunindo seus dados
            {openRequest.medical_status === 'pending'
              ? ' — a parte do prontuário depende da liberação da clínica.'
              : '.'}
          </p>
        </div>
      ) : (
        <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 9,
            fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5, cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              name="include_medical"
              style={{ marginTop: 2, accentColor: 'var(--brand)', width: 15, height: 15 }}
            />
            <span>
              Incluir também meu prontuário (anamnese, evolução dos atendimentos e
              termos assinados).
              <span style={{ color: 'var(--text-muted)' }}>
                {' '}Esta parte passa por liberação da clínica antes de ser enviada.
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={pending}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px 16px', borderRadius: 12, border: 'none',
              background: 'var(--brand)', color: '#fff',
              fontWeight: 700, fontSize: 14, cursor: pending ? 'default' : 'pointer',
              boxShadow: '0 6px 16px rgba(195,77,107,0.25)',
              opacity: pending ? 0.7 : 1,
            }}
          >
            <Download size={15} />
            {pending ? 'Registrando…' : 'Solicitar meus dados'}
          </button>

          {state?.error   && <p style={{ fontSize: 12.5, color: '#b42318', margin: 0 }}>{state.error}</p>}
          {state?.success && (
            <p style={{ fontSize: 12.5, color: 'var(--success)', margin: 0 }}>
              Solicitação registrada. Avisaremos aqui assim que o arquivo estiver pronto.
            </p>
          )}
        </form>
      )}

      {latestDone && (
        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Chip {...STATUS_CHIP.completed!} />
            {latestDone.include_medical && MEDICAL_CHIP[latestDone.medical_status] && (
              <Chip {...MEDICAL_CHIP[latestDone.medical_status]!} />
            )}
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              Solicitado em {fmt(latestDone.requested_at)}
            </span>
          </div>
          <DownloadRow request={latestDone} />
        </div>
      )}

      {requests.some(r => r.status === 'failed') && !openRequest && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          A última tentativa não foi concluída. Você pode solicitar novamente.
        </p>
      )}
    </div>
  )
}
