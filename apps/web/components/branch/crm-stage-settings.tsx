'use client'

import {
  useRef, useCallback, useState, useActionState, useTransition, useEffect, useMemo,
} from 'react'
import {
  X, Settings2, GripVertical, Trash2, Plus, CheckCircle2, Star, Archive, ArchiveRestore,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  OUTCOME_COPY, OUTCOME_VALUES,
  type CRMFunnel, type CRMStage, type StageOutcome,
} from '@/lib/crm'
import {
  createStage, renameStage, updateStageColor, updateStageOutcome, deleteStage, reorderStages,
} from '@/actions/crm-stages'
import {
  createFunnel, renameFunnel, setDefaultFunnel, setFunnelArchived, deleteFunnel, reorderFunnels,
} from '@/actions/crm-funnels'

// Converte hex em versão suave (hex 8 dígitos com alpha)
function softBg(hex: string)     { return hex + '18' }
function softBorder(hex: string) { return hex + '50' }

interface CRMStageSettingsProps {
  slug: string
  /** Todos os funis da rede, inclusive arquivados. */
  funnels: CRMFunnel[]
  /** Etapas de todos os funis — o detalhe filtra pelo funil selecionado. */
  stages: CRMStage[]
  /** Funil aberto no quadro, para o modal abrir já nele. */
  activeFunnelId: string
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
  const [name, setName]   = useState(stage.name)
  const [color, setColor] = useState(stage.color)
  const [outcome, setOutcome] = useState<StageOutcome>(stage.outcome)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [_pending, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    setName(stage.name); setColor(stage.color); setOutcome(stage.outcome)
  }, [stage.id, stage.name, stage.color, stage.outcome])

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

  async function handleOutcomeChange(next: StageOutcome) {
    setOutcome(next)
    const res = await updateStageOutcome(stage.id, next, slug)
    if (res?.error) { setDeleteErr(res.error); setOutcome(stage.outcome); return }
    router.refresh()
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
            flex: 1, minWidth: 60, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13.5, fontWeight: 700, color: 'var(--text)',
            padding: '2px 4px', borderRadius: 6,
          }}
          onFocus={e => { e.currentTarget.style.background = 'var(--bg-app)'; e.currentTarget.style.outline = `2px solid ${color}` }}
          onBlurCapture={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.outline = 'none' }}
        />

        {/* Resultado: é o que dá conversão própria ao funil */}
        <select
          value={outcome}
          title={OUTCOME_COPY[outcome].hint}
          onChange={e => handleOutcomeChange(e.target.value as StageOutcome)}
          style={{
            flexShrink: 0, borderRadius: 8, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--bg-app)',
            color: outcome === 'OPEN' ? 'var(--text-muted)'
              : outcome === 'WON' ? 'var(--success)' : 'var(--text-faint)',
            fontSize: 11.5, fontWeight: 700, padding: '4px 6px',
          }}
        >
          {OUTCOME_VALUES.map(v => (
            <option key={v} value={v}>{OUTCOME_COPY[v].label}</option>
          ))}
        </select>

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

// --- Linha de funil (coluna mestre) ------------------------------
function FunnelRow({
  funnel, slug, selected, etapas, onSelect,
  isDragging, onDragStart, onDragEnd, onError,
}: {
  funnel:      CRMFunnel
  slug:        string
  selected:    boolean
  etapas:      number
  onSelect:    () => void
  isDragging:  boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd:   () => void
  onError:     (msg: string | null) => void
}) {
  const [name, setName] = useState(funnel.name)
  const [_pending, start] = useTransition()
  const router = useRouter()
  const arquivado = funnel.archived_at !== null

  useEffect(() => { setName(funnel.name) }, [funnel.id, funnel.name])

  function handleNameBlur() {
    if (name.trim() && name.trim() !== funnel.name) {
      start(() => renameFunnel(funnel.id, name, slug))
    }
  }

  async function rodar(fn: () => Promise<{ error?: string } | void>) {
    onError(null)
    const res = await fn()
    if (res && 'error' in res && res.error) { onError(res.error); return }
    router.refresh()
  }

  return (
    <div
      draggable={!arquivado}
      onDragStart={e => onDragStart(e, funnel.id)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 10px', borderRadius: 10,
        cursor: 'pointer',
        opacity: isDragging ? 0.4 : arquivado ? 0.55 : 1,
        // Selecionado é o único preenchido — hierarquia por preenchimento.
        background: selected ? 'var(--brand-soft)' : 'var(--surface)',
        border: `1px solid ${selected ? 'var(--brand-soft-border)' : 'var(--border)'}`,
        transition: 'background 120ms, border-color 120ms',
      }}
    >
      {!arquivado && (
        <span style={{ color: 'var(--text-faint)', cursor: 'grab', flexShrink: 0 }}>
          <GripVertical size={13} />
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleNameBlur}
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em',
            color: selected ? 'var(--brand)' : 'var(--text)',
            padding: '1px 3px', borderRadius: 6,
          }}
        />
        <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 600, paddingLeft: 3 }}>
          {etapas} etapa{etapas === 1 ? '' : 's'}
          {funnel.is_default && ' · padrão'}
          {arquivado && ' · arquivado'}
        </span>
      </div>

      {/* Padrão: onde caem os leads que chegam sozinhos e a base do dashboard */}
      {!funnel.is_default && !arquivado && (
        <IconBtn
          title="Tornar padrão"
          onClick={e => { e.stopPropagation(); rodar(() => setDefaultFunnel(funnel.id, slug)) }}
        >
          <Star size={12} />
        </IconBtn>
      )}
      {funnel.is_default && (
        <span title="Funil padrão" style={{ color: 'var(--brand)', flexShrink: 0, display: 'flex' }}>
          <Star size={12} fill="currentColor" />
        </span>
      )}

      <IconBtn
        title={arquivado ? 'Reativar funil' : 'Arquivar funil'}
        onClick={e => {
          e.stopPropagation()
          rodar(() => setFunnelArchived(funnel.id, !arquivado, slug))
        }}
      >
        {arquivado ? <ArchiveRestore size={12} /> : <Archive size={12} />}
      </IconBtn>

      <IconBtn
        title="Excluir funil"
        onClick={e => { e.stopPropagation(); rodar(() => deleteFunnel(funnel.id, slug)) }}
      >
        <Trash2 size={12} />
      </IconBtn>
    </div>
  )
}

function IconBtn({
  title, onClick, children,
}: {
  title: string
  onClick: (e: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button" title={title} onClick={onClick}
      style={{
        width: 24, height: 24, borderRadius: 7, flexShrink: 0,
        border: '1px solid var(--border)', background: 'var(--bg-app)',
        color: 'var(--text-faint)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}

// --- Modal de configuração ----------------------------------------
export function CRMStageSettings({
  slug, funnels: initialFunnels, stages: initialStages, activeFunnelId,
}: CRMStageSettingsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router    = useRouter()
  const close     = useCallback(() => dialogRef.current?.close(), [])

  const [funnels, setFunnels] = useState<CRMFunnel[]>(initialFunnels)
  const [stages,  setStages]  = useState<CRMStage[]>(initialStages)
  const [selectedId, setSelectedId] = useState(activeFunnelId)
  const [mostrarArquivados, setMostrarArquivados] = useState(false)
  const [funnelErr, setFunnelErr] = useState<string | null>(null)

  const [draggingStage,  setDraggingStage]  = useState<string | null>(null)
  const [overStageIdx,   setOverStageIdx]   = useState<number | null>(null)
  const [draggingFunnel, setDraggingFunnel] = useState<string | null>(null)
  const [overFunnelIdx,  setOverFunnelIdx]  = useState<number | null>(null)
  const enterCounts = useRef<Record<string, number>>({})
  const [_pending, startReorder] = useTransition()

  // Sync com o servidor (revalidate atualiza as props pela página)
  useEffect(() => { setFunnels(initialFunnels) }, [initialFunnels])
  useEffect(() => { setStages(initialStages) },   [initialStages])

  // Abrir a engrenagem com a navegação do seletor ainda em voo pegava o funil
  // anterior. Quando a prop chega, a seleção acompanha.
  useEffect(() => { setSelectedId(activeFunnelId) }, [activeFunnelId])

  const open = useCallback(() => {
    setSelectedId(activeFunnelId)
    setFunnelErr(null)
    dialogRef.current?.showModal()
  }, [activeFunnelId])

  const visiveis = useMemo(
    () => funnels.filter(f => mostrarArquivados || f.archived_at === null),
    [funnels, mostrarArquivados],
  )
  const arquivados = funnels.filter(f => f.archived_at !== null).length

  // O funil selecionado pode ter sido excluído ou arquivado por outra aba.
  const selecionado = funnels.find(f => f.id === selectedId) ?? visiveis[0] ?? funnels[0]
  const etapasDoFunil = useMemo(
    () => stages
      .filter(s => s.funnel_id === selecionado?.id)
      .sort((a, b) => a.position - b.position),
    [stages, selecionado?.id],
  )

  // --- DnD: etapas ----------------------------------------------
  function limparDnD() {
    setDraggingStage(null); setOverStageIdx(null)
    setDraggingFunnel(null); setOverFunnelIdx(null)
    enterCounts.current = {}
  }

  function handleStageDragStart(e: React.DragEvent, id: string) {
    setDraggingStage(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  function handleEnter(e: React.DragEvent, key: string, set: (i: number) => void, idx: number) {
    e.preventDefault()
    enterCounts.current[key] = (enterCounts.current[key] ?? 0) + 1
    set(idx)
  }

  function handleLeave(key: string, clear: () => void) {
    enterCounts.current[key] = Math.max((enterCounts.current[key] ?? 1) - 1, 0)
    if (enterCounts.current[key] === 0) clear()
  }

  function handleStageDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault()
    const id      = e.dataTransfer.getData('text/plain')
    const fromIdx = etapasDoFunil.findIndex(s => s.id === id)
    if (fromIdx === -1 || fromIdx === targetIdx) { limparDnD(); return }

    const next = [...etapasDoFunil]
    const [moved] = next.splice(fromIdx, 1)
    if (!moved) { limparDnD(); return }
    next.splice(targetIdx, 0, moved)
    const reordenadas = next.map((s, i) => ({ ...s, position: i }))

    // Só as etapas deste funil mudam de posição; as dos outros ficam como estão.
    setStages(prev => [
      ...prev.filter(s => s.funnel_id !== selecionado?.id),
      ...reordenadas,
    ])
    limparDnD()
    startReorder(() => reorderStages(reordenadas.map(s => s.id), slug))
  }

  // --- DnD: funis -----------------------------------------------
  function handleFunnelDragStart(e: React.DragEvent, id: string) {
    setDraggingFunnel(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  function handleFunnelDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault()
    const id      = e.dataTransfer.getData('text/plain')
    const ativos  = funnels.filter(f => f.archived_at === null)
    const fromIdx = ativos.findIndex(f => f.id === id)
    if (fromIdx === -1 || fromIdx === targetIdx) { limparDnD(); return }

    const next = [...ativos]
    const [moved] = next.splice(fromIdx, 1)
    if (!moved) { limparDnD(); return }
    next.splice(targetIdx, 0, moved)
    const reordenados = next.map((f, i) => ({ ...f, position: i }))

    setFunnels(prev => [
      ...reordenados,
      ...prev.filter(f => f.archived_at !== null),
    ])
    limparDnD()
    startReorder(() => reorderFunnels(reordenados.map(f => f.id), slug))
  }

  // --- Formulários ----------------------------------------------
  const [stageState, stageAction, stagePending] = useActionState(createStage,  undefined)
  const [funnelState, funnelAction, funnelPending] = useActionState(createFunnel, undefined)

  useEffect(() => { if (stageState?.success)  router.refresh() }, [stageState?.success])
  useEffect(() => { if (funnelState?.success) router.refresh() }, [funnelState?.success])

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Configurar funis"
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
        style={{ maxWidth: 820 } as React.CSSProperties}
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
              Configurar funis
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Arraste para reordenar · clique no círculo para mudar a cor · o resultado da etapa alimenta a conversão
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

        {/* Body: funis à esquerda, etapas do selecionado à direita */}
        <div className="master-detail" style={{ padding: '20px 24px 28px' }}>

          {/* -- Mestre: funis -- */}
          <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p className="overline" style={{ marginBottom: 2 }}>FUNIS</p>

            {visiveis.map((f, idx) => (
              <div
                key={f.id}
                onDragEnter={e => handleEnter(e, `f${idx}`, setOverFunnelIdx, idx)}
                onDragLeave={() => handleLeave(`f${idx}`, () => setOverFunnelIdx(null))}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleFunnelDrop(e, idx)}
                style={{
                  outline: overFunnelIdx === idx && draggingFunnel !== f.id
                    ? '2px dashed var(--brand)' : '2px solid transparent',
                  borderRadius: 12,
                  transition: 'outline 100ms',
                }}
              >
                <FunnelRow
                  funnel={f}
                  slug={slug}
                  selected={f.id === selecionado?.id}
                  etapas={stages.filter(s => s.funnel_id === f.id).length}
                  onSelect={() => { setSelectedId(f.id); setFunnelErr(null) }}
                  isDragging={draggingFunnel === f.id}
                  onDragStart={handleFunnelDragStart}
                  onDragEnd={limparDnD}
                  onError={setFunnelErr}
                />
              </div>
            ))}

            {funnelErr && (
              <p style={{ fontSize: 11.5, color: 'var(--warning)', fontWeight: 700 }}>
                {funnelErr}
              </p>
            )}

            {arquivados > 0 && (
              <button
                type="button"
                onClick={() => setMostrarArquivados(v => !v)}
                style={{
                  alignSelf: 'flex-start', border: 'none', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 700,
                  cursor: 'pointer', padding: '2px 3px',
                }}
              >
                {mostrarArquivados ? 'Ocultar' : 'Mostrar'} arquivados ({arquivados})
              </button>
            )}

            <form action={funnelAction} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input type="hidden" name="_slug" value={slug} />
              <input
                name="name" type="text" className="field"
                placeholder="Nome do funil" required
                style={{ flex: 1, minWidth: 0 }}
              />
              <button type="submit" disabled={funnelPending} className="btn-primary" style={{ flexShrink: 0 }}>
                <Plus size={14} />
                {funnelPending ? '…' : 'Criar'}
              </button>
            </form>

            {funnelState?.error && (
              <p style={{ fontSize: 11.5, color: 'var(--warning)', fontWeight: 700 }}>
                {funnelState.error}
              </p>
            )}
            <p style={{ fontSize: 10.5, color: 'var(--text-faint)', lineHeight: 1.45 }}>
              O funil novo já vem com quatro etapas, que você renomeia ou remove.
            </p>
          </div>

          {/* -- Detalhe: etapas do funil selecionado -- */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="overline" style={{ marginBottom: 2 }}>
              ETAPAS DE {(selecionado?.name ?? '').toUpperCase()}
            </p>

            {etapasDoFunil.map((stage, idx) => (
              <div
                key={stage.id}
                onDragEnter={e => handleEnter(e, `s${idx}`, setOverStageIdx, idx)}
                onDragLeave={() => handleLeave(`s${idx}`, () => setOverStageIdx(null))}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleStageDrop(e, idx)}
                style={{
                  outline: overStageIdx === idx && draggingStage !== stage.id
                    ? '2px dashed var(--brand)' : '2px solid transparent',
                  borderRadius: 12,
                  transition: 'outline 100ms',
                }}
              >
                <StageRow
                  stage={stage}
                  slug={slug}
                  isDragging={draggingStage === stage.id}
                  onDragStart={handleStageDragStart}
                  onDragEnd={limparDnD}
                />
              </div>
            ))}

            <div style={{ marginTop: 8, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
              <p className="overline" style={{ marginBottom: 10 }}>NOVA ETAPA</p>
              <form action={stageAction} style={{ display: 'flex', gap: 8 }}>
                <input type="hidden" name="_slug"     value={slug} />
                <input type="hidden" name="_funnelId" value={selecionado?.id ?? ''} />
                <input
                  name="name" type="text" className="field"
                  placeholder="Nome da etapa" required
                  style={{ flex: 1, minWidth: 0 }}
                />
                <select name="outcome" className="field" defaultValue="OPEN" style={{ width: 118, flexShrink: 0 }}>
                  {OUTCOME_VALUES.map(v => (
                    <option key={v} value={v}>{OUTCOME_COPY[v].label}</option>
                  ))}
                </select>
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
                <button type="submit" disabled={stagePending} className="btn-primary" style={{ flexShrink: 0 }}>
                  <Plus size={14} />
                  {stagePending ? '…' : 'Adicionar'}
                </button>
              </form>

              {stageState?.error && (
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--warning)', fontWeight: 700 }}>
                  {stageState.error}
                </p>
              )}
              {stageState?.success && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={13} /> Etapa adicionada.
                </div>
              )}
            </div>
          </div>
        </div>
      </dialog>
    </>
  )
}
