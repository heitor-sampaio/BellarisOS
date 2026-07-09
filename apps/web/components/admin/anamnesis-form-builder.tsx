'use client'

import { useState, type ComponentType } from 'react'
import {
  Plus, Trash2, X, CheckCircle2, ChevronLeft, GripVertical, ArrowUp, ArrowDown,
  Type, AlignLeft, Hash, Calendar, List, CircleDot, CheckSquare, Heading, Image as ImageIcon,
} from 'lucide-react'
import {
  FIELD_TYPES, OPTION_TYPES, MAX_COLS, newId,
  type AnamnesisField, type AnamnesisFieldType, type AnamnesisRow,
} from '@/lib/anamnesis'
import { createAnamnesisForm, updateAnamnesisForm } from '@/actions/anamnesis-forms'

export interface ExistingForm {
  id:   string
  name: string
  rows: AnamnesisRow[]
}

interface Props {
  existing?: ExistingForm | null
  onDone:    () => void
}

const TYPE_ICON: Record<AnamnesisFieldType, ComponentType<{ size?: number }>> = {
  text: Type, textarea: AlignLeft, number: Hash, date: Calendar,
  select: List, radio: CircleDot, checkbox: CheckSquare, section: Heading, photo: ImageIcon,
}

type Drag = { kind: 'new'; type: AnamnesisFieldType } | { kind: 'move'; fieldId: string } | null
type Over = { kind: 'sep'; index: number } | { kind: 'row'; rowId: string } | null

function newField(type: AnamnesisFieldType = 'text'): AnamnesisField {
  return { id: newId(), type, label: '', required: false, ...(OPTION_TYPES.includes(type) ? { options: [''] } : {}) }
}

export function AnamnesisFormBuilder({ existing, onDone }: Props) {
  const [name, setName] = useState(existing?.name ?? '')
  const [rows, setRows] = useState<AnamnesisRow[]>(existing?.rows ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [drag, setDrag] = useState<Drag>(null)
  const [over, setOver] = useState<Over>(null)

  // -- edição de campo --
  function patch(fieldId: string, changes: Partial<AnamnesisField>) {
    setRows(rs => rs.map(r => ({ ...r, fields: r.fields.map(f => f.id === fieldId ? { ...f, ...changes } : f) })))
  }
  function changeType(fieldId: string, type: AnamnesisFieldType) {
    setRows(rs => {
      const copy = rs.map(r => ({ ...r, fields: [...r.fields] }))
      let ri = -1, ci = -1
      for (let i = 0; i < copy.length; i++) { const j = copy[i]!.fields.findIndex(f => f.id === fieldId); if (j >= 0) { ri = i; ci = j; break } }
      if (ri < 0) return rs
      const f = copy[ri]!.fields[ci]!
      const next: AnamnesisField = { ...f, type }
      if (OPTION_TYPES.includes(type)) next.options = f.options?.length ? f.options : ['']
      else delete next.options
      if (type === 'section') next.required = false
      copy[ri]!.fields[ci] = next
      // Seção numa linha com outros campos → isola em nova linha.
      if (type === 'section' && copy[ri]!.fields.length > 1) {
        copy[ri]!.fields.splice(ci, 1)
        copy.splice(ri + 1, 0, { id: newId(), fields: [next] })
      }
      return copy.filter(r => r.fields.length > 0)
    })
  }
  function removeField(fieldId: string) {
    setRows(rs => rs.map(r => ({ ...r, fields: r.fields.filter(f => f.id !== fieldId) })).filter(r => r.fields.length > 0))
  }
  function moveRow(index: number, dir: -1 | 1) {
    setRows(rs => { const j = index + dir; if (j < 0 || j >= rs.length) return rs; const c = [...rs]; [c[index], c[j]] = [c[j]!, c[index]!]; return c })
  }

  // -- opções --
  function setOption(fieldId: string, idx: number, value: string) {
    setRows(rs => rs.map(r => ({ ...r, fields: r.fields.map(f => f.id === fieldId ? { ...f, options: (f.options ?? []).map((o, i) => i === idx ? value : o) } : f) })))
  }
  function addOption(fieldId: string) {
    setRows(rs => rs.map(r => ({ ...r, fields: r.fields.map(f => f.id === fieldId ? { ...f, options: [...(f.options ?? []), ''] } : f) })))
  }
  function removeOption(fieldId: string, idx: number) {
    setRows(rs => rs.map(r => ({ ...r, fields: r.fields.map(f => f.id === fieldId ? { ...f, options: (f.options ?? []).filter((_, i) => i !== idx) } : f) })))
  }

  // -- drag and drop --
  function performDrop(target: { kind: 'sep'; index: number } | { kind: 'row'; rowId: string }) {
    if (!drag) return
    setRows(prev => {
      let list = prev.map(r => ({ ...r, fields: [...r.fields] }))
      let field: AnamnesisField
      if (drag.kind === 'new') {
        field = newField(drag.type)
      } else {
        let found: AnamnesisField | undefined
        for (const r of list) { const i = r.fields.findIndex(f => f.id === drag.fieldId); if (i >= 0) { found = r.fields[i]; r.fields.splice(i, 1); break } }
        list = list.filter(r => r.fields.length > 0)
        if (!found) return prev
        field = found
      }
      const isSection = field.type === 'section'

      if (target.kind === 'sep') {
        const at = Math.max(0, Math.min(target.index, list.length))
        list.splice(at, 0, { id: newId(), fields: [field] })
      } else {
        const ri = list.findIndex(r => r.id === target.rowId)
        if (ri < 0) { list.push({ id: newId(), fields: [field] }) }
        else {
          const row = list[ri]!
          const rowHasSection = row.fields.some(f => f.type === 'section')
          if (isSection || rowHasSection || row.fields.length >= MAX_COLS) {
            list.splice(ri + 1, 0, { id: newId(), fields: [field] })
          } else {
            row.fields.push(field)
          }
        }
      }
      return list
    })
    setDrag(null); setOver(null)
  }

  // -- salvar --
  async function save() {
    setError(null)
    if (!name.trim()) { setError('Informe um nome para a ficha.'); return }
    if (rows.length === 0) { setError('Adicione ao menos um campo à ficha.'); return }
    const cleanRows = rows.map(r => ({
      id: r.id,
      fields: r.fields.map(f => ({
        ...f, label: f.label.trim(),
        options: OPTION_TYPES.includes(f.type) ? (f.options ?? []).map(o => o.trim()).filter(Boolean) : undefined,
      })),
    }))
    const flat = cleanRows.flatMap(r => r.fields)
    if (flat.some(f => !f.label)) { setError('Todos os campos precisam de um rótulo.'); return }
    const badOpts = flat.find(f => OPTION_TYPES.includes(f.type) && (!f.options || f.options.length < 1))
    if (badOpts) { setError(`O campo "${badOpts.label}" precisa de ao menos uma opção.`); return }

    setSaving(true)
    const payload = { name: name.trim(), schema: { rows: cleanRows } }
    const res = existing ? await updateAnamnesisForm({ id: existing.id, ...payload }) : await createAnamnesisForm(payload)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    onDone()
  }

  const Separator = ({ index }: { index: number }) => {
    const active = !!drag && over?.kind === 'sep' && over.index === index
    return (
      <div
        onDragOver={e => { if (drag) { e.preventDefault(); setOver({ kind: 'sep', index }) } }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); performDrop({ kind: 'sep', index }) }}
        style={{
          height: active ? 26 : 8, borderRadius: 8, transition: 'height 120ms, background 120ms',
          background: active ? 'var(--brand-soft)' : 'transparent',
          border: active ? '2px dashed var(--brand)' : '2px dashed transparent',
        }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button type="button" onClick={onDone} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
        <ChevronLeft size={16} /> Voltar às fichas
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Nome da ficha *</label>
        <input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Anamnese — Toxina botulínica" />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Paleta */}
        <aside style={{ flex: '0 0 200px', minWidth: 180 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Blocos</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {FIELD_TYPES.map(t => {
              const Icon = TYPE_ICON[t.value]
              return (
                <div
                  key={t.value}
                  draggable
                  onDragStart={e => { setDrag({ kind: 'new', type: t.value }); e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', `new:${t.value}`) } catch {} }}
                  onDragEnd={() => { setDrag(null); setOver(null) }}
                  title="Arraste para o formulário — solte sobre uma linha para criar colunas"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'grab', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}
                >
                  <Icon size={15} /> {t.label}
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10, lineHeight: 1.5 }}>
            Solte um bloco <strong>sobre uma linha</strong> para adicionar uma coluna (máx. {MAX_COLS}).
            Solte <strong>entre as linhas</strong> para criar uma nova linha.
          </p>
        </aside>

        {/* Canvas */}
        <div style={{ flex: '1 1 380px', minWidth: 0, background: 'var(--bg-app)', border: '1px dashed var(--border)', borderRadius: 12, padding: 12 }}>
          {rows.length === 0 ? (
            <div
              onDragOver={e => { if (drag) { e.preventDefault(); setOver({ kind: 'sep', index: 0 }) } }}
              onDrop={e => { e.preventDefault(); performDrop({ kind: 'sep', index: 0 }) }}
              style={{ minHeight: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: `2px dashed ${drag && over?.kind === 'sep' ? 'var(--brand)' : 'transparent'}`, borderRadius: 10, color: 'var(--text-faint)', fontSize: 13 }}
            >
              Arraste blocos aqui para montar a ficha
            </div>
          ) : (
            <>
              <Separator index={0} />
              {rows.map((row, ri) => {
                const rowOver = !!drag && over?.kind === 'row' && over.rowId === row.id
                return (
                  <div key={row.id}>
                    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
                      {/* Reordenar linha */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center', flexShrink: 0 }}>
                        <IconBtn title="Subir linha" disabled={ri === 0} onClick={() => moveRow(ri, -1)}><ArrowUp size={13} /></IconBtn>
                        <IconBtn title="Descer linha" disabled={ri === rows.length - 1} onClick={() => moveRow(ri, 1)}><ArrowDown size={13} /></IconBtn>
                      </div>
                      {/* Linha (grid de colunas automáticas) */}
                      <div
                        className="anamnesis-row"
                        data-cols={row.fields.length}
                        onDragOver={e => { if (drag) { e.preventDefault(); setOver({ kind: 'row', rowId: row.id }) } }}
                        onDrop={e => { e.preventDefault(); e.stopPropagation(); performDrop({ kind: 'row', rowId: row.id }) }}
                        style={{ flex: 1, minWidth: 0, padding: 6, borderRadius: 10, border: `1.5px solid ${rowOver ? 'var(--brand)' : 'transparent'}`, background: rowOver ? 'var(--brand-soft)' : 'transparent', transition: 'border-color 120ms, background 120ms' }}
                      >
                        {row.fields.map(f => (
                          <FieldCard
                            key={f.id} field={f}
                            dragging={drag?.kind === 'move' && drag.fieldId === f.id}
                            onDragStart={e => {
                              const t = e.target as HTMLElement
                              if (t.closest('input,select,textarea,button,label,a')) { e.preventDefault(); return }
                              setDrag({ kind: 'move', fieldId: f.id }); e.dataTransfer.effectAllowed = 'move'
                              try { e.dataTransfer.setData('text/plain', `move:${f.id}`) } catch {}
                            }}
                            onDragEnd={() => { setDrag(null); setOver(null) }}
                            onChangeType={type => changeType(f.id, type)}
                            onPatch={ch => patch(f.id, ch)}
                            onRemove={() => removeField(f.id)}
                            onSetOption={(i, v) => setOption(f.id, i, v)}
                            onAddOption={() => addOption(f.id)}
                            onRemoveOption={i => removeOption(f.id, i)}
                          />
                        ))}
                      </div>
                    </div>
                    <Separator index={ri + 1} />
                  </div>
                )
              })}
            </>
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

function IconBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled}
      style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  )
}

function FieldCard({ field: f, dragging, onDragStart, onDragEnd, onChangeType, onPatch, onRemove, onSetOption, onAddOption, onRemoveOption }: {
  field: AnamnesisField
  dragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onChangeType: (t: AnamnesisFieldType) => void
  onPatch: (ch: Partial<AnamnesisField>) => void
  onRemove: () => void
  onSetOption: (i: number, v: string) => void
  onAddOption: () => void
  onRemoveOption: (i: number) => void
}) {
  const isSection = f.type === 'section'
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 12px', opacity: dragging ? 0.45 : 1 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span title="Arraste para reordenar" style={{ cursor: 'grab', color: 'var(--text-faint)', display: 'flex', flexShrink: 0 }}><GripVertical size={16} /></span>
        <select className="field" style={{ width: 'auto', flex: '1 1 110px', minWidth: 100, fontSize: 12, padding: '5px 8px' }} value={f.type} onChange={e => onChangeType(e.target.value as AnamnesisFieldType)}>
          {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button type="button" onClick={onRemove} title="Remover" style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <Trash2 size={14} />
        </button>
      </div>

      <input className="field" value={f.label} onChange={e => onPatch({ label: e.target.value })} placeholder={isSection ? 'Título da seção' : 'Pergunta / rótulo do campo'} />

      {OPTION_TYPES.includes(f.type) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Opções</span>
          {(f.options ?? []).map((opt, oi) => (
            <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="field" style={{ flex: 1, fontSize: 12.5, padding: '6px 10px' }} value={opt} onChange={e => onSetOption(oi, e.target.value)} placeholder={`Opção ${oi + 1}`} />
              <button type="button" onClick={() => onRemoveOption(oi)} title="Remover opção" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <X size={13} />
              </button>
            </div>
          ))}
          <button type="button" onClick={onAddOption} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Plus size={13} /> Adicionar opção
          </button>
        </div>
      )}

      {(f.type === 'text' || f.type === 'textarea' || f.type === 'number') && (
        <input className="field" style={{ fontSize: 12.5, padding: '6px 10px' }} value={f.placeholder ?? ''} onChange={e => onPatch({ placeholder: e.target.value })} placeholder="Placeholder (opcional)" />
      )}

      {!isSection && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-soft)' }}>
          <input type="checkbox" checked={!!f.required} onChange={e => onPatch({ required: e.target.checked })} style={{ accentColor: 'var(--brand)', width: 15, height: 15 }} />
          Obrigatório
        </label>
      )}
    </div>
  )
}
