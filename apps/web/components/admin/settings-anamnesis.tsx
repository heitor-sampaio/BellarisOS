'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, ClipboardList, FileText } from 'lucide-react'
import { AnamnesisFormBuilder, type ExistingForm } from '@/components/admin/anamnesis-form-builder'
import { deleteAnamnesisForm, setAnamnesisFormActive } from '@/actions/anamnesis-forms'
import type { AnamnesisRow } from '@/lib/anamnesis'

export interface AdminAnamnesisForm {
  id:       string
  name:     string
  rows:     AnamnesisRow[]
  isActive: boolean
}

function fieldCount(rows: AnamnesisRow[]): number {
  return rows.reduce((s, r) => s + r.fields.length, 0)
}

interface Props {
  forms: AdminAnamnesisForm[]
}

type View =
  | { mode: 'list' }
  | { mode: 'new' }
  | { mode: 'edit'; form: ExistingForm }

export function SettingsAnamnesis({ forms }: Props) {
  const router = useRouter()
  const [view, setView] = useState<View>({ mode: 'list' })
  const [busy, setBusy] = useState<string | null>(null)

  function done() {
    setView({ mode: 'list' })
    router.refresh()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir a ficha "${name}"? Procedimentos que a usam ficarão sem ficha.`)) return
    setBusy(id)
    await deleteAnamnesisForm(id)
    setBusy(null)
    router.refresh()
  }

  async function toggleActive(f: AdminAnamnesisForm) {
    setBusy(f.id)
    await setAnamnesisFormActive(f.id, !f.isActive)
    setBusy(null)
    router.refresh()
  }

  if (view.mode !== 'list') {
    return (
      <div className="card" style={{ padding: '20px 11px' }}>
        <AnamnesisFormBuilder
          existing={view.mode === 'edit' ? view.form : null}
          onDone={done}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 520 }}>
          Monte fichas de anamnese e selecione uma ao criar ou editar um procedimento. A ficha é
          preenchida pelo profissional durante o atendimento.
        </p>
        <button type="button" className="btn-primary" onClick={() => setView({ mode: 'new' })}>
          <Plus size={15} /> Nova ficha
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <ClipboardList size={22} color="var(--brand)" />
          </div>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Nenhuma ficha ainda</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Crie a primeira ficha de anamnese.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {forms.map(f => (
            <div key={f.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={17} color="var(--brand)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>{f.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {fieldCount(f.rows)} campo{fieldCount(f.rows) !== 1 ? 's' : ''}
                  {!f.isActive && ' · inativa'}
                </p>
              </div>
              <button
                type="button" onClick={() => toggleActive(f)} disabled={busy === f.id}
                style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
                  border: `1px solid ${f.isActive ? '#86efac' : 'var(--border)'}`,
                  background: f.isActive ? '#f0fdf4' : 'var(--bg-app)',
                  color: f.isActive ? '#16a34a' : 'var(--text-muted)' }}
              >
                {f.isActive ? 'Ativa' : 'Inativa'}
              </button>
              <button
                type="button" title="Editar"
                onClick={() => setView({ mode: 'edit', form: { id: f.id, name: f.name, rows: f.rows } })}
                style={iconBtn}
              >
                <Pencil size={14} />
              </button>
              <button type="button" title="Excluir" onClick={() => handleDelete(f.id, f.name)} disabled={busy === f.id} style={{ ...iconBtn, color: '#dc2626' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-muted)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
}
