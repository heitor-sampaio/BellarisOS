'use client'

import { useState } from 'react'
import { Plus, Trash2, X, CheckCircle2, ChevronLeft, GripVertical } from 'lucide-react'
import {
  FIELD_TYPES, OPTION_TYPES, WIDTHS, widthFlex,
  type AnamnesisField, type AnamnesisFieldType, type AnamnesisFieldWidth,
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
  return { id: uid(), type, label: '', width: 'full', required: false, ...(OPTION_TYPES.includes(type) ? { options: [''] } : {}) }
}

export function AnamnesisFormBuilder({ existing, onDone }: Props) {
  const [name, setName]     = useState(existing?.name ?? '')
  const [fields, setFields] = useState<AnamnesisField[]>(existing?.fields?.length ? existing.fields : [newField()])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Drag and drop
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function patch(id: string, changes: Partial<AnamnesisField>) {
    setFields(fs => fs.map(f => f.id === id ? { ...f, ...changes } : f))
  }
  function changeType(id: string, type: AnamnesisFieldType) {
    setFields(fs => fs.map(f => {
      if (f.id !== id) return f
      const next: AnamnesisField = { ...f, type }
      if (OPTION_TYPES.includes(type)) next.options = f.options?.length ? f.options : ['']
      else delete next.options
      if (type === 'section') { next.required = false; next.width = 'full' }
      return next
    }))
  }
  function remove(id: string) { setFields(fs => fs.filter(f => f.id !== id)) }
  function addField() { setFields(fs => [...fs, newField()]) }

  function moveField(from: number, to: number) {
    setFields(fs => {
      if (from === to) return fs
      const copy = fs.filter((_, i) => i !== from)
      copy.splice(from < to ? to - 1 : to, 0, fs[from]!)
      return copy
    })
  }

  // Options helpers
  function setOption(fieldId: string, idx: number, value: string) {
    setFields(fs => fs.map(f => f.id === fieldId ? { ...f, options: (f.options ?? []).map((o, i) => i === idx ? value : o) } : f))
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
    const cleaned = fields.map(f => ({
      ...f,
      label: f.label.trim(),
      options: OPTION_TYPES.includes(f.type) ? (f.options ?? []).map(o => o.trim()).filter(Boolean) : undefined,
    }))
    if (cleaned.some(f => !f.label)) { setError('Todos os campos precisam de um rótulo.'); return }
    const badOpts = cleaned.find(f => OPTION_TYPES.includes(f.type) && (!f.options || f.options.length < 1))
    if (badOpts) { setError(`O campo "${badOpts.label}" precisa de ao menos uma opção.`); return }

    setSaving(true)
    const payload = { name: name.trim(), schema: { fields: cleaned } }
    const res = existing ? await updateAnamnesisForm({ id: existing.id, ...payload }) : await createAnamnesisForm(payload)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button
        type="button" onClick={onDone}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
      >
        <ChevronLeft size={16} /> Voltar às fichas
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          Nome da ficha *
        </label>
        <input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Anamnese — Toxina botulínica" />
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
        Arraste pelo <GripVertical size={12} style={{ verticalAlign: 'middle' }} /> para reordenar. Use a
        largura (Metade / Um terço) para colocar mais de um campo na mesma linha.
      </p>

      {/* Blocos — flex-wrap reflete as larguras (colunas) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }}>
        {fields.map((f, idx) => {
          const isSection = f.type === 'section'
          const isOver = overIndex === idx && dragIndex !== null && dragIndex !== idx
          return (
            <div
              key={f.id}
              style={{
                ...widthFlex(f.width),
                display: 'flex', flexDirection: 'column', gap: 8,
                background: 'var(--surface)',
                border: `1.5px solid ${isOver ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 12, padding: '10px 12px',
                opacity: dragIndex === idx ? 0.45 : 1,
                transition: 'border-color 120ms',
              }}
              onDragOver={e => { if (dragIndex !== null) { e.preventDefault(); setOverIndex(idx) } }}
              onDrop={e => { e.preventDefault(); if (dragIndex !== null) moveField(dragIndex, idx); setDragIndex(null); setOverIndex(null) }}
              onDragStart={e => {
                const t = e.target as HTMLElement
                if (t.closest('input,select,textarea,button,label,a')) { e.preventDefault(); return }
                setDragIndex(idx)
                e.dataTransfer.effectAllowed = 'move'
                try { e.dataTransfer.setData('text/plain', String(idx)) } catch { /* Safari */ }
              }}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
              draggable
            >
              {/* Topo: grip + tipo + largura + remover */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span title="Arraste para reordenar" style={{ cursor: 'grab', color: 'var(--text-faint)', display: 'flex', flexShrink: 0 }}>
                  <GripVertical size={16} />
                </span>
                <select
                  className="field"
                  style={{ width: 'auto', flex: '1 1 120px', minWidth: 110, fontSize: 12, padding: '5px 8px' }}
                  value={f.type}
                  onChange={e => changeType(f.id, e.target.value as AnamnesisFieldType)}
                >
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {!isSection && (
                  <select
                    className="field"
                    style={{ width: 'auto', flex: '0 0 auto', minWidth: 100, fontSize: 12, padding: '5px 8px' }}
                    value={f.width ?? 'full'}
                    onChange={e => patch(f.id, { width: e.target.value as AnamnesisFieldWidth })}
                    title="Largura na linha"
                  >
                    {WIDTHS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                )}
                <button
                  type="button" onClick={() => remove(f.id)} title="Remover"
                  style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Rótulo */}
              <input
                className="field" value={f.label}
                onChange={e => patch(f.id, { label: e.target.value })}
                placeholder={isSection ? 'Título da seção (ex: Histórico de saúde)' : 'Pergunta / rótulo do campo'}
              />

              {/* Opções */}
              {OPTION_TYPES.includes(f.type) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Opções</span>
                  {(f.options ?? []).map((opt, oi) => (
                    <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input className="field" style={{ flex: 1, fontSize: 12.5, padding: '6px 10px' }} value={opt} onChange={e => setOption(f.id, oi, e.target.value)} placeholder={`Opção ${oi + 1}`} />
                      <button type="button" onClick={() => removeOption(f.id, oi)} title="Remover opção" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addOption(f.id)} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Plus size={13} /> Adicionar opção
                  </button>
                </div>
              )}

              {/* Placeholder */}
              {(f.type === 'text' || f.type === 'textarea' || f.type === 'number') && (
                <input className="field" style={{ fontSize: 12.5, padding: '6px 10px' }} value={f.placeholder ?? ''} onChange={e => patch(f.id, { placeholder: e.target.value })} placeholder="Placeholder (opcional)" />
              )}

              {/* Obrigatório */}
              {!isSection && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-soft)' }}>
                  <input type="checkbox" checked={!!f.required} onChange={e => patch(f.id, { required: e.target.checked })} style={{ accentColor: 'var(--brand)', width: 15, height: 15 }} />
                  Obrigatório
                </label>
              )}
            </div>
          )
        })}
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
