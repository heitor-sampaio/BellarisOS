'use client'

import { useState, type ComponentType } from 'react'
import {
  Plus, Trash2, X, CheckCircle2, ChevronLeft, GripVertical,
  Type, AlignLeft, Hash, Calendar, List, CircleDot, CheckSquare, Heading, Image as ImageIcon,
} from 'lucide-react'
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

const TYPE_ICON: Record<AnamnesisFieldType, ComponentType<{ size?: number }>> = {
  text: Type, textarea: AlignLeft, number: Hash, date: Calendar,
  select: List, radio: CircleDot, checkbox: CheckSquare, section: Heading, photo: ImageIcon,
}

type Drag = { kind: 'new'; type: AnamnesisFieldType } | { kind: 'move'; index: number } | null

function uid() {
  try { return crypto.randomUUID() } catch { return `f_${Math.random().toString(36).slice(2)}` }
}
function newField(type: AnamnesisFieldType = 'text'): AnamnesisField {
  return { id: uid(), type, label: '', width: 'full', required: false, ...(OPTION_TYPES.includes(type) ? { options: [''] } : {}) }
}

export function AnamnesisFormBuilder({ existing, onDone }: Props) {
  const [name, setName]     = useState(existing?.name ?? '')
  const [fields, setFields] = useState<AnamnesisField[]>(existing?.fields ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [drag, setDrag]           = useState<Drag>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null) // fields.length = fim

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
  function addTypeAtEnd(type: AnamnesisFieldType) { setFields(fs => [...fs, newField(type)]) }

  function insertAt(type: AnamnesisFieldType, at: number) {
    setFields(fs => { const copy = [...fs]; copy.splice(at, 0, newField(type)); return copy })
  }
  function moveTo(from: number, to: number) {
    setFields(fs => {
      if (from === to) return fs
      const copy = fs.filter((_, i) => i !== from)
      copy.splice(from < to ? to - 1 : to, 0, fs[from]!)
      return copy
    })
  }
  function dropAt(target: number) {
    if (!drag) return
    if (drag.kind === 'new') insertAt(drag.type, Math.min(target, fields.length))
    else moveTo(drag.index, target)
    setDrag(null); setOverIndex(null)
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
    if (!fields.length) { setError('Adicione ao menos um campo à ficha.'); return }
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
        <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Nome da ficha *</label>
        <input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Anamnese — Toxina botulínica" />
      </div>

      {/* Duas colunas: paleta (blocos) + canvas (form) */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* -- Paleta de blocos -- */}
        <aside style={{ flex: '0 0 200px', minWidth: 180, position: 'sticky', top: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Blocos</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {FIELD_TYPES.map(t => {
              const Icon = TYPE_ICON[t.value]
              return (
                <div
                  key={t.value}
                  draggable
                  onDragStart={e => { setDrag({ kind: 'new', type: t.value }); e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', `new:${t.value}`) } catch {} }}
                  onDragEnd={() => { setDrag(null); setOverIndex(null) }}
                  onClick={() => addTypeAtEnd(t.value)}
                  title="Arraste para o formulário (ou clique para adicionar ao fim)"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px',
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                    cursor: 'grab', fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
                  }}
                >
                  <Icon size={15} />
                  {t.label}
                </div>
              )
            })}
          </div>
        </aside>

        {/* -- Canvas do formulário -- */}
        <div
          style={{ flex: '1 1 380px', minWidth: 0, minHeight: 140, background: 'var(--bg-app)', border: '1px dashed var(--border)', borderRadius: 12, padding: 12 }}
          onDragOver={e => { if (drag) { e.preventDefault(); setOverIndex(fields.length) } }}
          onDrop={e => { e.preventDefault(); dropAt(fields.length) }}
        >
          {fields.length === 0 ? (
            <div style={{
              minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              border: `2px dashed ${overIndex === 0 ? 'var(--brand)' : 'transparent'}`, borderRadius: 10,
              color: 'var(--text-faint)', fontSize: 13,
            }}>
              Arraste blocos aqui para montar a ficha
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }}>
              {fields.map((f, idx) => {
                const isSection = f.type === 'section'
                const isOver = overIndex === idx && drag !== null && !(drag.kind === 'move' && drag.index === idx)
                return (
                  <div
                    key={f.id}
                    style={{
                      ...widthFlex(f.width),
                      display: 'flex', flexDirection: 'column', gap: 8,
                      background: 'var(--surface)',
                      border: `1.5px solid ${isOver ? 'var(--brand)' : 'var(--border)'}`,
                      boxShadow: isOver ? 'inset 3px 0 0 var(--brand)' : undefined,
                      borderRadius: 12, padding: '10px 12px',
                      opacity: drag?.kind === 'move' && drag.index === idx ? 0.45 : 1,
                    }}
                    draggable
                    onDragStart={e => {
                      const t = e.target as HTMLElement
                      if (t.closest('input,select,textarea,button,label,a')) { e.preventDefault(); return }
                      setDrag({ kind: 'move', index: idx })
                      e.dataTransfer.effectAllowed = 'move'
                      try { e.dataTransfer.setData('text/plain', `move:${idx}`) } catch {}
                    }}
                    onDragOver={e => { if (drag) { e.preventDefault(); e.stopPropagation(); setOverIndex(idx) } }}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); dropAt(idx) }}
                    onDragEnd={() => { setDrag(null); setOverIndex(null) }}
                  >
                    {/* Topo: grip + tipo + largura + remover */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span title="Arraste para reordenar" style={{ cursor: 'grab', color: 'var(--text-faint)', display: 'flex', flexShrink: 0 }}><GripVertical size={16} /></span>
                      <select className="field" style={{ width: 'auto', flex: '1 1 110px', minWidth: 100, fontSize: 12, padding: '5px 8px' }} value={f.type} onChange={e => changeType(f.id, e.target.value as AnamnesisFieldType)}>
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      {!isSection && (
                        <select className="field" style={{ width: 'auto', flex: '0 0 auto', minWidth: 96, fontSize: 12, padding: '5px 8px' }} value={f.width ?? 'full'} onChange={e => patch(f.id, { width: e.target.value as AnamnesisFieldWidth })} title="Largura na linha">
                          {WIDTHS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                        </select>
                      )}
                      <button type="button" onClick={() => remove(f.id)} title="Remover" style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <input className="field" value={f.label} onChange={e => patch(f.id, { label: e.target.value })} placeholder={isSection ? 'Título da seção' : 'Pergunta / rótulo do campo'} />

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

                    {(f.type === 'text' || f.type === 'textarea' || f.type === 'number') && (
                      <input className="field" style={{ fontSize: 12.5, padding: '6px 10px' }} value={f.placeholder ?? ''} onChange={e => patch(f.id, { placeholder: e.target.value })} placeholder="Placeholder (opcional)" />
                    )}

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
          )}
        </div>
      </div>

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
