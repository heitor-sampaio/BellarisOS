'use client'

import { useRef, useState } from 'react'
import { Trash2, Check, Syringe, Plus, Minus, Maximize2 } from 'lucide-react'
import { FaceOutline, FACE_VIEWBOX } from '@/components/shared/face-outline'
import {
  INJECTABLE_UNITS, emptyInjectableMap, injectableTotals, newId,
  type InjectableMapValue, type InjectablePoint, type InjectableUnit,
} from '@/lib/anamnesis'

/**
 * Aplicação de toxina tem pontos a poucos milímetros um do outro, então o
 * marcador precisa ser pequeno: bolinha grande cobre a região que se está
 * mirando e vira uma mancha só quando há vários pontos juntos.
 *
 * O alvo de clique também é modesto — antes ele tinha mais que o dobro do raio
 * do ponto, e pontos vizinhos roubavam o clique um do outro.
 */
const DOT_R = 3.2
const HIT_R = 6.5

interface Props {
  value:    InjectableMapValue | undefined
  /** Produtos oferecidos por esta ficha (as opções do campo). */
  products: string[]
  canEdit:  boolean
  onChange: (v: InjectableMapValue) => void
}

const ZOOM_MIN  = 1
const ZOOM_MAX  = 6
const ZOOM_STEP = 1.5
/** Arrasto abaixo disso (em unidades do viewBox) conta como clique, não pan. */
const PAN_LIMIAR = 1.5

export function InjectableMapField({ value, products, canEdit, onChange }: Props) {
  const map = value ?? emptyInjectableMap()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  // Zoom só na ilustração: aproximar é o que permite marcar ponto a poucos
  // milímetros do vizinho sem depender de um marcador minúsculo.
  const [zoom, setZoom]       = useState(1)
  const [pan, setPan]         = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const panRef = useRef<{ x: number; y: number; panX: number; panY: number; moveu: boolean } | null>(null)

  const { width: W, height: H } = FACE_VIEWBOX
  const janelaW = W / zoom
  const janelaH = H / zoom
  // Escala inversa do zoom: o marcador mantém o tamanho na tela enquanto o
  // rosto cresce. Sem isto, aproximar ampliaria a bolinha junto e não ganharia
  // precisão nenhuma.
  const s = 1 / zoom

  const confirmed = !!map.confirmedAt
  const totals    = injectableTotals(map)

  function limitarPan(p: { x: number; y: number }, z = zoom) {
    return {
      x: Math.min(Math.max(0, p.x), W - W / z),
      y: Math.min(Math.max(0, p.y), H - H / z),
    }
  }

  /** Aproxima/afasta mantendo fixo o centro do que está visível. */
  function aplicarZoom(novo: number) {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novo))
    const cx = pan.x + janelaW / 2
    const cy = pan.y + janelaH / 2
    setZoom(z)
    setPan(limitarPan({ x: cx - W / z / 2, y: cy - H / z / 2 }, z))
  }

  function update(next: Partial<InjectableMapValue>) {
    onChange({ ...map, ...next })
  }

  function updatePoint(id: string, patch: Partial<InjectablePoint>) {
    update({ points: map.points.map(p => (p.id === id ? { ...p, ...patch } : p)) })
  }

  /**
   * Posição do ponteiro em 0..1 da imagem inteira — precisa passar pela janela
   * visível, senão com zoom o ponto cai no lugar errado.
   */
  function toRelative(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    const fx = (e.clientX - rect.left) / rect.width
    const fy = (e.clientY - rect.top) / rect.height
    return {
      x: Math.min(1, Math.max(0, (pan.x + fx * janelaW) / W)),
      y: Math.min(1, Math.max(0, (pan.y + fy * janelaH) / H)),
    }
  }

  function handleSurfaceClick(e: React.MouseEvent) {
    // Arrastar o fundo é pan, não criação de ponto.
    if (panRef.current?.moveu) return
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

  function handlePointerDown(e: React.PointerEvent) {
    // Só o fundo chega aqui: os pontos param a propagação.
    if (zoom === ZOOM_MIN) return
    panRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moveu: false }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragId) {
      const rel = toRelative(e)
      if (rel) updatePoint(dragId, rel)
      return
    }
    const p = panRef.current
    if (!p) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const dx = ((e.clientX - p.x) / rect.width) * janelaW
    const dy = ((e.clientY - p.y) / rect.height) * janelaH
    if (Math.abs(dx) > PAN_LIMIAR || Math.abs(dy) > PAN_LIMIAR) {
      p.moveu = true
      setPanning(true)
    }
    setPan(limitarPan({ x: p.panX - dx, y: p.panY - dy }))
  }

  function encerrarArrasto() {
    setDragId(null)
    setPanning(false)
    // O clique dispara depois do pointerup; a flag precisa sobreviver até lá.
    if (panRef.current) setTimeout(() => { panRef.current = null }, 0)
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
          borderRadius: 'var(--radius-card-sm)', padding: 12, position: 'relative',
        }}>
          {/* Controles sobre a imagem: aproximar é o que dá precisão em região
              densa, sem depender de um marcador minúsculo. */}
          <div style={{
            position: 'absolute', top: 16, right: 16, zIndex: 1,
            display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-field-token)',
          }}>
            <BotaoZoom
              titulo="Afastar"
              desabilitado={zoom <= ZOOM_MIN}
              onClick={() => aplicarZoom(zoom / ZOOM_STEP)}
            >
              <Minus size={13} />
            </BotaoZoom>
            <span style={{
              minWidth: 30, textAlign: 'center', fontSize: 'var(--text-2xs)',
              fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)',
            }}>
              {Math.round(zoom * 100)}%
            </span>
            <BotaoZoom
              titulo="Aproximar"
              desabilitado={zoom >= ZOOM_MAX}
              onClick={() => aplicarZoom(zoom * ZOOM_STEP)}
            >
              <Plus size={13} />
            </BotaoZoom>
            {zoom > ZOOM_MIN && (
              <BotaoZoom
                titulo="Enquadrar o rosto inteiro"
                onClick={() => { setZoom(ZOOM_MIN); setPan({ x: 0, y: 0 }) }}
              >
                <Maximize2 size={12} />
              </BotaoZoom>
            )}
          </div>

          <svg
            ref={svgRef}
            viewBox={`${pan.x} ${pan.y} ${janelaW} ${janelaH}`}
            style={{
              width: '100%', height: 'auto', display: 'block', touchAction: 'none',
              // Cruz sempre que dá para marcar: a mão aparecia justamente com
              // zoom, que é quando se está mirando um ponto preciso. Ela só
              // volta enquanto o fundo está sendo arrastado de fato.
              cursor: panning ? 'grabbing'
                : canEdit ? 'crosshair'
                : zoom > ZOOM_MIN ? 'grab' : 'default',
              color: 'var(--text-faint)',
            }}
            onClick={handleSurfaceClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={encerrarArrasto}
            onPointerLeave={encerrarArrasto}
          >
            <FaceOutline />

            {map.points.map((p, i) => {
              const cx = p.x * W
              const cy = p.y * H
              const isSelected = p.id === selectedId
              const isApplied  = p.applied !== null
              return (
                <g
                  key={p.id}
                  // Sobre um ponto não se marca, se move ou seleciona — a mão
                  // aqui é o que diferencia ponto de área livre.
                  style={{ cursor: dragId === p.id ? 'grabbing' : canEdit ? 'grab' : 'pointer' }}
                  onClick={e => { e.stopPropagation(); setSelectedId(p.id) }}
                  onPointerDown={e => { if (canEdit) { e.stopPropagation(); setDragId(p.id) } }}
                >
                  {/* Alvo invisível, um pouco maior que o ponto. */}
                  <circle cx={cx} cy={cy} r={HIT_R * s} fill="transparent" />

                  {/* Halo do selecionado: identifica sem engordar o ponto. */}
                  {isSelected && (
                    <circle
                      cx={cx} cy={cy} r={(DOT_R + 3) * s}
                      fill="none" stroke="var(--brand)" strokeWidth={1 * s} opacity={0.55}
                    />
                  )}

                  <circle
                    cx={cx} cy={cy} r={DOT_R * s}
                    // Vazado = planejado, preenchido = aplicado. É a leitura
                    // instantânea do que ainda falta.
                    fill={isApplied ? 'var(--brand)' : 'var(--surface)'}
                    stroke="var(--brand)"
                    strokeWidth={1.4 * s}
                  />

                  {/* O número sai de dentro do ponto e vira etiqueta ao lado, só
                      no selecionado: numerar todos, num mapa denso, empilha
                      rótulo sobre rótulo e esconde o próprio desenho. */}
                  {isSelected && (
                    <g pointerEvents="none">
                      <rect
                        x={cx + 4 * s} y={cy - 11 * s}
                        width={(7 + (String(i + 1).length - 1) * 4) * s} height={9 * s} rx={2.5 * s}
                        fill="var(--brand)"
                      />
                      <text
                        x={cx + (4 + (7 + (String(i + 1).length - 1) * 4) / 2) * s} y={cy - 4.2 * s}
                        textAnchor="middle"
                        style={{ fontSize: 6.5 * s, fontWeight: 800, fill: 'var(--on-brand)' }}
                      >
                        {i + 1}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>

          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', textAlign: 'center', marginTop: 6 }}>
            {canEdit
              ? zoom > ZOOM_MIN
                ? 'Clique para marcar. Arraste o fundo para deslocar a imagem.'
                : 'Clique para marcar. Aproxime para marcar pontos muito próximos.'
              : `${map.points.length} ${map.points.length === 1 ? 'ponto marcado' : 'pontos marcados'} · toque para identificar`}
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

function BotaoZoom({
  children, titulo, desabilitado, onClick,
}: {
  children: React.ReactNode
  titulo: string
  desabilitado?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      disabled={desabilitado}
      // O SVG do rosto fica abaixo: sem parar a propagação, aproximar também
      // marcaria um ponto.
      onClick={e => { e.stopPropagation(); onClick() }}
      onPointerDown={e => e.stopPropagation()}
      style={{
        width: 24, height: 24, borderRadius: 'calc(var(--radius-field-token) - 3px)',
        border: 'none', background: 'transparent',
        color: desabilitado ? 'var(--text-faint)' : 'var(--brand)',
        cursor: desabilitado ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
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
