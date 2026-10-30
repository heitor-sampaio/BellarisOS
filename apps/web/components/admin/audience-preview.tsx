'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { Users, Smartphone } from 'lucide-react'
import { previewAudienceCount } from '@/actions/notification-campaigns'
import type { AudienceRules } from '@/actions/notification-campaigns'

interface Props {
  rules: AudienceRules
}

/**
 * O tamanho do público e quantas RECEBEM (D-3, 2026-10-30).
 *
 * A campanha é aviso no celular: só chega a quem tem o app (ou os avisos do
 * navegador ligados). Mostrar só "~120 clientes" fazia a clínica achar que
 * falava com as 120 — e chegava a 15. Os dois números vêm do servidor, com o
 * mesmo filtro do disparo.
 */
export function AudiencePreview({ rules }: Props) {
  const [conta, setConta] = useState<{ count: number; comAparelho: number } | null>(null)
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A dependência é o TEXTO das regras: o pai monta um objeto novo a cada
  // render, e pela identidade a contagem seria pedida o tempo todo.
  const chaveDasRegras = JSON.stringify(rules)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await previewAudienceCount(JSON.parse(chaveDasRegras) as typeof rules)
        setConta(res)
      })
    }, 600)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [chaveDasRegras])

  const n = (x: number) => x.toLocaleString('pt-BR')

  return (
    <div data-testid="alcance-da-campanha" style={{
      display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '7px 14px', borderRadius: 'var(--radius-chip)',
      background: isPending ? 'var(--surface)' : 'var(--brand-soft)',
      border: '1px solid var(--border)',
      fontSize: 'var(--text-base-sz)', fontWeight: 'var(--weight-bold)',
      color: isPending ? 'var(--text-muted)' : 'var(--brand)',
      transition: 'background 200ms, color 200ms',
    }}>
      {isPending || !conta ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Users size={14} /> {isPending ? 'Calculando…' : 'Estimando público…'}
        </span>
      ) : (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Users size={14} /> {n(conta.count)} {conta.count === 1 ? 'cliente' : 'clientes'} no público
          </span>
          <span aria-hidden style={{ color: 'var(--text-faint)' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Smartphone size={14} />
            {conta.comAparelho === 0
              ? 'nenhuma tem o app para receber o aviso'
              : `${n(conta.comAparelho)} ${conta.comAparelho === 1 ? 'vai' : 'vão'} receber o aviso no celular`}
          </span>
        </>
      )}
    </div>
  )
}
