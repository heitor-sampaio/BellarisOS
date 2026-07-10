'use client'

import { useState, type ComponentType } from 'react'
import {
  Plus, Trash2, X, CheckCircle2, ChevronLeft, ArrowUp, ArrowDown,
  ArrowUpToLine, SeparatorHorizontal, Eye, Upload,
  Type, AlignLeft, Hash, Calendar, List, CircleDot, CheckSquare, Heading, Image as ImageIcon,
} from 'lucide-react'
import {
  FIELD_TYPES, FIELD_TYPE_LABEL, OPTION_TYPES, MAX_COLS, newId,
  type AnamnesisField, type AnamnesisFieldType, type AnamnesisRow,
} from '@/lib/anamnesis'
import { createAnamnesisForm, updateAnamnesisForm } from '@/actions/anamnesis-forms'

export interface ExistingForm {
  id:   string
  name: string
  rows: AnamnesisRow[]
}

type SaveResult = { error?: string; id?: string; ok?: true }

interface Props {
  existing?: ExistingForm | null
  onDone:    () => void
  // Ações de persistência injetáveis — default: anamnese (retrocompatível).
  createAction?: (input: { name: string; schema: unknown }) => Promise<SaveResult>
  updateAction?: (input: { id: string; name: string; schema: unknown }) => Promise<SaveResult>
}

const TYPE_ICON: Record<AnamnesisFieldType, ComponentType<{ size?: number }>> = {
  text: Type, textarea: AlignLeft, number: Hash, date: Calendar,
  select: List, radio: CircleDot, checkbox: CheckSquare, section: Heading, photo: ImageIcon,
}

type Drag = { kind: 'new'; type: AnamnesisFieldType } | { kind: 'move'; fieldId: string } | null
type Over = { kind: 'sep'; index: number } | { kind: 'row'; rowId: string } | { kind: 'field'; fieldId: string } | null
type DropTarget = { kind: 'sep'; index: number } | { kind: 'row'; rowId: string } | { kind: 'field'; fieldId: string }

function newField(type: AnamnesisFieldType = 'text'): AnamnesisField {
  return { id: newId(), type, label: '', required: false, ...(OPTION_TYPES.includes(type) ? { options: [''] } : {}) }
}

export function AnamnesisFormBuilder({ existing, onDone, createAction, updateAction }: Props) {
  const createFn = createAction ?? createAnamnesisForm
  const updateFn = updateAction ?? updateAnamnesisForm
  const [name, setName] = useState(existing?.name ?? '')
  const [rows, setRows] = useState<AnamnesisRow[]>(existing?.rows ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [drag, setDrag] = useState<Drag>(null)
  const [over, setOver] = useState<Over>(null)
  const [showAdd, setShowAdd] = useState(false)     // menu do botão + no mobile
  const [editingId, setEditingId] = useState<string | null>(null) // campo aberto no modal
  const [showPreview, setShowPreview] = useState(false)

  function addRowAtEnd(type: AnamnesisFieldType) {
    const id = newId()
    setRows(rs => [...rs, { id: newId(), fields: [{ id, type, label: '', required: false, ...(OPTION_TYPES.includes(type) ? { options: [''] } : {}) }] }])
    setEditingId(id)  // abre as configurações do novo campo
  }

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
  // Junta o campo à linha de cima (cria/aumenta colunas). Botão-alternativa ao arraste.
  function mergeUp(fieldId: string) {
    setRows(rs => {
      const copy = rs.map(r => ({ ...r, fields: [...r.fields] }))
      let ri = -1, ci = -1
      for (let i = 0; i < copy.length; i++) { const j = copy[i]!.fields.findIndex(f => f.id === fieldId); if (j >= 0) { ri = i; ci = j; break } }
      if (ri <= 0) return rs
      const f = copy[ri]!.fields[ci]!
      const prev = copy[ri - 1]!
      if (f.type === 'section' || prev.fields.some(x => x.type === 'section') || prev.fields.length >= MAX_COLS) return rs
      copy[ri]!.fields.splice(ci, 1)
      prev.fields.push(f)
      return copy.filter(r => r.fields.length > 0)
    })
  }
  // Separa o campo em uma linha própria (logo abaixo).
  function splitToNewRow(fieldId: string) {
    setRows(rs => {
      const copy = rs.map(r => ({ ...r, fields: [...r.fields] }))
      let ri = -1, ci = -1
      for (let i = 0; i < copy.length; i++) { const j = copy[i]!.fields.findIndex(f => f.id === fieldId); if (j >= 0) { ri = i; ci = j; break } }
      if (ri < 0 || copy[ri]!.fields.length <= 1) return rs
      const [f] = copy[ri]!.fields.splice(ci, 1)
      copy.splice(ri + 1, 0, { id: newId(), fields: [f!] })
      return copy
    })
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
  function performDrop(target: DropTarget) {
    if (!drag) return
    const dragSnapshot = drag
    setRows(prev => {
      let list = prev.map(r => ({ ...r, fields: [...r.fields] }))
      let field: AnamnesisField
      if (dragSnapshot.kind === 'new') {
        field = newField(dragSnapshot.type)
      } else {
        let found: AnamnesisField | undefined
        for (const r of list) { const i = r.fields.findIndex(f => f.id === dragSnapshot.fieldId); if (i >= 0) { found = r.fields[i]; r.fields.splice(i, 1); break } }
        list = list.filter(r => r.fields.length > 0)
        if (!found) return prev
        field = found
      }
      const isSection = field.type === 'section'
      const canAddToRow = (row: AnamnesisRow) => !isSection && !row.fields.some(f => f.type === 'section') && row.fields.length < MAX_COLS

      if (target.kind === 'sep') {
        const at = Math.max(0, Math.min(target.index, list.length))
        list.splice(at, 0, { id: newId(), fields: [field] })
      } else if (target.kind === 'field') {
        // Inserir ANTES do campo alvo (reordenar colunas / posicionar na linha)
        let tri = -1, tci = -1
        for (let i = 0; i < list.length; i++) { const j = list[i]!.fields.findIndex(f => f.id === target.fieldId); if (j >= 0) { tri = i; tci = j; break } }
        if (tri < 0) { list.push({ id: newId(), fields: [field] }) }
        else if (canAddToRow(list[tri]!)) { list[tri]!.fields.splice(tci, 0, field) }
        else { list.splice(tri, 0, { id: newId(), fields: [field] }) }
      } else {
        // 'row' — anexa ao fim da linha
        const ri = list.findIndex(r => r.id === target.rowId)
        if (ri < 0) { list.push({ id: newId(), fields: [field] }) }
        else if (canAddToRow(list[ri]!)) { list[ri]!.fields.push(field) }
        else { list.splice(ri + 1, 0, { id: newId(), fields: [field] }) }
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
    const res = existing ? await updateFn({ id: existing.id, ...payload }) : await createFn(payload)
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
          height: active ? 24 : 6, borderRadius: 8, transition: 'height 120ms, background 120ms',
          background: active ? 'var(--brand-soft)' : 'transparent',
          border: active ? '2px dashed var(--brand)' : '2px dashed transparent',
        }}
      />
    )
  }

  const editingField = editingId ? rows.flatMap(r => r.fields).find(f => f.id === editingId) ?? null : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={onDone} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          <ChevronLeft size={16} /> Voltar às fichas
        </button>
        <button type="button" onClick={() => setShowPreview(true)} className="btn-secondary" style={{ fontSize: 13 }}>
          <Eye size={15} /> Pré-visualizar
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Nome da ficha *</label>
        <input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Anamnese — Toxina botulínica" />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Paleta (desktop) */}
        <aside className="anamnesis-palette" style={{ flex: '0 0 200px', minWidth: 180 }}>
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
                  onClick={() => addRowAtEnd(t.value)}
                  title="Arraste para o formulário (ou clique para adicionar ao fim)"
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
        <div className="anamnesis-canvas" style={{ flex: '1 1 380px', minWidth: 0, background: 'var(--bg-app)', border: '1px dashed var(--border)', borderRadius: 12, padding: 10 }}>
          {rows.length === 0 ? (
            <div
              onDragOver={e => { if (drag) { e.preventDefault(); setOver({ kind: 'sep', index: 0 }) } }}
              onDrop={e => { e.preventDefault(); performDrop({ kind: 'sep', index: 0 }) }}
              style={{ minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: `2px dashed ${drag && over?.kind === 'sep' ? 'var(--brand)' : 'transparent'}`, borderRadius: 10, color: 'var(--text-faint)', fontSize: 13, padding: '8px' }}
            >
              Arraste um bloco aqui ou toque em <strong style={{ margin: '0 3px' }}>+</strong> para adicionar
            </div>
          ) : (
            <>
              <Separator index={0} />
              {rows.map((row, ri) => {
                const rowOver = !!drag && over?.kind === 'row' && over.rowId === row.id
                return (
                  <div key={row.id}>
                    <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                      {/* Reordenar linha */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', flexShrink: 0 }}>
                        <IconBtn title="Subir linha" disabled={ri === 0} onClick={() => moveRow(ri, -1)}><ArrowUp size={13} /></IconBtn>
                        <IconBtn title="Descer linha" disabled={ri === rows.length - 1} onClick={() => moveRow(ri, 1)}><ArrowDown size={13} /></IconBtn>
                      </div>
                      {/* Linha (grid de colunas automáticas) */}
                      <div
                        className="anamnesis-row"
                        data-cols={row.fields.length}
                        onDragOver={e => { if (drag) { e.preventDefault(); setOver({ kind: 'row', rowId: row.id }) } }}
                        onDrop={e => { e.preventDefault(); e.stopPropagation(); performDrop({ kind: 'row', rowId: row.id }) }}
                        style={{ flex: 1, minWidth: 0, padding: 4, borderRadius: 10, border: `1.5px solid ${rowOver ? 'var(--brand)' : 'transparent'}`, background: rowOver ? 'var(--brand-soft)' : 'transparent', transition: 'border-color 120ms, background 120ms' }}
                      >
                        {row.fields.map(f => {
                          const prev = rows[ri - 1]
                          const canMergeUp = ri > 0 && f.type !== 'section' && !!prev && prev.fields.length < MAX_COLS && !prev.fields.some(x => x.type === 'section')
                          const canSplit = row.fields.length > 1
                          return (
                            <FieldCard
                              key={f.id} field={f}
                              dragging={drag?.kind === 'move' && drag.fieldId === f.id}
                              insertHighlight={!!drag && over?.kind === 'field' && over.fieldId === f.id && !(drag.kind === 'move' && drag.fieldId === f.id)}
                              canMergeUp={canMergeUp} canSplit={canSplit}
                              onMergeUp={() => mergeUp(f.id)} onSplit={() => splitToNewRow(f.id)}
                              onOpen={() => setEditingId(f.id)}
                              onRemove={() => removeField(f.id)}
                              onDragStart={e => {
                                const t = e.target as HTMLElement
                                if (t.closest('button,a')) { e.preventDefault(); return }
                                setDrag({ kind: 'move', fieldId: f.id }); e.dataTransfer.effectAllowed = 'move'
                                try { e.dataTransfer.setData('text/plain', `move:${f.id}`) } catch {}
                              }}
                              onDragEnd={() => { setDrag(null); setOver(null) }}
                              onDragOverField={e => { if (drag) { e.preventDefault(); e.stopPropagation(); setOver({ kind: 'field', fieldId: f.id }) } }}
                              onDropField={e => { e.preventDefault(); e.stopPropagation(); performDrop({ kind: 'field', fieldId: f.id }) }}
                            />
                          )
                        })}
                      </div>
                    </div>
                    <Separator index={ri + 1} />
                  </div>
                )
              })}
            </>
          )}

          {/* Mobile: botão + rosé abaixo do último campo */}
          <div className="anamnesis-add-mobile" style={{ flexDirection: 'column', gap: 8, marginTop: rows.length ? 10 : 0 }}>
            {!showAdd ? (
              <button
                type="button" onClick={() => setShowAdd(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 12, borderRadius: 12, border: 'none', background: 'var(--brand)', color: 'var(--on-brand)', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: 'var(--shadow-brand-btn)' }}
              >
                <Plus size={18} /> Adicionar campo
              </button>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Escolha um bloco</span>
                  <button type="button" onClick={() => setShowAdd(false)} title="Fechar" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {FIELD_TYPES.map(t => {
                    const Icon = TYPE_ICON[t.value]
                    return (
                      <button
                        key={t.value} type="button"
                        onClick={() => { addRowAtEnd(t.value); setShowAdd(false) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <Icon size={15} /> {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 600 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
        <button type="button" onClick={onDone} className="btn-secondary" disabled={saving}>Cancelar</button>
        <button type="button" onClick={save} className="btn-primary" disabled={saving}>
          <CheckCircle2 size={15} /> {saving ? 'Salvando…' : (existing ? 'Salvar ficha' : 'Criar ficha')}
        </button>
      </div>

      {editingField && (
        <FieldSettingsModal
          field={editingField}
          onChangeType={type => changeType(editingField.id, type)}
          onPatch={ch => patch(editingField.id, ch)}
          onSetOption={(i, v) => setOption(editingField.id, i, v)}
          onAddOption={() => addOption(editingField.id)}
          onRemoveOption={i => removeOption(editingField.id, i)}
          onClose={() => setEditingId(null)}
        />
      )}

      {showPreview && (
        <FormPreviewModal name={name} rows={rows} onClose={() => setShowPreview(false)} />
      )}
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

function CardBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; title: string; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: danger ? '#dc2626' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      {children}
    </button>
  )
}

// Bloco compacto no canvas: só rótulo + tipo + ações. Clique abre o modal.
function FieldCard({ field: f, dragging, insertHighlight, canMergeUp, canSplit, onMergeUp, onSplit, onOpen, onRemove, onDragStart, onDragEnd, onDragOverField, onDropField }: {
  field: AnamnesisField
  dragging: boolean
  insertHighlight: boolean
  canMergeUp: boolean
  canSplit: boolean
  onMergeUp: () => void
  onSplit: () => void
  onOpen: () => void
  onRemove: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOverField: (e: React.DragEvent) => void
  onDropField: (e: React.DragEvent) => void
}) {
  const Icon = TYPE_ICON[f.type]
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn() }
  return (
    <div
      draggable onClick={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onDragOver={onDragOverField} onDrop={onDropField}
      title="Clique para configurar"
      style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, background: 'var(--surface)', border: `1px solid ${insertHighlight ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 10, padding: '7px 8px', cursor: 'pointer', opacity: dragging ? 0.45 : 1, boxShadow: insertHighlight ? 'inset 3px 0 0 var(--brand)' : undefined }}
    >
      <span style={{ display: 'flex', color: 'var(--brand)', flexShrink: 0 }}><Icon size={15} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: f.label ? 'var(--text)' : 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.label || 'Sem título'}
        </p>
        <p style={{ fontSize: 10, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {FIELD_TYPE_LABEL[f.type]}{f.required ? ' · obrig.' : ''}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {canMergeUp && <CardBtn title="Juntar na linha de cima" onClick={stop(onMergeUp)}><ArrowUpToLine size={12} /></CardBtn>}
        {canSplit && <CardBtn title="Separar em nova linha" onClick={stop(onSplit)}><SeparatorHorizontal size={12} /></CardBtn>}
        <CardBtn title="Remover" danger onClick={stop(onRemove)}><Trash2 size={12} /></CardBtn>
      </div>
    </div>
  )
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>{label}</label>
      {children}
    </div>
  )
}

// Configurações específicas do campo — modal.
function FieldSettingsModal({ field: f, onChangeType, onPatch, onSetOption, onAddOption, onRemoveOption, onClose }: {
  field: AnamnesisField
  onChangeType: (t: AnamnesisFieldType) => void
  onPatch: (ch: Partial<AnamnesisField>) => void
  onSetOption: (i: number, v: string) => void
  onAddOption: () => void
  onRemoveOption: (i: number) => void
  onClose: () => void
}) {
  const isSection = f.type === 'section'
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(34,22,25,0.45)', backdropFilter: 'blur(2px)', zIndex: 500 }} />
      <div role="dialog" aria-modal="true"
        style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(440px, calc(100vw - 24px))', maxHeight: '88dvh', overflowY: 'auto', zIndex: 501, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: '0 24px 64px rgba(34,22,25,0.22)' }}
      >
        <div style={{ position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--hairline)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Configurar campo</span>
          <button type="button" onClick={onClose} title="Fechar" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ModalField label="Tipo do campo">
            <select className="field" value={f.type} onChange={e => onChangeType(e.target.value as AnamnesisFieldType)}>
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </ModalField>

          <ModalField label={isSection ? 'Título da seção' : 'Rótulo / pergunta'}>
            <input className="field" value={f.label} onChange={e => onPatch({ label: e.target.value })} placeholder={isSection ? 'Ex: Histórico de saúde' : 'Ex: Você tem alergias?'} autoFocus />
          </ModalField>

          {OPTION_TYPES.includes(f.type) && (
            <ModalField label="Opções">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(f.options ?? []).map((opt, oi) => (
                  <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input className="field" style={{ flex: 1 }} value={opt} onChange={e => onSetOption(oi, e.target.value)} placeholder={`Opção ${oi + 1}`} />
                    <button type="button" onClick={() => onRemoveOption(oi)} title="Remover opção" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={onAddOption} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <Plus size={14} /> Adicionar opção
                </button>
              </div>
            </ModalField>
          )}

          {(f.type === 'text' || f.type === 'textarea' || f.type === 'number') && (
            <ModalField label="Placeholder (opcional)">
              <input className="field" value={f.placeholder ?? ''} onChange={e => onPatch({ placeholder: e.target.value })} placeholder="Texto de exemplo dentro do campo" />
            </ModalField>
          )}

          {!isSection && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-soft)' }}>
              <input type="checkbox" checked={!!f.required} onChange={e => onPatch({ required: e.target.checked })} style={{ accentColor: 'var(--brand)', width: 15, height: 15 }} />
              Campo obrigatório
            </label>
          )}
        </div>

        <div style={{ padding: '0 18px 18px', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn-primary">Concluir</button>
        </div>
      </div>
    </>
  )
}

// Pré-visualização da ficha (somente leitura) — modal.
function FormPreviewModal({ name, rows, onClose }: { name: string; rows: AnamnesisRow[]; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(34,22,25,0.45)', backdropFilter: 'blur(2px)', zIndex: 500 }} />
      <div role="dialog" aria-modal="true"
        style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(560px, calc(100vw - 24px))', maxHeight: '90dvh', overflowY: 'auto', zIndex: 501, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: '0 24px 64px rgba(34,22,25,0.22)' }}
      >
        <div style={{ position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--hairline)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Pré-visualização</span>
          <button type="button" onClick={onClose} title="Fechar" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: '18px 18px 24px' }}>
          {name.trim() && <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', marginBottom: 16 }}>{name}</p>}
          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: '24px 0' }}>Nenhum campo ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {rows.map(row => (
                <div key={row.id} className="anamnesis-row" data-cols={row.fields.length}>
                  {row.fields.map(f => <PreviewField key={f.id} field={f} />)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function PreviewField({ field: f }: { field: AnamnesisField }) {
  if (f.type === 'section') {
    return (
      <div style={{ marginTop: 4, paddingBottom: 4, borderBottom: '1px solid var(--hairline)' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label || 'Seção'}</p>
      </div>
    )
  }
  const opts = f.options ?? []
  return (
    <div>
      <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 6, display: 'block' }}>
        {f.label || 'Sem título'}{f.required && <span style={{ color: 'var(--brand)' }}> *</span>}
      </label>
      {f.type === 'text' && <input className="field" disabled placeholder={f.placeholder} />}
      {f.type === 'textarea' && <textarea className="field" rows={3} disabled placeholder={f.placeholder} style={{ resize: 'vertical' }} />}
      {f.type === 'number' && <input className="field" type="number" disabled placeholder={f.placeholder} />}
      {f.type === 'date' && <input className="field" type="date" disabled />}
      {f.type === 'select' && (
        <select className="field" disabled defaultValue="">
          <option value="">Selecione…</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {f.type === 'radio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {opts.map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-soft)' }}>
              <input type="radio" disabled style={{ accentColor: 'var(--brand)' }} /> {o}
            </label>
          ))}
        </div>
      )}
      {f.type === 'checkbox' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {opts.map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-soft)' }}>
              <input type="checkbox" disabled style={{ accentColor: 'var(--brand)', width: 15, height: 15 }} /> {o}
            </label>
          ))}
        </div>
      )}
      {f.type === 'photo' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1.5px dashed var(--border)', background: 'var(--bg-app)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
          <Upload size={16} /> Enviar foto
        </div>
      )}
    </div>
  )
}
