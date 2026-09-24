'use client'

import { useState } from 'react'
import { Clock, Star, Smartphone } from 'lucide-react'

/**
 * Catálogo de procedimentos na unidade — só leitura.
 *
 * Procedimento é dado da rede: incluir, editar e remover é de quem tem
 * abrangência de rede, em `/admin/procedures` (decisão de produto de
 * 2026-09-18). Existia aqui um "Novo procedimento" que criava um procedimento
 * local da filial com metade dos campos — sem insumos, sem fichas e sem preço
 * por unidade —, e ele saiu junto com a action que o atendia.
 */

// -- Types ---------------------------------------------------------------------

export interface ProcedureItem {
  id:                 string
  name:               string
  category:           string
  description:        string | null
  durationMin:        number
  price:              number
  sessionCount:       number
  visibleOnClientApp: boolean
}

interface Props {
  procedures:  ProcedureItem[]
  categories:  string[]
  totalCount:  number
  ticketMedio: number
}

// -- Helper ---------------------------------------------------------------------

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// -- Card ---------------------------------------------------------------------

function ProcedureCard({ p }: { p: ProcedureItem }) {
  return (
    <div
      className="card"
      style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--brand)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {p.category}
        </span>
        <span style={{
          fontSize: 'var(--text-2xs)', color: 'var(--text-faint)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Star size={10} style={{ fill: 'currentColor' }} />
          {p.sessionCount} {p.sessionCount === 1 ? 'sessão' : 'sessões'}
        </span>
      </div>

      {/* Name + app badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <p style={{
          fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)',
          letterSpacing: '-0.01em', lineHeight: 1.25,
        }}>
          {p.name}
        </p>
        {p.visibleOnClientApp && (
          <Smartphone size={13} style={{ color: 'var(--brand)', flexShrink: 0 }} aria-label="Disponível no app do cliente" />
        )}
      </div>

      {/* Description */}
      {p.description && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.55, flexGrow: 1 }}>
          {p.description}
        </p>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 8, borderTop: '1px solid var(--hairline)', marginTop: 'auto',
      }}>
        <span style={{
          fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Clock size={12} /> {p.durationMin} min
        </span>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          {fmtBRL(p.price)}
        </span>
      </div>
    </div>
  )
}

// -- Main ----------------------------------------------------------------------

export function ProceduresClient({ procedures, categories, totalCount, ticketMedio }: Props) {
  const [activeTab, setActiveTab] = useState('Todos')

  const tabs    = ['Todos', ...categories]
  const visible = activeTab === 'Todos'
    ? procedures
    : procedures.filter(p => p.category === activeTab)

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-title)', fontWeight: 800,
            letterSpacing: '-0.02em', color: 'var(--text)',
          }}>
            Procedimentos
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {totalCount} {totalCount === 1 ? 'procedimento' : 'procedimentos'} no catálogo da rede
            {ticketMedio > 0 && ` · ticket médio ${fmtBRL(ticketMedio)}`}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {tabs.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              fontSize: 'var(--text-base-sz)', fontWeight: 600,
              padding: '6px 16px', borderRadius: 999,
              border: '1.5px solid',
              cursor: 'pointer', transition: 'all 0.15s',
              background:  tab === activeTab ? 'var(--brand)' : 'var(--surface)',
              color:       tab === activeTab ? 'var(--on-brand)'         : 'var(--text)',
              borderColor: tab === activeTab ? 'var(--brand)' : 'var(--border)',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Nenhum procedimento {activeTab !== 'Todos' ? `na categoria "${activeTab}"` : 'disponível'}.
          </p>
        </div>
      ) : (
        <div className="rg-3">
          {visible.map(p => <ProcedureCard key={p.id} p={p} />)}
        </div>
      )}
    </div>
  )
}
