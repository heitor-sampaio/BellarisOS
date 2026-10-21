'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

/**
 * O aviso de que deu certo, no rodapé da tela (2026-10-21): confirmar,
 * registrar a chegada ou remarcar fechavam a janela do agendamento sem dizer
 * nada (atrito da simulação de um dia de clínica). Some sozinho.
 */
export function useAviso(duracaoMs = 4000): [string | null, (texto: string) => void] {
  const [aviso, setAviso] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const avisar = useCallback((texto: string) => {
    if (timer.current) clearTimeout(timer.current)
    setAviso(texto)
    timer.current = setTimeout(() => setAviso(null), duracaoMs)
  }, [duracaoMs])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return [aviso, avisar]
}

export function AvisoFlutuante({ texto }: { texto: string | null }) {
  if (!texto) return null
  return (
    <div role="status" style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, background: 'var(--success)', color: 'var(--surface)', padding: '10px 18px',
      borderRadius: 10, fontWeight: 700, fontSize: 'var(--text-sm-sz)',
      boxShadow: 'var(--shadow-popover)', pointerEvents: 'none',
      display: 'flex', alignItems: 'center', gap: 8, maxWidth: 'calc(100vw - 32px)',
    }}>
      <CheckCircle2 size={15} aria-hidden="true" /> {texto}
    </div>
  )
}
