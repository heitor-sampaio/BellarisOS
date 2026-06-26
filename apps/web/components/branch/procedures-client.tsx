'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Star, Plus, Smartphone, X, Loader2, Save } from 'lucide-react'
import { createBranchProcedure } from '@/actions/procedures'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  slug:        string
  branchId:    string
  canManage:   boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESET_CATEGORIES = [
  'Facial', 'Corporal', 'Injetáveis', 'Laser', 'Capilar', 'Massagem', 'Pacotes', 'Outros',
]

// ── Helper ─────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── New procedure modal ───────────────────────────────────────────────────────

function NewProcedureModal({
  branchId, slug, onClose,
}: {
  branchId: string; slug: string; onClose: () => void
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createBranchProcedure, null)

  if (state !== null && !state?.error && !pending) {
    onClose()
    router.refresh()
    return null
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="card"
        style={{
          width: '100%', maxWidth: 600,
          padding: 0, overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', flex: 1 }}>
            Novo procedimento
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form action={action} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="branch_id" value={branchId} />
          <input type="hidden" name="slug"      value={slug} />

          {/* Nome */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Nome do procedimento *</label>
            <input
              type="text" name="name" required autoFocus
              placeholder="Ex: Limpeza de pele profunda"
              className="field"
            />
          </div>

          {/* Categoria + Duração */}
          <div className="form-2col">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="field-label">Categoria *</label>
              <select name="category" className="field" defaultValue="">
                <option value="" disabled>Selecione…</option>
                {PRESET_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="field-label">Duração (min) *</label>
              <input
                type="number" name="duration_min" required
                min="1" step="5" placeholder="60"
                className="field"
              />
            </div>
          </div>

          {/* Preço + App */}
          <div className="form-2col">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="field-label">Preço (R$) *</label>
              <input
                type="number" name="price" required
                min="0.01" step="0.01" placeholder="0,00"
                className="field"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="field-label">Disponível no app do cliente?</label>
              <select name="visible_on_client_app" className="field" defaultValue="false">
                <option value="false">Não</option>
                <option value="true">Sim</option>
              </select>
            </div>
          </div>

          {/* Descrição */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Descrição</label>
            <textarea
              name="description" rows={2}
              placeholder="Breve descrição do procedimento…"
              className="field"
              style={{ resize: 'vertical' }}
            />
          </div>

          {state?.error && (
            <p style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-secondary" style={{ gap: 5 }}>
              <X size={13} /> Cancelar
            </button>
            <button
              type="submit" disabled={pending}
              className="btn-primary"
              style={{ gap: 6, minWidth: 150, justifyContent: 'center' }}
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {pending ? 'Salvando…' : 'Criar procedimento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

function ProcedureCard({ p }: { p: ProcedureItem }) {
  return (
    <div
      className="card"
      style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'var(--brand)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {p.category}
        </span>
        <span style={{
          fontSize: 11, color: 'var(--text-faint)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Star size={10} style={{ fill: 'currentColor' }} />
          {p.sessionCount} {p.sessionCount === 1 ? 'sessão' : 'sessões'}
        </span>
      </div>

      {/* Name + app badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <p style={{
          fontSize: 16, fontWeight: 800, color: 'var(--text)',
          letterSpacing: '-0.01em', lineHeight: 1.25,
        }}>
          {p.name}
        </p>
        {p.visibleOnClientApp && (
          <Smartphone size={13} style={{ color: 'var(--brand)', flexShrink: 0 }} title="Disponível no app do cliente" />
        )}
      </div>

      {/* Description */}
      {p.description && (
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55, flexGrow: 1 }}>
          {p.description}
        </p>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 8, borderTop: '1px solid var(--hairline)', marginTop: 'auto',
      }}>
        <span style={{
          fontSize: 12, color: 'var(--text-faint)',
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

// ── Main ──────────────────────────────────────────────────────────────────────

export function ProceduresClient({
  procedures, categories, totalCount, ticketMedio, slug, branchId, canManage,
}: Props) {
  const [activeTab,  setActiveTab]  = useState('Todos')
  const [showModal,  setShowModal]  = useState(false)

  const tabs    = ['Todos', ...categories]
  const visible = activeTab === 'Todos'
    ? procedures
    : procedures.filter(p => p.category === activeTab)

  return (
    <>
      {showModal && (
        <NewProcedureModal
          branchId={branchId}
          slug={slug}
          onClose={() => setShowModal(false)}
        />
      )}

      <div>
        {/* Header */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{
              fontSize: 'var(--text-title)', fontWeight: 800,
              letterSpacing: '-0.02em', color: 'var(--text)',
            }}>
              Procedimentos
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
              {totalCount} {totalCount === 1 ? 'procedimento' : 'procedimentos'} no catálogo
              {ticketMedio > 0 && ` · ticket médio ${fmtBRL(ticketMedio)}`}
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="btn-primary"
              style={{ gap: 6, flexShrink: 0 }}
            >
              <Plus size={14} /> Novo procedimento
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {tabs.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: 13, fontWeight: 600,
                padding: '6px 16px', borderRadius: 999,
                border: '1.5px solid',
                cursor: 'pointer', transition: 'all 0.15s',
                background:  tab === activeTab ? 'var(--brand)' : 'var(--surface)',
                color:       tab === activeTab ? '#fff'         : 'var(--text)',
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
    </>
  )
}
