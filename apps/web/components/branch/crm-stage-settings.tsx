'use client'

import {
  useRef, useCallback, useState, useActionState, useTransition, useEffect,
} from 'react'
import { X, Settings2, GripVertical, Trash2, Plus, CheckCircle2 } from 'lucide-react'
import type { CRMStage } from '@/actions/crm-stages'
import {
  createStage, renameStage, updateStageColor, deleteStage, reorderStages,
} from '@/actions/crm-stages'
import { useRouter } from 'next/navigation'

// Converte hex em versão suave (hex 8 dígitos com alpha)
function softBg(hex: string)     { return hex + '18' }
function softBorder(hex: string) { return hex + '50' }

interface CRMStageSettingsProps {
  slug:   string
  stages: CRMStage[]
}

// --- Linha de etapa ----------------------------------------------
function StageRow({
  stage, slug,
  isDragging, onDragStart, onDragEnd,
}: {
  stage:       CRMStage
  slug:        string
  isDragging:  boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd:   () => void
}) {
  const colorRef   = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(stage.name)
  const [color, setColor] = useState(stage.color)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [_pending, start] = useTransition()
  const router = useRouter()

  function handleNameBlur() {
    if (name.trim() && name.trim() !== stage.name) {
      start(() => renameStage(stage.id, name, slug))
    }
  }

  function handleColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const c = e.target.value
    setColor(c)
    start(() => updateStageColor(stage.id, c, slug))
  }

  async function handleDelete() {
    setDeleteErr(null)
    const res = await deleteStage(stage.id, slug)
    if (res?.error) { setDeleteErr(res.error); return }
    router.refresh()
  }

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, stage.id)}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 10,
        border: '1px solid var(--border)',
        background: isDragging ? 'var(--bg-app)' : 'var(--surface)',
        opacity: isDragging ? 0.4 : 1,
        cursor: 'default',
        transition: 'opacity 120ms',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        {/* Drag handle */}
        <span style={{ color: 'var(--text-faint)', cursor: 'grab', flexShrink: 0 }}>
          <GripVertical size={14} />
        </span>

        {/* Color picker (dot clicável) */}
        <button
          type="button"
          title="Escolher cor"
          onClick={() => colorRef.current?.click()}
          style={{
            width: 20, height: 20, borderRadius: '50%',
            background: color,
            border: `2px solid ${softBorder(color)}`,
            cursor: 'pointer', flexShrink: 0,
            boxShadow: `0 0 0 3px ${softBg(color)}`,
          }}
        />
        <input
          ref={colorRef} type="color" value={color}
          onChange={handleColorChange}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        />

        {/* Nome */}
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleNameBlur}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13.5, fontWeight: 700, color: 'var(--text)',
            padding: '2px 4px', borderRadius: 6,
          }}
          onFocus={e => { e.currentTarget.style.background = 'var(--bg-app)'; e.currentTarget.style.outline = `2px solid ${color}` }}
          onBlurCapture={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.outline = 'none' }}
        />

        {/* Botão excluir */}
        <button
          type="button"
          onClick={handleDelete}
          title="Excluir etapa"
          style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            border: '1px solid var(--border)', background: 'var(--bg-app)',
            color: 'var(--text-faint)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {deleteErr && (
        <p style={{ fontSize: 11.5, color: 'var(--warning)', fontWeight: 700, width: '100%', paddingLeft: 44 }}>
          {deleteErr}
        </p>
      )}
    </div>
  )
}

// --- Modal de configuração ----------------------------------------
export function CRMStageSettings({ slug, stages: initialStages }: CRMStageSettingsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router    = useRouter()
  const open      = useCallback(() => dialogRef.current?.showModal(), [])
  const close     = useCallback(() => dialogRef.current?.close(),     [])

  const [stages, setStages] = useState<CRMStage[]>(initialStages)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overIdx,    setOverIdx]    = useState<number | null>(null)
  const enterCounts = useRef<Record<string, number>>({})
  const [_pending, startReorder] = useTransition()

  // Sync com server (revalidate atualiza initialStages via page)
  useEffect(() => { setStages(initialStages) }, [initialStages])

  // --- DnD para reordenar --------------------------------------
  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setOverIdx(null)
    enterCounts.current = {}
  }

  function handleDragEnter(e: React.DragEvent, idx: number) {
    e.preventDefault()
    const key = String(idx)
    enterCounts.current[key] = (enterCounts.current[key] ?? 0) + 1
    setOverIdx(idx)
  }

  function handleDragLeave(_e: React.DragEvent, idx: number) {
    const key = String(idx)
    enterCounts.current[key] = Math.max((enterCounts.current[key] ?? 1) - 1, 0)
    if (enterCounts.current[key] === 0) setOverIdx(null)
  }

  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault()
    const id       = e.dataTransfer.getData('text/plain')
    const fromIdx  = stages.findIndex(s => s.id === id)
    if (fromIdx === -1 || fromIdx === targetIdx) {
      setDraggingId(null); setOverIdx(null); enterCounts.current = {}
      return
    }

    const next = [...stages]
    const [moved] = next.splice(fromIdx, 1)
    if (!moved) { setDraggingId(null); setOverIdx(null); enterCounts.current = {}; return }
    next.splice(targetIdx, 0, moved)
    const reordered = next.map((s, i) => ({ ...s, position: i }))

    setStages(reordered)
    setDraggingId(null); setOverIdx(null); enterCounts.current = {}

    startReorder(() => reorderStages(reordered.map(s => s.id), slug))
  }

  // --- Adicionar nova etapa -------------------------------------
  const [newState, newAction, newPending] = useActionState(createStage, undefined)

  useEffect(() => {
    if (newState?.success) {
      router.refresh()
    }
  }, [newState?.success])

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Configurar funil"
        style={{
          width: 34, height: 34, borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Settings2 size={15} />
      </button>

      <dialog
        ref={dialogRef}
        className="modal"
        style={{ maxWidth: 460 } as React.CSSProperties}
        onClick={e => { if (e.target === dialogRef.current) close() }}
      >
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--hairline)',
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
              Configurar funil
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Arraste para reordenar · clique no círculo para mudar a cor
            </p>
          </div>
          <button type="button" onClick={close} style={{
            width: 32, height: 32, borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-app)', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Lista de etapas */}
          {stages.map((stage, idx) => (
            <div
              key={stage.id}
              onDragEnter={e => handleDragEnter(e, idx)}
              onDragLeave={e => handleDragLeave(e, idx)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, idx)}
              style={{
                outline: overIdx === idx && draggingId !== stage.id
                  ? '2px dashed var(--brand)'
                  : '2px solid transparent',
                borderRadius: 12,
                transition: 'outline 100ms',
              }}
            >
              <StageRow
                stage={stage}
                slug={slug}
                isDragging={draggingId === stage.id}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            </div>
          ))}

          {/* Adicionar nova etapa */}
          <div style={{
            marginTop: 8,
            borderTop: '1px solid var(--hairline)',
            paddingTop: 16,
          }}>
            <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 10 }}>
              NOVA ETAPA
            </p>
            <form action={newAction} style={{ display: 'flex', gap: 8 }}>
              <input type="hidden" name="_slug" value={slug} />
              <input
                name="name" type="text" className="field"
                placeholder="Nome da etapa"
                required
                style={{ flex: 1 }}
              />
              <input
                name="color" type="color"
                defaultValue="#c34d6b"
                title="Cor da etapa"
                style={{
                  width: 38, height: 38, borderRadius: 10,
                  border: '1px solid var(--border)', cursor: 'pointer',
                  padding: 3, background: 'var(--surface)',
                }}
              />
              <button type="submit" disabled={newPending} className="btn-primary" style={{ flexShrink: 0 }}>
                <Plus size={14} />
                {newPending ? 'Adicionando…' : 'Adicionar'}
              </button>
            </form>

            {newState?.error && (
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--warning)', fontWeight: 700 }}>
                {newState.error}
              </p>
            )}
            {newState?.success && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle2 size={13} /> Etapa adicionada.
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  )
}
