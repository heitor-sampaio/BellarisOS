'use client'

import { useRef, useState } from 'react'
import { Trash2, Check, Syringe } from 'lucide-react'
import { FaceOutline, FACE_VIEWBOX } from '@/components/shared/face-outline'
import {
  INJECTABLE_UNITS, emptyInjectableMap, injectableTotals, newId,
  type InjectableMapValue, type InjectablePoint, type InjectableUnit,
} from '@/lib/anamnesis'

// O alvo de toque é bem maior que o ponto desenhado: a tela de atendimento é
// usada em tablet e celular, e ponto de injetável é marcação precisa — o
// marcador não pode cobrir a região que se está mirando.
const HIT_R = 13
const DOT_R = 5.8

interface Props {
  value:    InjectableMapValue | undefined
  /** Produtos oferecidos por esta ficha (as opções do campo). */
  products: string[]
  canEdit:  boolean
  onChange: (v: InjectableMapValue) => void
}

export function InjectableMapField({ value, products, canEdit, onChange }: Props) {
  const map = value ?? emptyInjectableMap()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const confirmed = !!map.confirmedAt
  const totals    = injectableTotals(map)

  function update(next: Partial<InjectableMapValue>) {
    onChange({ ...map, ...next })
  }

  function updatePoint(id: string, patch: Partial<InjectablePoint>) {
    update({ points: map.points.map(p => (p.id === id ? { ...p, ...patch } : p)) })
  }

  /** Converte a posição do ponteiro para 0..1 dentro do viewBox. */
  function toRelative(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  function handleSurfaceClick(e: React.MouseEvent) {
    if (!canEdit || dragId) return
    const rel = toRelative(e)
    if (!rel) return
    const point: InjectablePoint = {
      id: newId(), x: rel.x, y: rel.y,
      product: products[0] ?? '',
      dose: 0,
      unit: 'UI',
      applied: confirmed ? 0 : null,
    }
    update({ points: [...map.points, point] })
    setSelectedId(point.id)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragId) return
    const rel = toRelative(e)
    if (rel) updatePoint(dragId, rel)
  }

  function confirmApplication() {
    update({
      confirmedAt: new Date().toISOString(),
      // A dose aplicada nasce igual à planejada; ajustar ponto a ponto é comum
      // (sobra ou falta produto), e é isso que o registro precisa refletir.
      points: map.points.map(p => ({ ...p, applied: p.applied ?? p.dose })),
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="rg-2" style={{ alignItems: 'start' }}>
        {/* -- Rosto -------------------------------------------------- */}
        <div style={{
          background: 'var(--bg-app)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card-sm)', padding: 12,
        }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${FACE_VIEWBOX.width} ${FACE_VIEWBOX.height}`}
            style={{
              width: '100%', height: 'auto', display: 'block', touchAction: 'none',
              cursor: canEdit ? 'crosshair' : 'default',
              color: 'var(--text-faint)',
            }}
            onClick={handleSurfaceClick}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDragId(null)}
            onPointerLeave={() => setDragId(null)}
          >
            <FaceOutline />

            {map.points.map((p, i) => {
              const cx = p.x * FACE_VIEWBOX.width
              const cy = p.y * FACE_VIEWBOX.height
              const isSelected = p.id === selectedId
              const isApplied  = p.applied !== null
              return (
                <g
                  key={p.id}
                  style={{ cursor: canEdit ? 'grab' : 'pointer' }}
                  onClick={e => { e.stopPropagation(); setSelectedId(p.id) }}
                  onPointerDown={e => { if (canEdit) { e.stopPropagation(); setDragId(p.id) } }}
                >
                  {/* Alvo invisível, maior que o ponto, para o toque acertar. */}
                  <circle cx={cx} cy={cy} r={HIT_R} fill="transparent" />
                  <circle
                    cx={cx} cy={cy} r={DOT_R}
                    // Vazado = planejado, preenchido = aplicado. É a leitura
                    // instantânea do que ainda falta.
                    fill={isApplied ? 'var(--brand)' : 'var(--surface)'}
                    stroke="var(--brand)"
                    strokeWidth={isSelected ? 3 : 1.8}
                  />
                  <text
                    x={cx} y={cy + 2.6} textAnchor="middle"
                    style={{
                      fontSize: 7, fontWeight: 800, pointerEvents: 'none',
                      fill: isApplied ? 'var(--on-brand)' : 'var(--brand)',
                    }}
                  >
                    {i + 1}
                  </text>
                </g>
              )
            })}
          </svg>

          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', textAlign: 'center', marginTop: 6 }}>
            {canEdit
              ? 'Clique no rosto para marcar um ponto. Arraste para reposicionar.'
              : `${map.points.length} ${map.points.length === 1 ? 'ponto marcado' : 'pontos marcados'}`}
          </p>
        </div>

        {/* -- Lista e edição ----------------------------------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {map.points.length === 0 && (
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
              Nenhum ponto marcado ainda.
            </p>
          )}

          {map.points.map((p, i) => (
            <PointRow
              key={p.id}
              index={i}
              point={p}
              products={products}
              canEdit={canEdit}
              confirmed={confirmed}
              selected={p.id === selectedId}
              onSelect={() => setSelectedId(p.id)}
              onChange={patch => updatePoint(p.id, patch)}
              onRemove={() => {
                update({ points: map.points.filter(x => x.id !== p.id) })
                if (selectedId === p.id) setSelectedId(null)
              }}
            />
          ))}

          {totals.length > 0 && (
            <div style={{
              borderTop: '1px solid var(--hairline)', paddingTop: 10, marginTop: 2,
            }}>
              <span className="overline">Total</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {totals.map(t => (
                  <div key={`${t.product}|${t.unit}`} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 12,
                    fontSize: 'var(--text-xs-sz)',
                  }}>
                    <span style={{ color: 'var(--text)' }}>{t.product}</span>
                    <span style={{ fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
                      {confirmed
                        ? <>{fmt(t.applied)} {t.unit} <span style={{ color: 'var(--text-faint)', fontWeight: 'var(--weight-regular)' }}>(plano {fmt(t.planned)})</span></>
                        : <>{fmt(t.planned)} {t.unit}</>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canEdit && map.points.length > 0 && (
            confirmed ? (
              <p style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 'var(--text-2xs)', color: 'var(--success)', fontWeight: 'var(--weight-semibold)',
              }}>
                <Check size={13} /> Aplicação confirmada. Ajuste a dose aplicada se precisar.
              </p>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={confirmApplication}
                style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Syringe size={14} /> Confirmar aplicação
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function PointRow({
  index, point, products, canEdit, confirmed, selected, onSelect, onChange, onRemove,
}: {
  index: number
  point: InjectablePoint
  products: string[]
  canEdit: boolean
  confirmed: boolean
  selected: boolean
  onSelect: () => void
  onChange: (patch: Partial<InjectablePoint>) => void
  onRemove: () => void
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '8px 10px', borderRadius: 'var(--radius-row)',
        background: selected ? 'var(--brand-soft)' : 'var(--surface)',
        border: `1.5px solid ${selected ? 'var(--brand-soft-border)' : 'var(--border)'}`,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          background: 'var(--brand)', color: 'var(--on-brand)',
          fontSize: 10, fontWeight: 'var(--weight-extrabold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {index + 1}
        </span>

        {canEdit ? (
          <input
            list={`inj-products-${point.id}`}
            value={point.product}
            onChange={e => onChange({ product: e.target.value })}
            placeholder="Produto"
            className="field"
            style={{ flex: 1, minWidth: 0, padding: '5px 8px', fontSize: 'var(--text-xs-sz)' }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: 'var(--text-xs-sz)', color: 'var(--text)' }}>
            {point.product || '—'}
          </span>
        )}

        <datalist id={`inj-products-${point.id}`}>
          {products.map(p => <option key={p} value={p} />)}
        </datalist>

        {canEdit && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onRemove() }}
            title="Remover ponto"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              lineHeight: 0, color: 'var(--text-faint)', flexShrink: 0,
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <DoseInput
          label="Plano"
          value={point.dose}
          canEdit={canEdit}
          onChange={dose => onChange({ dose })}
        />
        {confirmed && (
          <DoseInput
            label="Aplicado"
            value={point.applied ?? 0}
            canEdit={canEdit}
            onChange={applied => onChange({ applied })}
          />
        )}
        {canEdit ? (
          <select
            value={point.unit}
            onChange={e => onChange({ unit: e.target.value as InjectableUnit })}
            className="field"
            style={{ width: 68, padding: '5px 6px', fontSize: 'var(--text-xs-sz)' }}
          >
            {INJECTABLE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{point.unit}</span>
        )}
      </div>
    </div>
  )
}

function DoseInput({
  label, value, canEdit, onChange,
}: {
  label: string
  value: number
  canEdit: boolean
  onChange: (v: number) => void
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={e => e.stopPropagation()}>
      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>
        {label}
      </span>
      {canEdit ? (
        <input
          type="number" step="0.01" min="0"
          value={Number.isFinite(value) ? value : 0}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="field"
          style={{ width: 64, padding: '5px 6px', fontSize: 'var(--text-xs-sz)' }}
        />
      ) : (
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text)', fontWeight: 'var(--weight-bold)' }}>
          {fmt(value)}
        </span>
      )}
    </label>
  )
}

/** Sem casas decimais quando é inteiro: "4 UI", não "4,00 UI". */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}
