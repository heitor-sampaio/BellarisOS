'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, ClipboardList, FileText } from 'lucide-react'
import { ConstrutorDeFicha, type ExistingForm } from '@/components/admin/construtor-de-ficha'
import { criarFicha, atualizarFicha, apagarFicha, definirFichaAtiva } from '@/actions/fichas'
import type { AnamnesisRow } from '@/lib/anamnesis'

/**
 * Configurações → Fichas.
 *
 * Eram DUAS telas idênticas — "Anamnese" e "Atendimento" —, as duas casca fina
 * em volta do mesmo componente genérico, diferindo só nos rótulos. Quem montava
 * uma ficha tinha de decidir antes de qual tipo ela era, e a escolha não mudava
 * nada. Em 2026-09-25 viraram uma só, e o genérico virou esta tela: com um
 * assunto só, a indireção não tinha mais o que abstrair.
 */
export interface ItemDeFicha {
  id:       string
  name:     string
  rows:     AnamnesisRow[]
  isActive: boolean
}

function fieldCount(rows: AnamnesisRow[]): number {
  return rows.reduce((s, r) => s + r.fields.length, 0)
}

interface Props {
  forms: ItemDeFicha[]
}

type View =
  | { mode: 'list' }
  | { mode: 'new' }
  | { mode: 'edit'; form: ExistingForm }

export function SettingsFichas({ forms }: Props) {
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
    await apagarFicha(id)
    setBusy(null)
    router.refresh()
  }

  async function toggleActive(f: ItemDeFicha) {
    setBusy(f.id)
    await definirFichaAtiva(f.id, !f.isActive)
    setBusy(null)
    router.refresh()
  }

  if (view.mode !== 'list') {
    return (
      <div className="card" style={{ padding: '20px 11px' }}>
        <ConstrutorDeFicha
          existing={view.mode === 'edit' ? view.form : null}
          onDone={done}
          createAction={criarFicha}
          updateAction={atualizarFicha}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', maxWidth: 520 }}>
          Monte a ficha do procedimento e ligue uma a ele ao criar ou editar. Ela é
          preenchida pelo profissional durante o atendimento — se o procedimento
          for uma avaliação, os campos são os da avaliação.
        </p>
        <button type="button" className="btn-primary" onClick={() => setView({ mode: 'new' })}>
          <Plus size={15} /> Nova ficha
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-squircle)', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <ClipboardList size={22} color="var(--brand)" />
          </div>
          <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Nenhuma ficha ainda</p>
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>Crie a primeira ficha.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {forms.map(f => (
            <div key={f.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={17} color="var(--brand)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>{f.name}</p>
                <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                  {fieldCount(f.rows)} campo{fieldCount(f.rows) !== 1 ? 's' : ''}
                  {!f.isActive && ' · inativa'}
                </p>
              </div>
              <button
                type="button" onClick={() => toggleActive(f)} disabled={busy === f.id}
                style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
                  border: `1px solid ${f.isActive ? 'var(--success-border)' : 'var(--border)'}`,
                  background: f.isActive ? 'var(--success-bg)' : 'var(--bg-app)',
                  color: f.isActive ? 'var(--success)' : 'var(--text-muted)' }}
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
              <button type="button" title="Excluir" onClick={() => handleDelete(f.id, f.name)} disabled={busy === f.id} style={{ ...iconBtn, color: 'var(--danger)' }}>
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
