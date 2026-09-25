'use client'

import React from 'react'
import { FileText } from 'lucide-react'
import { differenceInYears, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Documento único do atendimento, em 3 seções:
//   1. Dados do cliente (identificação + a anamnese GERAL do cliente, que é o
//      questionário de saúde preenchido uma vez, não a ficha do procedimento)
//   2. Dados do procedimento (com insumos — baixa automática)
//   3. A ficha do procedimento (construtor)
// Eram 4: a ficha vinha dividida em "de anamnese" e "de atendimento", que
// eram a mesma coisa com dois nomes (2026-09-25).
// Usado tanto na tela de atendimento (editável) quanto no prontuário (leitura).

interface CardClient {
  name:      string
  document:  string | null
  birthDate: string | null
  phone:     string | null
}

interface FormSection {
  name: string
  node: React.ReactNode
}

interface Props {
  client:           CardClient
  subtitle?:        React.ReactNode        // ex.: procedimento · data (no prontuário)
  generalAnamnesis: React.ReactNode        // AnamnesisTab embedded
  procedureNode?:   React.ReactNode | null // bloco "Dados do procedimento" (com reassign, horários…)
  insumos?:         React.ReactNode | null // InsumoCard embedded
  /** A ficha do procedimento. Eram duas seções — "de anamnese" e "de
   *  atendimento" —, que eram a mesma coisa com dois nomes (2026-09-25). */
  ficha?:           FormSection | null
}

function maskCPF(doc: string | null): string | null {
  if (!doc) return null
  const d = doc.replace(/\D/g, '')
  if (d.length !== 11) return doc
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

function IdentityRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 'var(--text-base-sz)', color: value ? 'var(--text)' : 'var(--text-faint)' }}>
        {value || 'Não informado'}
      </p>
    </div>
  )
}

function SectionOverline({ label, subtitle }: { label: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      {subtitle && (
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{subtitle}</p>
      )}
    </div>
  )
}

export function AttendanceRecordCard({ client, subtitle, generalAnamnesis, procedureNode, insumos, ficha }: Props) {
  const age = client.birthDate ? differenceInYears(new Date(), new Date(client.birthDate)) : null
  const birth = client.birthDate ? format(new Date(client.birthDate), 'dd/MM/yyyy', { locale: ptBR }) : null

  const sectionDivider: React.CSSProperties = {
    borderTop: '1px solid var(--hairline)', paddingTop: 20, marginTop: 20,
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Cabeçalho do documento */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <FileText size={15} style={{ color: 'var(--brand)' }} />
        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Ficha de atendimento</h3>
        {subtitle && <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{subtitle}</span>}
      </div>

      <div style={{ padding: '20px 24px' }}>
        {/* Seção 1 — Dados do cliente */}
        <SectionOverline label="Dados do cliente" />
        <div className="form-2col" style={{ gap: '14px 28px', marginBottom: 18 }}>
          <IdentityRow label="Nome"       value={client.name} />
          <IdentityRow label="CPF"        value={maskCPF(client.document)} />
          <IdentityRow label="Nascimento" value={birth ? `${birth}${age !== null ? ` · ${age} anos` : ''}` : null} />
          <IdentityRow label="Telefone"   value={client.phone} />
        </div>
        {generalAnamnesis}

        {/* Seção 2 — Dados do procedimento (com insumos) */}
        {(procedureNode || insumos) && (
          <div style={sectionDivider}>
            <SectionOverline label="Dados do procedimento" />
            {procedureNode}
            {insumos && (
              <div style={{ marginTop: procedureNode ? 18 : 0 }}>
                <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Insumos</p>
                {insumos}
              </div>
            )}
          </div>
        )}

        {/* Seção 3 — A ficha do procedimento (construtor) */}
        {ficha && (
          <div style={sectionDivider}>
            <SectionOverline label="Ficha do procedimento" subtitle={ficha.name} />
            {ficha.node}
          </div>
        )}
      </div>
    </div>
  )
}
