'use client'

import { useState } from 'react'
import { FileText, Download, CheckCircle2, Clock3 } from 'lucide-react'
import type { ProcedimentoItem, PagamentoItem } from '@/app/[slug]/cliente/historico/page'

// -- Types ----------------------------------------------------------
type ClientDoc = {
  id:         string
  name:       string
  category:   string
  file_url:   string
  created_at: string
}

type ConsentDoc = {
  id:         string
  title:      string
  signed_at:  string
  signed_via: string | null
  kind:       'consent'
}

interface Props {
  procedimentos:  ProcedimentoItem[]
  pagamentos:     PagamentoItem[]
  documentos:     ClientDoc[]
  consentimentos: ConsentDoc[]
}

type Tab = 'procedimentos' | 'pagamentos' | 'documentos'

const METHOD_LABEL: Record<string, string> = {
  CASH:            'Dinheiro',
  PIX:             'Pix',
  DEBIT_CARD:      'Débito',
  CREDIT_CARD:     'Crédito',
  INTERNAL_CREDIT: 'Crédito interno',
}

const DOC_CATEGORY: Record<string, string> = {
  anamnese:  'Anamnese',
  contrato:  'Contrato',
  foto:      'Foto',
  laudo:     'Laudo',
  outro:     'Documento',
}

// -- Component ------------------------------------------------------
export function HistoricoTabs({ procedimentos, pagamentos, documentos, consentimentos }: Props) {
  const [tab, setTab] = useState<Tab>('procedimentos')

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'procedimentos', label: 'Procedimentos', count: procedimentos.length },
    { key: 'pagamentos',    label: 'Pagamentos',    count: pagamentos.length },
    { key: 'documentos',    label: 'Documentos',    count: documentos.length + consentimentos.length },
  ]

  return (
    <div>
      {/* -- Tab bar ----------------------------------------------- */}
      <div style={{
        display:        'flex',
        borderBottom:   '2px solid var(--hairline)',
        marginBottom:   20,
        gap:            0,
        overflowX:      'auto',
        scrollbarWidth: 'none',
      }}>
        {TABS.map(({ key, label, count }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                padding:       '10px 16px',
                whiteSpace:    'nowrap',
                fontSize:      13,
                fontWeight:    active ? 700 : 500,
                color:         active ? 'var(--brand)' : 'var(--text-muted)',
                background:    'transparent',
                border:        'none',
                borderBottom:  active ? '2px solid var(--brand)' : '2px solid transparent',
                marginBottom:  -2,
                cursor:        'pointer',
                display:       'flex',
                alignItems:    'center',
                gap:           6,
              }}
            >
              {label}
              {count > 0 && (
                <span style={{
                  fontSize:    10,
                  fontWeight:  700,
                  color:       active ? 'var(--brand)' : 'var(--text-faint)',
                  background:  active ? 'var(--brand-soft)' : 'var(--bg-app)',
                  borderRadius: 10,
                  padding:     '1px 6px',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* -- Procedimentos ------------------------------------------ */}
      {tab === 'procedimentos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {procedimentos.length === 0 && (
            <EmptyState message="Nenhum procedimento realizado ainda." />
          )}
          {procedimentos.map(p => (
            <div key={p.id} className="card" style={{ padding: '13px 18px' }}>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 3 }}>
                {p.procedure_name}
              </p>
              <div style={{ display: 'flex', gap: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
                {p.professional_name && <span>{p.professional_name}</span>}
                <span>
                  {new Date(p.scheduled_at).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* -- Pagamentos --------------------------------------------- */}
      {tab === 'pagamentos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pagamentos.length === 0 && (
            <EmptyState message="Nenhum pagamento registrado." />
          )}
          {pagamentos.map(p => (
            <div key={p.id} className="card" style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5, marginBottom: 2 }}>
                  {p.procedure_name ?? p.description}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {p.paid_at
                    ? new Date(p.paid_at).toLocaleDateString('pt-BR')
                    : 'Pendente'}
                  {p.payment_method && ` · ${METHOD_LABEL[p.payment_method] ?? p.payment_method}`}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                  R$ {p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 }}>
                  {p.is_paid
                    ? <CheckCircle2 size={11} color="#22c55e" />
                    : <Clock3 size={11} color="#f59e0b" />}
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: p.is_paid ? '#22c55e' : '#f59e0b' }}>
                    {p.is_paid ? 'Pago' : 'Pendente'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* -- Documentos --------------------------------------------- */}
      {tab === 'documentos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {documentos.length === 0 && consentimentos.length === 0 && (
            <EmptyState message="Nenhum documento disponível." />
          )}

          {/* Termos de consentimento */}
          {consentimentos.map(c => (
            <div key={c.id} className="card" style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: 'var(--brand-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <FileText size={16} color="var(--brand)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5, marginBottom: 2 }}>
                  {c.title}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Assinado em {new Date(c.signed_at).toLocaleDateString('pt-BR')}
                  {c.signed_via && ` · via ${c.signed_via}`}
                </p>
              </div>
              <CheckCircle2 size={16} color="#22c55e" style={{ flexShrink: 0 }} />
            </div>
          ))}

          {/* Arquivos enviados pela clínica */}
          {documentos.map(d => (
            <a
              key={d.id}
              href={d.file_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <div className="card" style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: 'var(--bg-app)',
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileText size={16} color="var(--text-muted)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5, marginBottom: 2 }}>
                    {d.name}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {DOC_CATEGORY[d.category] ?? 'Documento'} · {new Date(d.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <Download size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--text-faint)', padding: '40px 0' }}>
      {message}
    </p>
  )
}
