'use client'

import { useRef, useState, useEffect } from 'react'
import { Pencil, RotateCcw } from 'lucide-react'

interface Props {
  /**
   * O desenho a cada traço terminado (PNG), ou nulo ao limpar. Não há
   * "Confirmar assinatura" (J-62): o ato de assinar é o botão da tela, que
   * leva o desenho, o aceite e o hash juntos a `documento_assinar`.
   */
  onChange: (dataUrl: string | null) => void
  disabled?: boolean
}

export function SignaturePad({ onChange, disabled }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing]     = useState(false)
  const [hasLines, setHasLines]   = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = 'var(--text)'
    ctx.lineWidth   = 2
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
  }, [])

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0]!
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (disabled) return
    e.preventDefault()
    const canvas = canvasRef.current!
    setDrawing(true)
    setHasLines(true)
    lastPos.current = getPos(e, canvas)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing || disabled) return
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    const pos    = getPos(e, canvas)
    if (lastPos.current) {
      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }
    lastPos.current = pos
  }

  function stopDraw() {
    // O traço terminou: a tela passa a ter o desenho como está agora.
    if (drawing && hasLines && canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'))
    setDrawing(false)
    lastPos.current = null
  }

  function clear() {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasLines(false)
    onChange(null)
  }

  return (
    <div>
      <div style={{
        position: 'relative', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-field-token)',
        background: 'var(--bg-app)', overflow: 'hidden',
      }}>
        {!hasLines && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: 8,
          }}>
            <Pencil size={20} style={{ color: 'var(--text-faint)' }} />
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
              Assine aqui com o dedo ou mouse
            </span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={700}
          height={180}
          style={{ width: '100%', height: 180, display: 'block', cursor: 'crosshair', touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={clear}
          disabled={!hasLines}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface)', fontSize: 'var(--text-base-sz)', fontWeight: 600,
            color: hasLines ? 'var(--text)' : 'var(--text-faint)',
            cursor: hasLines ? 'pointer' : 'not-allowed',
          }}
        >
          <RotateCcw size={14} /> Limpar
        </button>
      </div>
    </div>
  )
}
