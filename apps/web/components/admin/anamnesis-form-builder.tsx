'use client'

import { useState } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, X, CheckCircle2, ChevronLeft } from 'lucide-react'
import {
  FIELD_TYPES, OPTION_TYPES, type AnamnesisField, type AnamnesisFieldType,
} from '@/lib/anamnesis'
import { createAnamnesisForm, updateAnamnesisForm } from '@/actions/anamnesis-forms'

export interface ExistingForm {
  id:     string
  name:   string
  fields: AnamnesisField[]
}

interface Props {
  existing?: ExistingForm | null
  onDone:    () => void
}

function uid() {
  try { return crypto.randomUUID() } catch { return `f_${Math.random().toString(36).slice(2)}` }
}

function newField(type: AnamnesisFieldType = 'text'): AnamnesisField {
  return { id: uid(), type, label: '', required: false, ...(OPTION_TYPES.includes(type) ? { options: [''] } : {}) }
}

export function AnamnesisFormBuilder({ existing, onDone }: Props) {
  const [name, setName]     = useState(existing?.name ?? '')
  const [fields, setFields] = useState<AnamnesisField[]>(existing?.fields?.length ? existing.fields : [newField()])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  function patch(id: string, changes: Partial<AnamnesisField>) {
    setFields(fs => fs.map(f => f.id === id ? { ...f, ...changes } : f))
  }
  function changeType(id: string, type: AnamnesisFieldType) {
    setFields(fs => fs.map(f => {
      if (f.id !== id) return f
      const next: AnamnesisField = { ...f, type }
      if (OPTION_TYPES.includes(type)) next.options = f.options?.length ? f.options : ['']
      else delete next.options
      if (type === 'section') next.required = false
      return next
    }))
  }
  function move(id: string, dir: -1 | 1) {
    setFields(fs => {
      const i = fs.findIndex(f => f.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= fs.length) return fs
      const copy = [...fs]
      ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
      return copy
    })
  }
  function remove(id: string) { setFields(fs => fs.filter(f => f.id !== id)) }
  function addField() { setFields(fs => [...fs, newField()]) }

  // Options helpers
  function setOption(fieldId: string, idx: number, value: string) {
    setFields(fs => fs.map(f => f.id === fieldId
      ? { ...f, options: (f.options ?? []).map((o, i) => i === idx ? value : o) }
      : f))
  }
  function addOption(fieldId: string) {
    setFields(fs => fs.map(f => f.id === fieldId ? { ...f, options: [...(f.options ?? []), ''] } : f))
  }
  function removeOption(fieldId: string, idx: number) {
    setFields(fs => fs.map(f => f.id === fieldId ? { ...f, options: (f.options ?? []).filter((_, i) => i !== idx) } : f))
  }

  async function save() {
    setError(null)
    if (!name.trim()) { setError('Informe um nome para a ficha.'); return }
    // limpeza local antes de enviar
    const cleaned = fields.map(f => ({
      ...f,
      label: f.label.trim(),
      options: OPTION_TYPES.includes(f.type)
        ? (f.options ?? []).map(o => o.trim()).filter(Boolean)
        : undefined,
    }))
    if (cleaned.some(f => !f.label)) { setError('Todos os campos precisam de um rótulo.'); return }
    const badOpts = cleaned.find(f => OPTION_TYPES.includes(f.type) && (!f.options || f.options.length < 1))
    if (badOpts) { setError(`O campo "${badOpts.label}" precisa de ao menos uma opção.`); return }

    setSaving(true)
    const payload = { name: name.trim(), schema: { fields: cleaned } }
    const res = existing
      ? await updateAnamnesisForm({ id: existing.id, ...payload })
      : await createAnamnesisForm(payload)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <button
        type="button" onClick={onDone}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
      >
        <ChevronLeft size={16} /> Voltar às fichas
      </button>

      {/* Nome da ficha */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          Nome da ficha *
        </label>
        <input
          className="field" value={name} onChange={e => setName(e.target.value)}
          placeholder="Ex: Anamnese — Toxina botulínica"
        />
      </div>

      {/* Campos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fields.map((f, idx) => (
          <div key={f.id} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Cabeçalho da linha: tipo + reordenar + remover */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select
                className="field"
                style={{ width: 'auto', minWidth: 160, flex: '0 0 auto', fontSize: 12.5, padding: '6px 10px' }}
                value={f.type}
                onChange={e => changeType(f.id, e.target.value as AnamnesisFieldType)}
              >
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>#{idx + 1}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <IconBtn title="Mover para cima" disabled={idx === 0} onClick={() => move(f.id, -1)}><ArrowUp size={14} /></IconBtn>
                <IconBtn title="Mover para baixo" disabled={idx === fields.length - 1} onClick={() => move(f.id, 1)}><ArrowDown size={14} /></IconBtn>
                <IconBtn title="Remover" onClick={() => remove(f.id)} danger><Trash2 size={14} /></IconBtn>
              </div>
            </div>

            {/* Rótulo */}
            <input
              className="field"
              value={f.label}
              onChange={e => patch(f.id, { label: e.target.value })}
              placeholder={f.type === 'section' ? 'Título da seção (ex: Histórico de saúde)' : 'Pergunta / rótulo do campo'}
            />

            {/* Opções (select/radio/checkbox) */}
            {OPTION_TYPES.includes(f.type) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Opções</span>
                {(f.options ?? []).map((opt, oi) => (
                  <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      className="field" style={{ flex: 1, fontSize: 12.5, padding: '6px 10px' }}
                      value={opt} onChange={e => setOption(f.id, oi, e.target.value)}
                      placeholder={`Opção ${oi + 1}`}
                    />
                    <IconBtn title="Remover opção" onClick={() => removeOption(f.id, oi)} danger><X size={13} /></IconBtn>
                  </div>
                ))}
                <button
                  type="button" onClick={() => addOption(f.id)}
                  style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <Plus size={13} /> Adicionar opção
                </button>
              </div>
            )}

            {/* Placeholder (campos de entrada de texto/número) */}
            {(f.type === 'text' || f.type === 'textarea' || f.type === 'number') && (
              <input
                className="field" style={{ fontSize: 12.5, padding: '6px 10px' }}
                value={f.placeholder ?? ''}
                onChange={e => patch(f.id, { placeholder: e.target.value })}
                placeholder="Texto de ajuda / placeholder (opcional)"
              />
            )}

            {/* Obrigatório */}
            {f.type !== 'section' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-soft)' }}>
                <input
                  type="checkbox" checked={!!f.required}
                  onChange={e => patch(f.id, { required: e.target.checked })}
                  style={{ accentColor: 'var(--brand)', width: 15, height: 15 }}
                />
                Obrigatório
              </label>
            )}
          </div>
        ))}
      </div>

      <button
        type="button" onClick={addField}
        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--brand)', background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer' }}
      >
        <Plus size={15} /> Adicionar campo
      </button>

      {error && <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 600 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
        <button type="button" onClick={onDone} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button type="button" onClick={save} className="btn-primary" disabled={saving}>
          <CheckCircle2 size={15} /> {saving ? 'Salvando…' : (existing ? 'Salvar ficha' : 'Criar ficha')}
        </button>
      </div>
    </div>
  )
}

function IconBtn({ children, onClick, title, disabled, danger }: {
  children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; danger?: boolean
}) {
  return (
    <button
      type="button" onClick={onClick} title={title} disabled={disabled}
      style={{
        width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
        background: 'var(--surface)', color: danger ? '#dc2626' : 'var(--text-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
