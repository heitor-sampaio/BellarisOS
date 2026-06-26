'use client'

import { useRef, useState, useEffect } from 'react'
import { Pencil, RotateCcw, Check } from 'lucide-react'

interface Props {
  onConfirm: (dataUrl: string) => void
  disabled?: boolean
  confirmedAt?: string | null
}

export function SignaturePad({ onConfirm, disabled, confirmedAt }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing]     = useState(false)
  const [hasLines, setHasLines]   = useState(false)
  const [confirmed, setConfirmed] = useState(!!confirmedAt)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1a1a1a'
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
    if (disabled || confirmed) return
    e.preventDefault()
    const canvas = canvasRef.current!
    setDrawing(true)
    setHasLines(true)
    lastPos.current = getPos(e, canvas)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing || disabled || confirmed) return
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
    setDrawing(false)
    lastPos.current = null
  }

  function clear() {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasLines(false)
    setConfirmed(false)
  }

  function confirm() {
    const canvas  = canvasRef.current!
    const dataUrl = canvas.toDataURL('image/png')
    setConfirmed(true)
    onConfirm(dataUrl)
  }

  if (confirmed) {
    return (
      <div style={{
        border: '1px solid var(--hairline)', borderRadius: 12, padding: '16px 20px',
        background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: '#22c55e',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Check size={18} color="#fff" />
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 13, color: '#15803d' }}>Assinatura confirmada</p>
          {confirmedAt && (
            <p style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>
              {new Date(confirmedAt).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{
        position: 'relative', border: '1.5px dashed var(--border)', borderRadius: 12,
        background: '#fafaf9', overflow: 'hidden',
      }}>
        {!hasLines && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: 8,
          }}>
            <Pencil size={20} style={{ color: 'var(--text-faint)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
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
            background: 'var(--surface)', fontSize: 13, fontWeight: 600,
            color: hasLines ? 'var(--text)' : 'var(--text-faint)',
            cursor: hasLines ? 'pointer' : 'not-allowed',
          }}
        >
          <RotateCcw size={14} /> Limpar
        </button>

        <button
          type="button"
          onClick={confirm}
          disabled={!hasLines}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            border: hasLines ? 'none' : '1px solid var(--border)',
            background: hasLines ? 'var(--brand)' : 'var(--bg-app)',
            color: hasLines ? '#fff' : 'var(--text-faint)',
            fontSize: 13, fontWeight: 700,
            cursor: hasLines ? 'pointer' : 'not-allowed',
            boxShadow: hasLines ? '0 1px 8px rgba(195,77,107,0.25)' : 'none',
          }}
        >
          <Check size={14} /> Confirmar assinatura
        </button>
      </div>
    </div>
  )
}
