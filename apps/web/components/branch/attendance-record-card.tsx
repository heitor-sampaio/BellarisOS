'use client'

import React from 'react'
import { FileText } from 'lucide-react'
import { differenceInYears, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Ficha de atendimento = documento único com 3 seções:
//   1. Dados do cliente (identificação + anamnese geral)
//   2. Ficha de anamnese (construtor)
//   3. Ficha de atendimento (construtor)
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

interface ProcedureData {
  name:          string
  category?:     string | null
  durationMin?:  number | null
  professional?: string | null
  scheduledAt?:  string | null
  room?:         string | null
}

interface Props {
  client:           CardClient
  subtitle?:        React.ReactNode        // ex.: procedimento · data (no prontuário)
  generalAnamnesis: React.ReactNode        // AnamnesisTab embedded
  anamnesis?:       FormSection | null
  procedure?:       ProcedureData | null
  insumos?:         React.ReactNode | null
  attendance?:      FormSection | null
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
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, color: value ? 'var(--text)' : 'var(--text-faint)' }}>
        {value || 'Não informado'}
      </p>
    </div>
  )
}

function SectionOverline({ label, subtitle }: { label: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      {subtitle && (
        <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{subtitle}</p>
      )}
    </div>
  )
}

export function AttendanceRecordCard({ client, subtitle, generalAnamnesis, anamnesis, procedure, insumos, attendance }: Props) {
  const age = client.birthDate ? differenceInYears(new Date(), new Date(client.birthDate)) : null
  const birth = client.birthDate ? format(new Date(client.birthDate), 'dd/MM/yyyy', { locale: ptBR }) : null
  const procDateTime = procedure?.scheduledAt ? format(new Date(procedure.scheduledAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : null

  const sectionDivider: React.CSSProperties = {
    borderTop: '1px solid var(--hairline)', paddingTop: 20, marginTop: 20,
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Cabeçalho do documento */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <FileText size={15} style={{ color: 'var(--brand)' }} />
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', flex: 1 }}>Ficha de atendimento</h3>
        {subtitle && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</span>}
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

        {/* Seção 2 — Ficha de anamnese (construtor) */}
        {anamnesis && (
          <div style={sectionDivider}>
            <SectionOverline label="Ficha de anamnese" subtitle={anamnesis.name} />
            {anamnesis.node}
          </div>
        )}

        {/* Seção 3 — Dados do procedimento */}
        {procedure && (
          <div style={sectionDivider}>
            <SectionOverline label="Dados do procedimento" />
            <div className="form-2col" style={{ gap: '14px 28px' }}>
              <IdentityRow label="Procedimento"     value={procedure.name} />
              <IdentityRow label="Categoria"        value={procedure.category} />
              <IdentityRow label="Duração prevista" value={procedure.durationMin ? `${procedure.durationMin} min` : null} />
              <IdentityRow label="Profissional"     value={procedure.professional} />
              <IdentityRow label="Data / hora"      value={procDateTime} />
              <IdentityRow label="Sala / cabine"    value={procedure.room} />
            </div>
          </div>
        )}

        {/* Seção 4 — Insumos (baixa automática do procedimento) */}
        {insumos && (
          <div style={sectionDivider}>
            <SectionOverline label="Insumos" />
            {insumos}
          </div>
        )}

        {/* Seção 5 — Ficha de atendimento (construtor) */}
        {attendance && (
          <div style={sectionDivider}>
            <SectionOverline label="Ficha de atendimento" subtitle={attendance.name} />
            {attendance.node}
          </div>
        )}
      </div>
    </div>
  )
}
